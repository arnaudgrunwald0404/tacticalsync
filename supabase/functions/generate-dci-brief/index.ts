import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Priority {
  text: string; category: string; tier_order: number;
  notes: string | null; status: string | null; flagged: boolean;
  created_at: string; updated_at: string;
}

interface DciLogRow {
  date: string; priority_1: string | null; priority_2: string | null;
  priority_3: string | null; topic_raised: string | null;
  weekly_obj_1: string | null; weekly_obj_2: string | null;
  weekly_obj_3: string | null;
  weekly_obj_1_activities: string[] | null;
  weekly_obj_2_activities: string[] | null;
  weekly_obj_3_activities: string[] | null;
  weekly_obj_1_status: string | null; weekly_obj_2_status: string | null;
  weekly_obj_3_status: string | null;
  notes: string | null;
}

interface GoogleCalEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean; responseStatus?: string }>;
  status?: string;
}

interface ClaudeBriefResponse {
  brief_markdown: string;
  priorities: string[];
  weekly_objectives: Array<{ title: string; activities: string[] }>;
  weekly_objective_statuses: string[] | null;
  suggested_topic: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPtDate(): { date: Date; dayOfWeek: number; isMonday: boolean; isThursdayOrFriday: boolean; dateStr: string; dayLabel: string } {
  // Use Intl to get the date in PT
  const now = new Date()
  const ptStr = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  const ptDate = new Date(ptStr)
  const dayOfWeek = ptDate.getDay()
  const dateStr = ptDate.toISOString().slice(0, 10)
  const dayLabel = ptDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })
  return {
    date: ptDate, dayOfWeek,
    isMonday: dayOfWeek === 1,
    isThursdayOrFriday: dayOfWeek === 4 || dayOfWeek === 5,
    dateStr, dayLabel,
  }
}

function formatCalendarTime(event: GoogleCalEvent): string {
  const start = event.start?.dateTime ?? event.start?.date
  if (!start) return '?'
  if (!event.start?.dateTime) return 'All day'
  const d = new Date(start)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles',
  })
}

function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen) + '...'
}

/**
 * Convert full markdown to Slack-friendly mrkdwn.
 * Slack uses *bold*, _italic_, ~strikethrough~, and doesn't support # headings.
 */
function markdownToSlack(md: string): string {
  return md
    // Headers → bold
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    // Bold markers
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // Horizontal rules → divider
    .replace(/^---+$/gm, '───────────────')
    // Tables: just pass through (Slack renders them ok-ish in mono blocks)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Generate DCI Brief.
 *
 * Two invocation modes:
 * 1. **Batch mode** (service-role key as JWT + `_batch_user_id` in body):
 *    Called by daily-prep-batch for a specific user. Integrations are already
 *    synced by the batch caller — no redundant syncing.
 * 2. **User mode** (user JWT): manual "Run now" trigger from the UI.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const startMs = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

    if (!anthropicApiKey) {
      return jsonResponse({ error: 'anthropic_api_key_not_configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'missing_authorization' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Parse body
    let body: { _batch_user_id?: string; mode?: string }
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    // Resolve user ID
    let userId: string
    if (jwt === serviceRoleKey && body._batch_user_id) {
      userId = body._batch_user_id
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      userId = userData.user.id
    }

    // ── Load user DCI settings ──────────────────────────────────────────
    const { data: dciSettings } = await supabase
      .from('cos_prep_schedule')
      .select('dci_sources, dci_instructions')
      .eq('user_id', userId)
      .maybeSingle()

    const enabledSources = new Set<string>(
      (dciSettings?.dci_sources as string[] | null) ?? ['my_lists', 'rcdo', 'calendar', 'slack', 'zoom', 'commitments']
    )
    const userInstructions: string = (dciSettings?.dci_instructions as string | null) ?? ''

    // ── Date context ──────────────────────────────────────────────────────
    const pt = getPtDate()
    const dataSources: string[] = []
    const errors: Array<{ source: string; error: string }> = []

    // ── Gather data in parallel ───────────────────────────────────────────

    const todayDate = pt.dateStr

    // Helper: return an empty-result promise when a source is disabled
    const emptyResult = () => Promise.resolve({ data: null, error: null })

    const [
      prioritiesRes,
      dciLogsRes,
      teamMembersRes,
      quarterRes,
      slackMessagesRes,
      zoomRecordingsRes,
    ] = await Promise.all([
      // 1. My Lists (always fetched — core source)
      enabledSources.has('my_lists')
        ? supabase
            .from('cos_priorities')
            .select('text, category, tier_order, notes, status, flagged, created_at, updated_at')
            .eq('user_id', userId)
            .is('done_at', null)
            .is('archived_at', null)
            .order('category')
            .order('tier_order')
        : emptyResult(),
      // 2. Past DCI logs (always fetched — needed for continuity)
      supabase
        .from('cos_dci_logs')
        .select('date, priority_1, priority_2, priority_3, topic_raised, weekly_obj_1, weekly_obj_2, weekly_obj_3, weekly_obj_1_activities, weekly_obj_2_activities, weekly_obj_3_activities, weekly_obj_1_status, weekly_obj_2_status, weekly_obj_3_status, notes')
        .eq('user_id', userId)
        .gte('date', new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10))
        .order('date', { ascending: false }),
      // 3. Team members (for context)
      supabase
        .from('cos_team_members')
        .select('id, name, role, relationship_type')
        .eq('user_id', userId),
      // 4. Current quarter (gated by 'commitments' source)
      enabledSources.has('commitments')
        ? supabase
            .from('commitment_quarters')
            .select('id, label, start_date, end_date')
            .lte('start_date', todayDate)
            .gte('end_date', todayDate)
            .limit(1)
            .maybeSingle()
        : emptyResult(),
      // 5. Slack messages (gated by 'slack' source)
      enabledSources.has('slack')
        ? supabase
            .from('cos_slack_messages')
            .select('content, sender_name, channel_name, is_dm, message_date')
            .eq('user_id', userId)
            .gte('message_date', new Date(Date.now() - 2 * 86_400_000).toISOString())
            .order('message_date', { ascending: false })
            .limit(30)
        : emptyResult(),
      // 6. Zoom recordings (gated by 'zoom' source)
      enabledSources.has('zoom')
        ? supabase
            .from('cos_zoom_recordings')
            .select('id, topic, start_time, duration_minutes, has_transcript, ai_summary')
            .eq('user_id', userId)
            .gte('start_time', new Date(Date.now() - 3 * 86_400_000).toISOString())
            .order('start_time', { ascending: false })
            .limit(10)
        : emptyResult(),
    ])

    // ── Process: My Lists ─────────────────────────────────────────────────

    const priorities = (prioritiesRes.data ?? []) as Priority[]
    if (priorities.length > 0) dataSources.push('my_lists')

    // ── Process: Past DCI logs ────────────────────────────────────────────

    const dciLogs = (dciLogsRes.data ?? []) as DciLogRow[]
    if (dciLogs.length > 0) dataSources.push('past_dci')

    // ── Process: RCDO ─────────────────────────────────────────────────────

    let rcdoContext = ''
    if (enabledSources.has('rcdo')) try {
      // Get user's teams
      const { data: teamRows } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)
      const teamIds = (teamRows ?? []).map((r: { team_id: string }) => r.team_id)

      if (teamIds.length > 0) {
        const { data: rcdoRows } = await supabase
          .from('rc_defining_objectives')
          .select(`
            title, status, health, confidence_pct, display_order,
            rc_strategic_initiatives(title, status, description, display_order),
            rc_cycles!inner(status, team_id)
          `)
          .in('rc_cycles.status', ['active', 'locked'])
          .in('rc_cycles.team_id', teamIds)
          .order('display_order')

        if (rcdoRows && rcdoRows.length > 0) {
          dataSources.push('rcdo')
          const parts: string[] = []
          for (const doRow of rcdoRows as Array<{
            title: string; status: string; health: string | null;
            confidence_pct: number | null;
            rc_strategic_initiatives: Array<{ title: string; status: string; description: string | null }>;
          }>) {
            const healthLabel = doRow.health ? ` [${doRow.health}]` : ''
            const conf = doRow.confidence_pct != null ? ` (${doRow.confidence_pct}% confidence)` : ''
            parts.push(`  - DO: ${doRow.title}${healthLabel}${conf}`)
            const sis = doRow.rc_strategic_initiatives ?? []
            for (const si of sis) {
              parts.push(`    → SI: ${si.title} [${si.status}]${si.description ? ' — ' + truncate(si.description, 80) : ''}`)
            }
          }
          rcdoContext = parts.join('\n')
        }
      }
    } catch (err) {
      errors.push({ source: 'rcdo', error: (err as Error).message })
    }

    // ── Process: Quarterly priorities & monthly commitments ────────────────

    let quarterlyContext = ''
    if (quarterRes.data) {
      try {
        const q = quarterRes.data as { id: string; label: string; start_date: string }
        const qStart = new Date(q.start_date + 'T00:00:00')
        const monthNum = Math.min(3, Math.max(1, new Date().getMonth() - qStart.getMonth() + 1))

        const [priRes, comRes] = await Promise.all([
          supabase.from('quarterly_priorities').select('title, description, status')
            .eq('quarter_id', q.id).eq('user_id', userId).order('display_order'),
          supabase.from('monthly_commitments').select('title, description, status')
            .eq('quarter_id', q.id).eq('user_id', userId).eq('month_number', monthNum).order('display_order'),
        ])

        const qParts: string[] = []
        const qPri = (priRes.data ?? []) as Array<{ title: string; description: string | null; status: string }>
        if (qPri.length > 0) {
          dataSources.push('quarterly_priorities')
          qParts.push('Quarterly priorities:')
          qPri.forEach((p, i) => qParts.push(`  ${i + 1}. ${p.title}${p.description ? ' — ' + p.description : ''} [${p.status}]`))
        }
        const mCom = (comRes.data ?? []) as Array<{ title: string; description: string | null; status: string }>
        if (mCom.length > 0) {
          dataSources.push('monthly_commitments')
          qParts.push('Monthly commitments:')
          mCom.forEach((c, i) => qParts.push(`  ${i + 1}. ${c.title}${c.description ? ' — ' + c.description : ''} [${c.status}]`))
        }
        quarterlyContext = qParts.join('\n')
      } catch (err) {
        errors.push({ source: 'commitments', error: (err as Error).message })
      }
    }

    // ── Process: Google Calendar (ALL today's events) ──────────────────────

    let calendarContext = ''
    if (enabledSources.has('calendar'))
    try {
      const { data: creds } = await supabase
        .from('user_calendar_credentials')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', userId)
        .maybeSingle()

      if (creds?.refresh_token) {
        let accessToken = creds.access_token

        // Refresh if expired
        const needsRefresh = !creds.expires_at || (new Date(creds.expires_at).getTime() - Date.now() < 30_000)
        if (needsRefresh && googleClientId && googleClientSecret) {
          const form = new URLSearchParams()
          form.set('client_id', googleClientId)
          form.set('client_secret', googleClientSecret)
          form.set('refresh_token', creds.refresh_token)
          form.set('grant_type', 'refresh_token')

          const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
          })

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json() as { access_token?: string; expires_in?: number }
            if (refreshData.access_token) {
              accessToken = refreshData.access_token
              await supabase.from('user_calendar_credentials').update({
                access_token: accessToken,
                expires_at: new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString(),
              }).eq('user_id', userId)
            }
          }
        }

        // Fetch today's events from Google Calendar API
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date()
        todayEnd.setHours(23, 59, 59, 999)

        const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
        url.searchParams.set('timeMin', todayStart.toISOString())
        url.searchParams.set('timeMax', todayEnd.toISOString())
        url.searchParams.set('singleEvents', 'true')
        url.searchParams.set('orderBy', 'startTime')
        url.searchParams.set('maxResults', '50')

        const calRes = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (calRes.ok) {
          const calData = await calRes.json() as { items?: GoogleCalEvent[] }
          const events = (calData.items ?? []).filter(e => e.status !== 'cancelled')
          if (events.length > 0) {
            dataSources.push('calendar')
            const parts: string[] = []
            for (const evt of events) {
              const time = formatCalendarTime(evt)
              const title = evt.summary ?? 'Untitled'
              const attendees = (evt.attendees ?? [])
                .filter(a => !a.self)
                .map(a => a.displayName ?? a.email ?? '')
                .filter(Boolean)
                .slice(0, 5)
              parts.push(`  - ${time} | ${title} | ${attendees.join(', ') || 'No attendees listed'}`)
            }
            calendarContext = parts.join('\n')
          }
        } else {
          errors.push({ source: 'calendar', error: `Google API ${calRes.status}` })
        }
      }
    } catch (err) {
      errors.push({ source: 'calendar', error: (err as Error).message })
    }

    // ── Process: Slack messages ────────────────────────────────────────────

    let slackContext = ''
    const slackMessages = (slackMessagesRes.data ?? []) as Array<{
      content: string; sender_name: string | null; channel_name: string | null;
      is_dm: boolean; message_date: string;
    }>
    if (slackMessages.length > 0) {
      dataSources.push('slack')
      const parts: string[] = []
      for (const msg of slackMessages.slice(0, 20)) {
        const sender = msg.sender_name ?? 'unknown'
        const channel = msg.is_dm ? 'DM' : `#${msg.channel_name ?? 'channel'}`
        parts.push(`  - ${sender} (${channel}): ${truncate(msg.content, 200)}`)
      }
      slackContext = parts.join('\n')
    }

    // ── Process: Zoom recordings ──────────────────────────────────────────

    let zoomContext = ''
    const zoomRecordings = (zoomRecordingsRes.data ?? []) as Array<{
      id: string; topic: string | null; start_time: string;
      duration_minutes: number | null; has_transcript: boolean; ai_summary: string | null;
    }>
    if (zoomRecordings.length > 0) {
      dataSources.push('zoom')
      const parts: string[] = []
      let transcriptsIncluded = 0
      for (const rec of zoomRecordings.slice(0, 5)) {
        const date = new Date(rec.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const dur = rec.duration_minutes ? `${rec.duration_minutes}min` : ''
        parts.push(`  - "${rec.topic ?? 'Untitled'}" (${date}${dur ? ', ' + dur : ''})`)
        if (rec.ai_summary) {
          parts.push(`    Summary: ${truncate(rec.ai_summary, 400)}`)
        }
        if (rec.has_transcript && transcriptsIncluded < 2) {
          const { data: transcript } = await supabase
            .from('cos_zoom_transcripts')
            .select('content')
            .eq('recording_id', rec.id)
            .maybeSingle()
          if (transcript?.content) {
            parts.push(`    Transcript excerpt: "${truncate(transcript.content as string, 400)}"`)
            transcriptsIncluded++
          }
        }
      }
      zoomContext = parts.join('\n')
    }

    // ── Build Claude prompt ───────────────────────────────────────────────

    const systemPrompt = `You are a chief of staff AI generating a Daily Check-In (DCI) brief for a VP of Product at an HR technology SaaS company. The user leads multiple product pods, reports to the CEO, and sits on the executive leadership team.

CRITICAL RULES:
1. EXCLUSION: Omit ALL personal items — family, household, medical, dental, car, expense reports, personal errands. Every item must be something a VP of Product acts on professionally. If a calendar event or message looks personal, skip it.
2. PRIORITY HIERARCHY:
   - Weekly Objectives: ~60% My Lists + RCDO objectives, ~40% third-party signals
   - Today's Focus: ~40% My Lists, ~60% real-time signals (Slack, Zoom, calendar)
3. Flagged items (flagged=true) in My Lists are red-hot priorities — always surface them.
4. Items in 'now' category are highest urgency; 'this_week' next.
5. Be specific and actionable. No filler. Reference actual items by name.

You MUST respond with valid JSON (no markdown fences, no extra text) matching this structure:
{
  "brief_markdown": "full brief in markdown (see template)",
  "priorities": ["priority 1", "priority 2", "priority 3", "priority 4", "priority 5"],
  "weekly_objectives": [
    {"title": "objective title", "activities": ["activity 1", "activity 2", "activity 3"]}
  ],
  "weekly_objective_statuses": null,
  "suggested_topic": "topic for DCI standup"
}

NOTES:
- "priorities" = exactly 5 candidate items from Today's Focus, ranked by importance. The user will choose their top 3 from these.
- "weekly_objectives" = exactly 5 candidate objectives with 2-3 activities each, ranked by importance. The user will choose their top 3.
- "weekly_objective_statuses": ONLY on Thursday/Friday, array of "done" | "in_progress" | "blocked" | "deferred" for the top 3. Otherwise null.

BRIEF TEMPLATE for brief_markdown:

# DCI Brief — [Day], [Date]
Generated: [time] PT

---

## Today's Focus

### 1. [Title]
- **Source:** [Calendar | Slack | Zoom | My Lists | RCDO]
- **Why:** [1-2 sentences]
- **Action:** [Specific next action]

[exactly 5 items — user will select their top 3]

---

## Weekly Objectives

### 1. Objective: [Title]
Activities:
- [Activity 1]
- [Activity 2]
- [Activity 3]
- **Source:** [My Lists | RCDO | etc.]
- **Why:** [Why this week]

[exactly 5 objectives — user will select their top 3]

---

[ONLY on Thursday/Friday:]
## Weekly Commitments — Close Out

### 1. [Objective] — [✅ Done | 🔄 In Progress | ⚠️ At Risk | ❌ Missed]
- **Evidence:** [Signals]
- **To close:** [Remaining work]

---

## Today's Calendar

| Time (PT) | Meeting | Key People |
|-----------|---------|------------|
| ... | ... | ... |

---

## Slack Signals
- **[Person (context)]:** [One-line summary]

---

## Zoom Signals
- **[Meeting]:** [Key takeaway]

---

## Suggested DCI Topic
**[Topic].** [Why raise this in standup.]`

    // Append user-defined instructions to the system prompt
    const finalSystemPrompt = userInstructions
      ? `${systemPrompt}\n\nSTANDING INSTRUCTIONS FROM THE USER (always follow these):\n${userInstructions}`
      : systemPrompt

    // Build user prompt sections
    const userPromptParts: string[] = []

    userPromptParts.push(`Generate today's DCI brief. Today is ${pt.dayLabel}.`)
    if (pt.isMonday) {
      userPromptParts.push('It is Monday — set FRESH weekly objectives. Do not carry over last week.')
    } else if (pt.isThursdayOrFriday) {
      userPromptParts.push('It is Thursday/Friday — include the Weekly Commitments Close Out section with status for each weekly objective.')
    } else {
      userPromptParts.push('Carry forward weekly objectives from this week\'s earlier DCI logs.')
    }

    // My Lists
    if (priorities.length > 0) {
      userPromptParts.push('\n== MY LISTS (Primary Source) ==')
      const byCategory: Record<string, Priority[]> = {}
      for (const p of priorities) {
        const cat = p.category ?? 'other'
        if (!byCategory[cat]) byCategory[cat] = []
        byCategory[cat].push(p)
      }
      for (const [cat, items] of Object.entries(byCategory)) {
        userPromptParts.push(`[${cat.replace(/_/g, ' ')}]`)
        for (const item of items) {
          const flags: string[] = []
          if (item.flagged) flags.push('🔴 FLAGGED')
          if (item.status) flags.push(`status: ${item.status}`)
          const meta = flags.length > 0 ? ` (${flags.join(', ')})` : ''
          userPromptParts.push(`  - ${item.text}${meta}${item.notes ? ` — note: ${truncate(item.notes, 100)}` : ''}`)
        }
      }
    } else {
      userPromptParts.push('\n== MY LISTS ==\n(No active items)')
    }

    // RCDO
    if (rcdoContext) {
      userPromptParts.push('\n== RCDO OBJECTIVES (Quarterly Strategy) ==')
      userPromptParts.push(rcdoContext)
    }

    // Quarterly priorities
    if (quarterlyContext) {
      userPromptParts.push('\n== QUARTERLY & MONTHLY COMMITMENTS ==')
      userPromptParts.push(quarterlyContext)
    }

    // Past DCI logs
    if (dciLogs.length > 0) {
      userPromptParts.push('\n== PAST DCI LOGS (Last 7 Days) ==')
      for (const log of dciLogs.slice(0, 5)) {
        userPromptParts.push(`[${log.date}]`)
        if (log.priority_1) userPromptParts.push(`  P1: ${log.priority_1}`)
        if (log.priority_2) userPromptParts.push(`  P2: ${log.priority_2}`)
        if (log.priority_3) userPromptParts.push(`  P3: ${log.priority_3}`)
        if (log.topic_raised) userPromptParts.push(`  Topic: ${log.topic_raised}`)
        if (log.weekly_obj_1) {
          userPromptParts.push(`  Weekly objectives: ${log.weekly_obj_1}; ${log.weekly_obj_2 ?? ''}; ${log.weekly_obj_3 ?? ''}`)
          if (log.weekly_obj_1_status) {
            userPromptParts.push(`  Obj statuses: ${log.weekly_obj_1_status}, ${log.weekly_obj_2_status ?? ''}, ${log.weekly_obj_3_status ?? ''}`)
          }
        }
      }
    }

    // Calendar
    if (calendarContext) {
      userPromptParts.push('\n== TODAY\'S CALENDAR ==')
      userPromptParts.push(calendarContext)
    } else if (errors.some(e => e.source === 'calendar')) {
      userPromptParts.push('\n== TODAY\'S CALENDAR ==\n⚠️ Calendar unavailable')
    }

    // Slack
    if (slackContext) {
      userPromptParts.push('\n== RECENT SLACK MESSAGES (Last 48h) ==')
      userPromptParts.push(slackContext)
    }

    // Zoom
    if (zoomContext) {
      userPromptParts.push('\n== RECENT ZOOM MEETINGS (Last 3 Days) ==')
      userPromptParts.push(zoomContext)
    }

    // Missing sources note
    if (errors.length > 0) {
      userPromptParts.push(`\n== UNAVAILABLE SOURCES ==`)
      for (const e of errors) {
        userPromptParts.push(`⚠️ ${e.source}: ${e.error}`)
      }
    }

    // ── Call Claude API ───────────────────────────────────────────────────

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: finalSystemPrompt,
      messages: [{ role: 'user', content: userPromptParts.join('\n') }],
    })

    const rawText = message.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { type: string; text: string }) => b.text)
      .join('\n')

    const inputTokens = message.usage?.input_tokens ?? 0
    const outputTokens = message.usage?.output_tokens ?? 0

    // ── Parse response ────────────────────────────────────────────────────

    let parsed: ClaudeBriefResponse
    try {
      const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      // Fallback: use raw text as brief, extract what we can
      parsed = {
        brief_markdown: rawText,
        priorities: [],
        weekly_objectives: [],
        weekly_objective_statuses: null,
        suggested_topic: '',
      }
    }

    // ── Write to cos_dci_logs (upsert) ────────────────────────────────────

    const upsertData: Record<string, unknown> = {
      user_id: userId,
      date: todayDate,
      topic_raised: parsed.suggested_topic || null,
      notes: parsed.brief_markdown,
      brief_markdown: parsed.brief_markdown,
      brief_generated_at: new Date().toISOString(),
      data_sources_used: dataSources,
    }

    // Only write priorities when Claude returned them; never overwrite existing with null
    if (parsed.priorities.length > 0) {
      upsertData.priority_1 = parsed.priorities[0] ?? null
      upsertData.priority_2 = parsed.priorities[1] ?? null
      upsertData.priority_3 = parsed.priorities[2] ?? null
    }

    // On Monday: set weekly objectives
    if (pt.isMonday && parsed.weekly_objectives.length > 0) {
      const objs = parsed.weekly_objectives
      upsertData.weekly_obj_1 = objs[0]?.title ?? null
      upsertData.weekly_obj_2 = objs[1]?.title ?? null
      upsertData.weekly_obj_3 = objs[2]?.title ?? null
      upsertData.weekly_obj_1_activities = objs[0]?.activities ?? []
      upsertData.weekly_obj_2_activities = objs[1]?.activities ?? []
      upsertData.weekly_obj_3_activities = objs[2]?.activities ?? []
    }

    // On Thursday/Friday: set weekly objective statuses
    if (pt.isThursdayOrFriday && parsed.weekly_objective_statuses) {
      const validStatuses = new Set(['done', 'in_progress', 'blocked', 'deferred'])
      const statuses = parsed.weekly_objective_statuses
      if (statuses[0] && validStatuses.has(statuses[0])) upsertData.weekly_obj_1_status = statuses[0]
      if (statuses[1] && validStatuses.has(statuses[1])) upsertData.weekly_obj_2_status = statuses[1]
      if (statuses[2] && validStatuses.has(statuses[2])) upsertData.weekly_obj_3_status = statuses[2]
    }

    // Check if row exists, then insert or update
    const { data: existingRow } = await supabase
      .from('cos_dci_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('date', todayDate)
      .maybeSingle()

    let writeError: string | null = null
    if (existingRow) {
      const { error: updateErr } = await supabase
        .from('cos_dci_logs')
        .update(upsertData)
        .eq('id', existingRow.id)
      if (updateErr) writeError = updateErr.message
    } else {
      const { error: insertErr } = await supabase
        .from('cos_dci_logs')
        .insert(upsertData)
      if (insertErr) writeError = insertErr.message
    }

    // ── Send Slack DM ─────────────────────────────────────────────────────

    let slackSent = false
    // Check if user has dci_slack_dm enabled (default true)
    const { data: scheduleRow } = await supabase
      .from('cos_prep_schedule')
      .select('dci_slack_dm')
      .eq('user_id', userId)
      .maybeSingle()

    const shouldSendSlack = scheduleRow?.dci_slack_dm !== false

    if (shouldSendSlack) {
      try {
        const { data: slackCreds } = await supabase
          .from('user_slack_credentials')
          .select('access_token, slack_user_id')
          .eq('user_id', userId)
          .maybeSingle()

        if (slackCreds?.access_token && slackCreds?.slack_user_id) {
          // Build Slack message (keep under 4000 chars)
          let slackMsg = markdownToSlack(parsed.brief_markdown)
          if (slackMsg.length > 3800) {
            // Truncate: keep header + Today's Focus + Weekly Objectives + Topic
            const sections = slackMsg.split('───────────────')
            // Keep first 3 sections and last section (topic)
            if (sections.length > 4) {
              slackMsg = [...sections.slice(0, 3), '...', sections[sections.length - 1]].join('───────────────')
            }
            if (slackMsg.length > 3800) {
              slackMsg = slackMsg.slice(0, 3800) + '\n\n_...truncated. Full brief in TacticalSync._'
            }
          }

          const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${slackCreds.access_token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              channel: slackCreds.slack_user_id,
              text: `☀️ DCI Brief — ${pt.dayLabel}`,
              blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: slackMsg } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `_Generated at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })} PT by DCI Brief_` }] },
              ],
            }),
          })

          if (slackRes.ok) {
            const slackData = await slackRes.json()
            slackSent = slackData.ok === true
          }
        }
      } catch (err) {
        errors.push({ source: 'slack_dm', error: (err as Error).message })
      }
    }

    // ── Update schedule status ────────────────────────────────────────────

    const finishedAt = new Date().toISOString()
    await supabase.from('cos_prep_schedule').update({
      dci_last_run_at: finishedAt,
      dci_last_run_status: writeError ? 'partial' : 'ok',
    }).eq('user_id', userId)

    // ── Write run audit row ───────────────────────────────────────────────

    try {
      const isBatch = jwt === serviceRoleKey && body._batch_user_id
      await supabase.from('cos_dci_log').insert({
        user_id: userId,
        trigger_type: isBatch ? 'cron' : 'manual',
        started_at: new Date(startMs).toISOString(),
        finished_at: finishedAt,
        status: writeError ? 'failed' : 'ok',
        items_found: dataSources.length,
        items_surfaced: 0,
        error: writeError ?? null,
      })
    } catch { /* non-fatal */ }

    // ── Log generation for cost tracking ──────────────────────────────────

    try {
      await supabase.from('prep_generation_log').insert({
        user_id: userId,
        team_member_id: null,
        prep_id: null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        model: 'claude-sonnet-4-6',
        duration_ms: Date.now() - startMs,
        data_sources_used: ['dci_brief', ...dataSources],
      })
    } catch { /* non-fatal */ }

    return jsonResponse({
      brief_generated: true,
      data_sources_used: dataSources,
      slack_dm_sent: slackSent,
      db_write_error: writeError,
      errors: errors.length > 0 ? errors : undefined,
      token_usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      duration_ms: Date.now() - startMs,
    }, 200)

  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
