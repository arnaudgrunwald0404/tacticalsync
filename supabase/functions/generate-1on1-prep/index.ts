import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0"
import { getStackOneConfig, fetchStackOneEnrichment } from "../_shared/stackone.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface GeneratePrepRequest {
  team_member_id: string
  event_id?: string
  force_regenerate?: boolean
  /** Data sources to gather for this prep. Omitted = all (preserves prior behavior). */
  tools?: string[]
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

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

    if (!anthropicApiKey) {
      return jsonResponse({ error: 'anthropic_api_key_not_configured' }, 500)
    }

    // Auth — supports two modes:
    // 1. User JWT (normal client calls)
    // 2. Service-role key (batch/agent server-to-server calls with _batch_user_id)
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'missing_authorization' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Parse request body first (needed for _batch_user_id check)
    let body: GeneratePrepRequest & { _batch_user_id?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body' }, 400)
    }

    let userId: string

    if (jwt === serviceRoleKey && body._batch_user_id) {
      // Service-role call from daily-prep-batch or agent-tick
      userId = body._batch_user_id
    } else {
      // Normal user JWT flow
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      userId = userData.user.id
    }

    const { team_member_id, event_id, force_regenerate, tools } = body
    if (!team_member_id) {
      return jsonResponse({ error: 'team_member_id_required' }, 400)
    }

    // Effective toolset: undefined = gather everything (back-compat); otherwise
    // only the listed sources are gathered.
    const toolSet = Array.isArray(tools) ? new Set(tools) : null
    const toolEnabled = (id: string) => toolSet === null || toolSet.has(id)

    // Rate limit: 20 generations per user per day
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const { count: todayCount } = await supabase
      .from('prep_generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', dayStart.toISOString())

    if ((todayCount ?? 0) >= 20) {
      return jsonResponse({ error: 'rate_limit_exceeded', message: 'Max 20 AI preps per day' }, 429)
    }

    // Check for cached prep (within 4 hours) unless force
    const todayDate = new Date().toISOString().slice(0, 10)
    if (!force_regenerate) {
      const { data: cached } = await supabase
        .from('cos_one_on_one_prep')
        .select('id, content, source, generated_at, data_sources_used, status')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .eq('prep_date', todayDate)
        .eq('source', 'ai_generated')
        .eq('status', 'ready')
        .maybeSingle()

      if (cached) {
        const age = Date.now() - new Date(cached.generated_at).getTime()
        if (age < 4 * 60 * 60 * 1000) {
          return jsonResponse({
            prep_id: cached.id,
            content: cached.content,
            source: 'ai_generated',
            generated_at: cached.generated_at,
            data_sources_used: cached.data_sources_used,
            cached: true,
          }, 200)
        }
      }
    }

    // ── Gather internal data ───────────────────────────────────────────────

    const [
      memberRes,
      prioritiesRes,
      actionsRes,
      accountabilitiesRes,
      topicsRes,
      pastPrepsRes,
      prepSettingsRes,
      quarterRes,
      zoomRecordingsRes,
      slackMessagesRes,
      // Relationship Memory queries
      relTopicsRes,
      forgottenRes,
    ] = await Promise.all([
      supabase
        .from('cos_team_members')
        .select('id, name, role, relationship_type, context_notes, email, last_1on1_date')
        .eq('id', team_member_id)
        .eq('user_id', userId)
        .single(),
      supabase
        .from('cos_priorities')
        .select('text, category, notes')
        .eq('user_id', userId)
        .is('done_at', null)
        .is('archived_at', null)
        .order('tier_order'),
      supabase
        .from('cos_meeting_actions')
        .select('text, status, created_at, due_date')
        .eq('user_id', userId)
        .eq('member_id', team_member_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('cos_person_accountabilities')
        .select('text')
        .eq('member_id', team_member_id),
      supabase
        .from('cos_person_topics')
        .select('text')
        .eq('member_id', team_member_id),
      supabase
        .from('cos_one_on_one_prep')
        .select('content, source, generated_at, prep_date')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .eq('status', 'ready')
        .order('prep_date', { ascending: false })
        .limit(3),
      supabase
        .from('cos_prep_settings')
        .select('prep_instructions')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('commitment_quarters')
        .select('id, label, start_date, end_date')
        .lte('start_date', todayDate)
        .gte('end_date', todayDate)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('cos_zoom_recordings')
        .select('id, topic, start_time, duration_minutes, has_transcript, ai_summary')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .gte('start_time', new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order('start_time', { ascending: false })
        .limit(5),
      supabase
        .from('cos_slack_messages')
        .select('content, sender_name, channel_name, is_dm, message_date')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .gte('message_date', new Date(Date.now() - 14 * 86_400_000).toISOString())
        .order('message_date', { ascending: false })
        .limit(15),
      // Relationship topics: recurring themes + stale topics
      supabase
        .from('cos_relationship_topics')
        .select('topic, category, sentiment, mention_count, last_mentioned_at, status')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .order('mention_count', { ascending: false })
        .limit(15),
      // Forgotten commitments: overdue/aged action items
      supabase
        .from('cos_forgotten_commitments')
        .select('*')
        .eq('user_id', userId)
        .eq('member_id', team_member_id)
        .order('days_pending', { ascending: false }),
    ])

    if (memberRes.error || !memberRes.data) {
      return jsonResponse({ error: 'member_not_found' }, 404)
    }

    const member = memberRes.data as {
      id: string; name: string; role: string; relationship_type: string;
      context_notes: string | null; email: string | null; last_1on1_date: string | null;
    }

    // Load quarterly priorities + monthly commitments if quarter exists
    let quarterlyPriorities: Array<{ title: string; description: string | null; status: string }> = []
    let monthlyCommitments: Array<{ title: string; description: string | null; status: string }> = []

    if (quarterRes.data) {
      const q = quarterRes.data as { id: string; label: string; start_date: string }
      const qStart = new Date(q.start_date + 'T00:00:00')
      const monthNum = Math.min(3, Math.max(1, new Date().getMonth() - qStart.getMonth() + 1))

      const [priRes, comRes] = await Promise.all([
        supabase
          .from('quarterly_priorities')
          .select('title, description, status')
          .eq('quarter_id', q.id)
          .eq('user_id', userId)
          .order('display_order'),
        supabase
          .from('monthly_commitments')
          .select('title, description, status')
          .eq('quarter_id', q.id)
          .eq('user_id', userId)
          .eq('month_number', monthNum)
          .order('display_order'),
      ])
      quarterlyPriorities = (priRes.data ?? []) as typeof quarterlyPriorities
      monthlyCommitments = (comRes.data ?? []) as typeof monthlyCommitments
    }

    // ── Live Slack fetch (DMs with this specific member) ──────────────────
    // Fetches fresh DMs directly from the Slack API so prep uses real signal
    // even when the background sync hasn't run recently. Falls back to the
    // pre-synced cos_slack_messages table if credentials are unavailable.
    let freshSlackMessages: Array<{
      content: string; sender_name: string | null; channel_name: string | null;
      is_dm: boolean; message_date: string;
    }> = []

    if (toolEnabled('slack') && member.email) {
      try {
        const { data: slackCreds } = await supabase
          .from('user_slack_credentials')
          .select('access_token, slack_user_id')
          .eq('user_id', userId)
          .maybeSingle()

        if (slackCreds?.access_token) {
          const slackToken = slackCreds.access_token as string
          const mySlackId = (slackCreds.slack_user_id as string | null) ?? ''
          const oldest14d = String(Math.floor((Date.now() - 14 * 86_400_000) / 1000))

          const slackGet = async (method: string, params: Record<string, string>): Promise<Record<string, unknown>> => {
            const url = new URL(`https://slack.com/api/${method}`)
            for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
            const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${slackToken}` } })
            return r.json() as Promise<Record<string, unknown>>
          }

          // Resolve member's Slack user ID from their email
          const lookupRes = await slackGet('users.lookupByEmail', { email: member.email })
          const memberSlackId = lookupRes.ok
            ? ((lookupRes.user as { id?: string } | null)?.id ?? null)
            : null

          if (memberSlackId) {
            // Find the DM conversation channel
            const convListRes = await slackGet('conversations.list', { types: 'im', limit: '200' })
            const dmChannel = convListRes.ok && Array.isArray(convListRes.channels)
              ? (convListRes.channels as Array<{ id: string; is_im: boolean; user?: string }>)
                  .find(ch => ch.is_im && ch.user === memberSlackId)
              : null

            if (dmChannel) {
              const histRes = await slackGet('conversations.history', {
                channel: dmChannel.id,
                oldest: oldest14d,
                limit: '30',
              })

              if (histRes.ok && Array.isArray(histRes.messages)) {
                for (const msg of histRes.messages as Array<{ type: string; ts: string; user?: string; text: string }>) {
                  if (msg.type !== 'message' || !msg.text || msg.text.length < 5) continue

                  // Resolve sender name without an extra API call: match against known IDs
                  const senderName = msg.user === memberSlackId
                    ? member.name
                    : msg.user === mySlackId
                      ? 'You'
                      : (msg.user ?? null)
                  const messageDate = new Date(parseFloat(msg.ts) * 1000).toISOString()
                  const content = msg.text.slice(0, 2000)

                  freshSlackMessages.push({ content, sender_name: senderName, channel_name: null, is_dm: true, message_date: messageDate })

                  // Upsert into table for future syncs — fire-and-forget
                  supabase.from('cos_slack_messages').upsert({
                    user_id: userId,
                    team_member_id: member.id,
                    channel_id: dmChannel.id,
                    channel_name: null,
                    message_ts: msg.ts,
                    sender_slack_id: msg.user ?? null,
                    sender_name: senderName,
                    content,
                    is_dm: true,
                    message_date: messageDate,
                  }, { onConflict: 'user_id,channel_id,message_ts' }).then(() => {}).catch(() => {})
                }
              }
            }
          }
        }
      } catch (slackLiveFetchErr) {
        console.warn('Live Slack fetch failed (non-fatal):', (slackLiveFetchErr as Error).message)
      }
    }

    const priorities = (prioritiesRes.data ?? []) as Array<{ text: string; category: string; notes: string | null }>
    const pendingActions = (actionsRes.data ?? []) as Array<{ text: string; created_at: string; due_date: string | null }>
    const accountabilities = (accountabilitiesRes.data ?? []) as Array<{ text: string }>
    const topics = (topicsRes.data ?? []) as Array<{ text: string }>
    const pastPreps = (pastPrepsRes.data ?? []) as Array<{ content: string; source: string; generated_at: string; prep_date: string }>
    const prepInstructions = (prepSettingsRes.data as { prep_instructions: string } | null)?.prep_instructions ?? ''

    // Relationship Memory data
    const relTopics = (relTopicsRes.data ?? []) as Array<{
      topic: string; category: string; sentiment: string;
      mention_count: number; last_mentioned_at: string; status: string;
    }>
    const forgottenItems = (forgottenRes.data ?? []) as Array<{
      text: string; due_date: string | null; days_pending: number; urgency: string;
    }>

    const dataSources = ['priorities', 'commitments', 'actions', 'context']
    if (relTopics.length > 0) dataSources.push('relationship_memory')
    if (forgottenItems.length > 0) dataSources.push('forgotten_commitments')

    // ── Build prompt ───────────────────────────────────────────────────────
    // Order: real signal first (Slack, Zoom), then commitments/accountabilities,
    // then relationship memory, then user's own priorities as background-only.

    const contextParts: string[] = []

    contextParts.push(`Person: ${member.name} (${member.role}, ${member.relationship_type.replace('_', ' ')})`)
    if (member.last_1on1_date) {
      contextParts.push(`Last 1:1: ${member.last_1on1_date}`)
    }
    if (member.context_notes) {
      contextParts.push(`Context about ${member.name}: ${member.context_notes}`)
    }

    // ── 1. Primary signal: Zoom recordings and transcripts ────────────────
    const zoomRecordings = (zoomRecordingsRes.data ?? []) as Array<{
      id: string; topic: string | null; start_time: string;
      duration_minutes: number | null; has_transcript: boolean; ai_summary: string | null;
    }>
    if (toolEnabled('zoom') && zoomRecordings.length > 0) {
      contextParts.push(`\n=== RECENT MEETINGS WITH ${member.name.toUpperCase()} ===`)
      let transcriptsIncluded = 0
      for (const rec of zoomRecordings) {
        const date = new Date(rec.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const dur = rec.duration_minutes ? `${rec.duration_minutes}min` : 'unknown duration'
        contextParts.push(`  - "${rec.topic ?? 'Untitled'}" (${date}, ${dur})`)
        if (rec.ai_summary) {
          const preview = rec.ai_summary.length > 600 ? rec.ai_summary.slice(0, 600) + '...' : rec.ai_summary
          contextParts.push(`    Summary: ${preview}`)
        }
        if (rec.has_transcript && transcriptsIncluded < 3) {
          const { data: transcript } = await supabase
            .from('cos_zoom_transcripts')
            .select('content')
            .eq('recording_id', rec.id)
            .maybeSingle()
          if (transcript?.content) {
            const excerpt = (transcript.content as string).slice(0, 1000)
            contextParts.push(`    Transcript excerpt: "${excerpt}..."`)
            transcriptsIncluded++
          }
        }
      }
      dataSources.push('zoom_recordings')
    }

    // ── 2. Primary signal: Slack messages ─────────────────────────────────
    // Use live-fetched DMs if available; fall back to pre-synced table.
    const slackMessages = freshSlackMessages.length > 0
      ? freshSlackMessages
      : (slackMessagesRes.data ?? []) as typeof freshSlackMessages

    if (toolEnabled('slack') && slackMessages.length > 0) {
      const dmMessages = slackMessages.filter(m => m.is_dm)
      const channelMessages = slackMessages.filter(m => !m.is_dm)

      if (dmMessages.length > 0) {
        contextParts.push(`\n=== RECENT SLACK DMs WITH ${member.name.toUpperCase()} ===`)
        for (const msg of dmMessages.slice(0, 10)) {
          const date = new Date(msg.message_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const sender = msg.sender_name ?? 'unknown'
          const preview = msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content
          contextParts.push(`  - [${date}] ${sender}: "${preview}"`)
        }
      }

      if (channelMessages.length > 0) {
        contextParts.push(`\n=== RECENT SLACK CHANNEL MESSAGES FROM ${member.name.toUpperCase()} ===`)
        for (const msg of channelMessages.slice(0, 7)) {
          const date = new Date(msg.message_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const channel = msg.channel_name ? `#${msg.channel_name}` : 'channel'
          const preview = msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content
          contextParts.push(`  - [${date}] in ${channel}: "${preview}"`)
        }
      }

      dataSources.push('slack_messages')
    }

    // ── 3. External system data (HRIS, ticketing, CRM) ────────────────────
    if (toolEnabled('stackone') && member.email) {
      try {
        const s1Config = await getStackOneConfig(supabase, userId)
        if (s1Config) {
          const enrichment = await fetchStackOneEnrichment(
            s1Config.apiKey,
            s1Config.accounts,
            member.email,
            member.name,
          )
          if (enrichment.sections.length > 0) {
            contextParts.push(`\nExternal system data for ${member.name}:`)
            contextParts.push(...enrichment.sections)
            dataSources.push(...enrichment.sourcesUsed)
          }
        }
      } catch (err) {
        console.warn('StackOne enrichment failed (non-fatal):', err)
      }
    }

    // ── 4. Concrete commitments and accountabilities ───────────────────────
    if (pendingActions.length > 0) {
      contextParts.push(`\nPending action items from previous 1:1s with ${member.name}:`)
      pendingActions.forEach(a => {
        const dueLabel = a.due_date ? ` [due ${a.due_date}]` : ''
        contextParts.push(`  - ${a.text}${dueLabel}`)
      })
    }

    if (accountabilities.length > 0) {
      contextParts.push(`\n${member.name}'s accountabilities:`)
      accountabilities.forEach(a => contextParts.push(`  - ${a.text}`))
    }

    if (topics.length > 0) {
      contextParts.push(`\nStanding discussion topics for ${member.name}:`)
      topics.forEach(t => contextParts.push(`  - ${t.text}`))
    }

    // ── 5. Relationship memory ─────────────────────────────────────────────
    if (forgottenItems.length > 0) {
      contextParts.push(`\n⚠ FORGOTTEN COMMITMENTS — these action items have been pending for a long time and were never resolved:`)
      for (const item of forgottenItems) {
        const dueLabel = item.due_date ? `, due ${item.due_date}` : ''
        contextParts.push(`  - [${item.urgency.toUpperCase()}] ${item.text} (${item.days_pending} days pending${dueLabel})`)
      }
    }

    const staleTopics = relTopics.filter(t => t.status === 'stale')
    if (staleTopics.length > 0) {
      contextParts.push(`\n⚠ STALE TOPICS — discussed before but dropped off recently:`)
      staleTopics.forEach(t => contextParts.push(`  - "${t.topic}" (last discussed ${t.last_mentioned_at}, mentioned ${t.mention_count}x total)`))
    }

    const recurringTopics = relTopics.filter(t => t.status === 'active' && t.mention_count >= 3)
    if (recurringTopics.length > 0) {
      contextParts.push(`\nRecurring themes in this relationship (topics that come up often):`)
      recurringTopics.forEach(t => contextParts.push(`  - "${t.topic}" (${t.mention_count}x, sentiment: ${t.sentiment})`))
    }

    // ── 6. Past preps (for continuity) ────────────────────────────────────
    if (pastPreps.length > 0) {
      contextParts.push(`\nRecent past prep briefs for ${member.name} (for continuity):`)
      for (const pp of pastPreps) {
        const preview = pp.content.length > 400 ? pp.content.slice(0, 400) + '...' : pp.content
        contextParts.push(`--- Prep from ${pp.prep_date} (${pp.source}) ---`)
        contextParts.push(preview)
      }
    }

    // ── 7. Team work context: quarterly priorities and monthly commitments ───
    // These represent the team's active work — relevant for discussing progress,
    // blockers, and alignment with a direct report. Not org-level background.
    if (quarterlyPriorities.length > 0) {
      contextParts.push(`\n=== THIS QUARTER'S PRIORITIES (team work — use to discuss progress and blockers with ${member.name}) ===`)
      quarterlyPriorities.forEach((p, i) =>
        contextParts.push(`  ${i + 1}. ${p.title}${p.description ? ` — ${p.description}` : ''} [${p.status}]`)
      )
    }

    if (monthlyCommitments.length > 0) {
      contextParts.push(`\n=== THIS MONTH'S COMMITMENTS (team work — use to discuss progress and blockers with ${member.name}) ===`)
      monthlyCommitments.forEach((c, i) =>
        contextParts.push(`  ${i + 1}. ${c.title}${c.description ? ` — ${c.description}` : ''} [${c.status}]`)
      )
    }

    // ── 8. Background context: user's general priorities ──────────────────
    // Org-level priorities the manager tracks. Do NOT project onto this person
    // without direct evidence from Slack/Zoom/accountabilities.
    const categoryBuckets: Record<string, string[]> = {}
    for (const p of priorities) {
      const cat = p.category ?? 'other'
      if (!categoryBuckets[cat]) categoryBuckets[cat] = []
      categoryBuckets[cat].push(p.text + (p.notes ? ` (${p.notes})` : ''))
    }
    if (Object.keys(categoryBuckets).length > 0) {
      contextParts.push(`\n=== BACKGROUND CONTEXT (manager's org-level priorities — reference ONLY if direct evidence above connects ${member.name} to these) ===`)
      for (const [cat, items] of Object.entries(categoryBuckets)) {
        contextParts.push(`  ${cat.replace('_', ' ')}:`)
        items.forEach(i => contextParts.push(`    - ${i}`))
      }
    }

    const systemPrompt = `You are a chief of staff assistant preparing a 1:1 meeting brief. Generate a concise, actionable prep document in Markdown format.

CRITICAL — THREE-TIER SOURCE DISCIPLINE:

Tier 1 — PRIMARY (sections marked "=== RECENT MEETINGS ===" and "=== RECENT SLACK DMs ==="):
Every talking point should be traceable to something concrete here, to a pending action item, or to the person's stated accountabilities. Quote from Slack/transcripts where useful.

Tier 2 — TEAM WORK CONTEXT (sections marked "=== THIS QUARTER'S PRIORITIES ===" and "=== THIS MONTH'S COMMITMENTS ==="):
These are the team's active deliverables. Use them to discuss progress, blockers, and alignment — they ARE relevant to a direct report's 1:1. However, do not assume this specific person owns a commitment unless their accountabilities or Tier 1 data confirms it.

Tier 3 — BACKGROUND ONLY (section marked "=== BACKGROUND CONTEXT ==="):
The manager's org-level priorities. Do NOT project them onto this person without direct evidence. Do NOT generate questions like "Does [person] own any part of [initiative]?" or "Where does [person] fit in [project]?" — this wastes meeting time and breaks trust.

If there are no Slack messages and no Zoom transcripts for this person, restrict the brief strictly to: (a) follow-ups on pending action items, (b) items within their accountabilities, (c) standing discussion topics, and (d) relevant quarterly/monthly commitments they may contribute to. Do not invent additional content.

Output structure:
- Use ## headings for each topic section (NOT # — skip H1)
- Under each heading, use bullet points (- ) for specific items
- Keep it focused: 3-6 topic sections, each with 2-4 bullets
- Prioritize: blockers and escalations first, then alignment items, then check-ins
- Reference specific things said or done — quote from Slack/transcripts where useful
- Be direct and specific — no filler or generic advice
- If there are pending action items, include a "Follow up on open items" section
- If there are FORGOTTEN COMMITMENTS (marked with ⚠), always include a dedicated "Stale commitments" section near the top — these are trust-eroding items that need explicit follow-up. Suggest a specific question to address each one.
- If there are STALE TOPICS (marked with ⚠), consider whether to raise them ("We haven't discussed X in a while — is it resolved or still relevant?")
- If recurring themes are provided, use them to add depth — these are the threads that define this relationship
- If external system data is provided (HRIS, tickets, CRM), weave relevant context naturally — mention upcoming PTO, blocked tickets, or deal activity where it helps prepare talking points

${prepInstructions ? `Standing instructions from the user:\n${prepInstructions}\n` : ''}`

    const userPrompt = `Prepare a 1:1 brief for my upcoming meeting with ${member.name}.

${contextParts.join('\n')}`

    // ── Call Claude API ────────────────────────────────────────────────────

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const generatedContent = message.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { type: string; text: string }) => b.text)
      .join('\n')

    const inputTokens = message.usage?.input_tokens ?? 0
    const outputTokens = message.usage?.output_tokens ?? 0

    // ── Store result ───────────────────────────────────────────────────────

    const { data: upserted, error: upsertErr } = await supabase
      .from('cos_one_on_one_prep')
      .upsert({
        user_id: userId,
        team_member_id: team_member_id,
        prep_date: todayDate,
        content: generatedContent,
        source: 'ai_generated',
        generated_at: new Date().toISOString(),
        data_sources_used: dataSources,
        status: 'ready',
        event_id: event_id ?? null,
      }, {
        onConflict: 'user_id,team_member_id,prep_date,source',
      })
      .select('id')
      .single()

    if (upsertErr) {
      return jsonResponse({ error: 'storage_failed', detail: upsertErr.message }, 500)
    }

    // Log generation for cost tracking
    await supabase.from('prep_generation_log').insert({
      user_id: userId,
      team_member_id: team_member_id,
      prep_id: upserted?.id ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: 'claude-sonnet-4-6',
      duration_ms: Date.now() - startMs,
      data_sources_used: dataSources,
    })

    // ── Update surfacing tracking on actions included in the prompt ──────
    if (pendingActions.length > 0) {
      await supabase
        .from('cos_meeting_actions')
        .update({ last_surfaced_at: todayDate })
        .eq('user_id', userId)
        .eq('member_id', team_member_id)
        .eq('status', 'pending')
    }

    // ── Topic extraction (Relationship Memory) ────────────────────────────
    // Extract structured topics from the generated prep using Haiku (fast, cheap).
    // This builds the per-person topic timeline over time.
    if (upserted?.id) {
      try {
        const extractionResponse = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: `Extract 3-8 discussion topics from the 1:1 prep brief below.

Return a JSON array where each element has:
- "topic": a short normalized label (e.g. "Q3 hiring plan", "platform rewrite timeline"). Normalize similar topics to the same label.
- "category": one of "blocker", "escalation", "project", "goal", "feedback", "development", "personal", "general"
- "sentiment": one of "positive", "negative", "neutral", "mixed"
- "snippet": a 1-sentence excerpt from the brief that mentions this topic

Return ONLY the JSON array, no markdown fences or other text.`,
          messages: [{ role: 'user', content: generatedContent }],
        })

        const extractionText = extractionResponse.content
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { type: string; text: string }) => b.text)
          .join('')

        let extractedTopics: Array<{
          topic: string; category: string; sentiment: string; snippet: string
        }> = []

        try {
          // Strip markdown fences if present
          const cleaned = extractionText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '').trim()
          extractedTopics = JSON.parse(cleaned)
        } catch {
          console.warn('Topic extraction JSON parse failed:', extractionText.slice(0, 200))
        }

        const validCategories = new Set([
          'blocker', 'escalation', 'project', 'goal',
          'feedback', 'development', 'personal', 'general',
        ])
        const validSentiments = new Set(['positive', 'negative', 'neutral', 'mixed'])

        for (const t of extractedTopics) {
          if (!t.topic || typeof t.topic !== 'string') continue

          const category = validCategories.has(t.category) ? t.category : 'general'
          const sentiment = validSentiments.has(t.sentiment) ? t.sentiment : 'neutral'
          const topicLabel = t.topic.trim().toLowerCase().slice(0, 200)

          // Check if this topic already exists for this member
          const { data: existing } = await supabase
            .from('cos_relationship_topics')
            .select('id, mention_count')
            .eq('user_id', userId)
            .eq('team_member_id', team_member_id)
            .ilike('topic', topicLabel)
            .maybeSingle()

          let topicId: string

          if (existing) {
            // Update existing topic
            await supabase
              .from('cos_relationship_topics')
              .update({
                last_mentioned_at: todayDate,
                mention_count: existing.mention_count + 1,
                sentiment,
                context_snippet: (t.snippet ?? '').slice(0, 500),
                status: 'active', // Re-activate if it was stale
                prep_id: upserted.id,
              })
              .eq('id', existing.id)

            topicId = existing.id
          } else {
            // Insert new topic
            const { data: inserted } = await supabase
              .from('cos_relationship_topics')
              .insert({
                user_id: userId,
                team_member_id: team_member_id,
                prep_id: upserted.id,
                topic: topicLabel,
                category,
                sentiment,
                first_mentioned_at: todayDate,
                last_mentioned_at: todayDate,
                mention_count: 1,
                status: 'active',
                context_snippet: (t.snippet ?? '').slice(0, 500),
              })
              .select('id')
              .single()

            topicId = inserted?.id ?? ''
          }

          // Link prep to topic
          if (topicId) {
            await supabase
              .from('cos_prep_topic_mentions')
              .upsert({
                prep_id: upserted.id,
                topic_id: topicId,
                snippet: (t.snippet ?? '').slice(0, 500),
              }, { onConflict: 'prep_id,topic_id' })
          }
        }

        // Mark topics as stale if not mentioned in the last 3 preps for this member
        const { data: recentPrepIds } = await supabase
          .from('cos_one_on_one_prep')
          .select('id')
          .eq('user_id', userId)
          .eq('team_member_id', team_member_id)
          .eq('status', 'ready')
          .order('prep_date', { ascending: false })
          .limit(3)

        if (recentPrepIds && recentPrepIds.length >= 3) {
          const recentIds = recentPrepIds.map((p: { id: string }) => p.id)

          // Find active topics not mentioned in ANY of the last 3 preps
          const { data: activeTopics } = await supabase
            .from('cos_relationship_topics')
            .select('id')
            .eq('user_id', userId)
            .eq('team_member_id', team_member_id)
            .eq('status', 'active')

          for (const topic of activeTopics ?? []) {
            const { count } = await supabase
              .from('cos_prep_topic_mentions')
              .select('id', { count: 'exact', head: true })
              .eq('topic_id', topic.id)
              .in('prep_id', recentIds)

            if ((count ?? 0) === 0) {
              await supabase
                .from('cos_relationship_topics')
                .update({ status: 'stale' })
                .eq('id', topic.id)
            }
          }
        }

        // Log extraction token usage
        const extractInputTokens = extractionResponse.usage?.input_tokens ?? 0
        const extractOutputTokens = extractionResponse.usage?.output_tokens ?? 0
        await supabase.from('prep_generation_log').insert({
          user_id: userId,
          team_member_id: team_member_id,
          prep_id: upserted.id,
          input_tokens: extractInputTokens,
          output_tokens: extractOutputTokens,
          model: 'claude-haiku-4-5-20251001',
          duration_ms: 0, // Not tracked separately
          data_sources_used: ['topic_extraction'],
        })
      } catch (extractErr) {
        // Topic extraction is non-fatal — log and continue
        console.warn('Topic extraction failed (non-fatal):', (extractErr as Error).message)
      }
    }

    // ── Relationship health score computation ─────────────────────────────
    // Score 0-10 based on: cadence consistency, topic resolution, forgotten items, sentiment.
    try {
      const CADENCE_DAYS: Record<string, number> = {
        direct_report: 7, collaborator: 14, boss: 14,
        peer: 14, skip_level: 30, stakeholder: 30, external: 30,
      }
      const expectedCadence = CADENCE_DAYS[member.relationship_type] ?? 14

      // Cadence score (0-3): how well does the meeting frequency match cadence?
      let cadenceScore = 3
      if (member.last_1on1_date) {
        const daysSinceLast = Math.floor(
          (Date.now() - new Date(member.last_1on1_date + 'T00:00:00').getTime()) / 86_400_000
        )
        const ratio = daysSinceLast / expectedCadence
        if (ratio > 3) cadenceScore = 0
        else if (ratio > 2) cadenceScore = 1
        else if (ratio > 1.3) cadenceScore = 2
        else cadenceScore = 3
      }

      // Resolution score (0-3): ratio of resolved to total topics
      const { data: allRelTopics } = await supabase
        .from('cos_relationship_topics')
        .select('status')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)

      let resolutionScore = 3
      if (allRelTopics && allRelTopics.length > 0) {
        const resolved = allRelTopics.filter((t: { status: string }) => t.status === 'resolved').length
        const stale = allRelTopics.filter((t: { status: string }) => t.status === 'stale').length
        const total = allRelTopics.length
        const resolvedRatio = resolved / total
        const staleRatio = stale / total

        if (staleRatio > 0.5) resolutionScore = 0
        else if (staleRatio > 0.3) resolutionScore = 1
        else if (resolvedRatio > 0.3) resolutionScore = 3
        else resolutionScore = 2
      }

      // Forgotten items score (0-2): penalize for old unresolved actions
      let forgottenScore = 2
      if (forgottenItems.length > 0) {
        const criticalCount = forgottenItems.filter(f => f.urgency === 'critical').length
        if (criticalCount >= 2) forgottenScore = 0
        else if (forgottenItems.length >= 3) forgottenScore = 0
        else if (forgottenItems.length >= 1) forgottenScore = 1
      }

      // Sentiment score (0-2): average sentiment from recent topics
      let sentimentScore = 1
      const recentTopics = relTopics.filter(t => t.status === 'active').slice(0, 5)
      if (recentTopics.length > 0) {
        const sentimentValues: Record<string, number> = { positive: 2, neutral: 1, mixed: 0.5, negative: 0 }
        const avg = recentTopics.reduce((sum, t) => sum + (sentimentValues[t.sentiment] ?? 1), 0) / recentTopics.length
        sentimentScore = Math.round(avg)
      }

      const healthScore = Math.min(10, Math.max(0,
        cadenceScore + resolutionScore + forgottenScore + sentimentScore
      ))

      await supabase
        .from('cos_team_members')
        .update({
          relationship_health_score: healthScore,
          health_score_updated_at: new Date().toISOString(),
        })
        .eq('id', team_member_id)
        .eq('user_id', userId)

    } catch (healthErr) {
      console.warn('Health score computation failed (non-fatal):', (healthErr as Error).message)
    }

    return jsonResponse({
      prep_id: upserted?.id,
      content: generatedContent,
      source: 'ai_generated',
      generated_at: new Date().toISOString(),
      data_sources_used: dataSources,
      token_usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      cached: false,
    }, 200)

  } catch (error) {
    // Log the error for debugging
    const errMsg = (error as Error).message ?? String(error)
    return jsonResponse({ error: 'generation_failed', detail: errMsg }, 500)
  }
})
