import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "npm:@anthropic-ai/sdk"

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

// Word-overlap similarity — used to deduplicate AI suggestions against
// manually-created action items. Normalises both strings to word sets and
// computes Jaccard similarity; returns true if the overlap meets the threshold.
function normalizeWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3),
  )
}

function isSimilarText(a: string, b: string, threshold = 0.5): boolean {
  const wa = normalizeWords(a)
  const wb = normalizeWords(b)
  if (wa.size === 0 || wb.size === 0) return false
  let intersection = 0
  for (const w of wa) if (wb.has(w)) intersection++
  const union = wa.size + wb.size - intersection
  return union > 0 && intersection / union >= threshold
}

// Strip VTT timestamps/metadata, keeping spoken text with speaker labels.
function stripVtt(vtt: string): string {
  return vtt
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (trimmed === 'WEBVTT') return false
      if (/^\d+$/.test(trimmed)) return false
      if (/-->/.test(trimmed)) return false
      if (trimmed.startsWith('NOTE')) return false
      return true
    })
    .join('\n')
}

// ── Layout helpers (mirror of src/types/cos.ts, inlined for Deno) ──────────────

interface CosColumnSection { id: string; type: string; label: string | null; enabled: boolean }
interface CosColumn { id: string; headerLabel: string; sections: CosColumnSection[] }
interface CosLayoutConfig { columns: CosColumn[] }

function sectionToCategoryKey(s: CosColumnSection): string {
  if (s.type === 'this_month_auto') return 'this_month'
  if (s.type === 'next_month_auto') return 'next_month'
  if (s.type === 'next_quarter_auto') return 'next_quarter'
  if (s.type === 'now' || s.type === 'this_week' || s.type === 'next_week') return s.type
  return s.id
}

function resolveSectionLabel(s: CosColumnSection): string {
  if (s.label) return s.label
  const now = new Date()
  if (s.type === 'this_month_auto') return now.toLocaleString('default', { month: 'long' })
  if (s.type === 'next_month_auto') return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString('default', { month: 'long' })
  return s.id
}

interface TargetOption { category: string; columnLabel: string; sectionLabel: string }

function buildTargetOptions(layout: CosLayoutConfig | null): TargetOption[] {
  if (!layout?.columns) return []
  const opts: TargetOption[] = []
  for (const col of layout.columns) {
    for (const sec of col.sections ?? []) {
      if (!sec.enabled || sec.type === 'direct_reports') continue
      opts.push({
        category: sectionToCategoryKey(sec),
        columnLabel: col.headerLabel,
        sectionLabel: resolveSectionLabel(sec),
      })
    }
  }
  return opts
}

// ── Prompt ─────────────────────────────────────────────────────────────────

function buildPrompt(opts: {
  meetingKind: string
  meetingLabel: string
  participantNames: string[]
  targets: TargetOption[]
  transcript: string
}): string {
  const { meetingKind, meetingLabel, participantNames, targets, transcript } = opts
  const targetList = targets.length
    ? targets.map(t => `  - "${t.category}"  → ${t.columnLabel} · ${t.sectionLabel}`).join('\n')
    : '  - (no lists configured; use "this_week")'

  return `You are a chief-of-staff assistant reviewing a ${meetingKind.replace('_', ' ')} ("${meetingLabel}") so the user does not forget what they committed to or need to follow up on.

Participants: ${participantNames.join(', ') || 'unknown'}

Extract 1-5 concrete action items / follow-ups the USER should add to their personal task lists. Focus on things the user owes, promised, must unblock, or should not let slide. Ignore items clearly owned by someone else.

For EACH item, choose the best destination list from this set (use the exact key on the left):
${targetList}

Pick urgency:
  - "urgent"     → needs attention now / overdue / blocking
  - "this_week"  → should happen this week
  - "watching"   → strategic or longer-horizon, keep an eye on it

Return ONLY valid JSON — no markdown fences, no commentary:
[
  {
    "title": "Short imperative task (max ~8 words)",
    "suggested_category": "one key from the list above",
    "urgency": "urgent | this_week | watching",
    "rationale": "Brief reason it matters (max ~12 words), e.g. 'You owe this; ships Jun 27.'",
    "raw_context": "The verbatim line/quote that triggered this (1 sentence)"
  }
]

If there are no genuine action items, return [].

Transcript:
${transcript}`
}

function buildColleaguePrompt(opts: {
  meetingLabel: string
  participantNames: string[]
  transcript: string
}): string {
  const { meetingLabel, participantNames, transcript } = opts
  const names = participantNames.join(', ') || 'unknown'

  return `You are a chief-of-staff assistant reviewing a meeting ("${meetingLabel}").

Participants: ${names}

Identify action items that were explicitly assigned to or owned by a PARTICIPANT (not the user/host). Only include items where it is clear from the transcript that someone other than the user is responsible.

Return ONLY valid JSON — no markdown fences, no commentary:
[
  {
    "assignee_name": "Exact name as it appears in the transcript",
    "title": "Formatted as '<FirstName> to <verb> ...' (max ~8 words after the name), e.g. 'Mindy to send the updated deck'",
    "rationale": "Brief reason it was assigned (max ~12 words)",
    "raw_context": "The verbatim line/quote that shows the assignment (1 sentence)"
  }
]

If there are no colleague action items, return [].

Transcript:
${transcript}`
}

// ── Tag recommendation (mirrors supabase/functions/suggest-inbox-tags) ────────

interface InboxTagRow {
  id: string
  name: string
  type: string
  color: string
}

interface TagSuggestion { tag_id: string; tag_name: string; color: string; reason: string }

async function suggestTagsForSuggestion(
  anthropic: Anthropic,
  tags: InboxTagRow[],
  opts: { title: string; rawContext: string | null },
): Promise<TagSuggestion[]> {
  if (tags.length === 0) return []

  const tagList = tags.map(t => `- ${t.name} (type: ${t.type}, id: ${t.id})`).join('\n')

  const prompt = `You are a tagging assistant for a team productivity tool. Your job is to suggest which tags from the user's library best match a suggested task extracted from a meeting.

SUGGESTED TASK
Title: "${opts.title}"
${opts.rawContext ? `Context quote: "${opts.rawContext}"` : ''}

AVAILABLE TAGS
${tagList}

INSTRUCTIONS
- Return at most 2 tags, ranked by confidence (most confident first).
- Only suggest a tag if you are reasonably sure it matches.
- If no tag fits, return an empty array.
- Do NOT invent tags — only use IDs from the list above.
- A project tag fits if the task is clearly about that initiative, based on its name.
- A folder tag fits if the task's urgency or context matches the folder's purpose.
- A person tag fits ONLY if that person is explicitly assigned the action, is its direct subject (e.g. "give feedback to X"), or is a named party to a decision. NEVER tag a person merely because the task came from a meeting or 1:1 with them.

Respond with valid JSON only — no prose, no markdown fences.
Schema: [{ "tag_id": "<id>", "tag_name": "<name>", "color": "<hex>", "reason": "<one short sentence>" }]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (message.content[0] as { type: string; text: string }).text.trim()
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []

    const tagMap = new Map(tags.map(t => [t.id, t]))
    return parsed
      .filter((s: { tag_id?: string }) => s.tag_id && tagMap.has(s.tag_id))
      .slice(0, 2)
      .map((s: { tag_id: string; reason?: string }) => {
        const tag = tagMap.get(s.tag_id)!
        return { tag_id: tag.id, tag_name: tag.name, color: tag.color, reason: String(s.reason ?? '').slice(0, 120) }
      })
  } catch (err) {
    console.error('suggestTagsForSuggestion error:', String(err))
    return []
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY') ?? ''
    if (!googleApiKey) return jsonResponse({ error: 'google_ai_api_key_not_configured' }, 500)
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const anthropic = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null
    if (!anthropic) console.error('generate-meeting-suggestions: ANTHROPIC_API_KEY not configured, skipping tag recommendations')

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Two auth modes:
    // 1. User JWT — normal client call
    // 2. Service-role key + x-supabase-user-id header — batch/cron invocation (agent-tick)
    let userId: string
    const overrideUserId = req.headers.get('x-supabase-user-id')
    if (overrideUserId && jwt === serviceRoleKey) {
      const { data: profile } = await supabase.auth.admin.getUserById(overrideUserId)
      if (!profile?.user) return jsonResponse({ error: 'user_not_found' }, 404)
      userId = overrideUserId
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
      userId = userData.user.id
    }

    // Optional: process a specific transcript
    let transcriptId: string | null = null
    try {
      const body = await req.json()
      transcriptId = body?.transcript_id ?? null
    } catch { /* empty body fine */ }

    // ── Build the user's destination list options from their layout config ──
    const { data: settings } = await supabase
      .from('cos_settings')
      .select('layout_config')
      .eq('user_id', userId)
      .maybeSingle()
    const targets = buildTargetOptions((settings?.layout_config ?? null) as CosLayoutConfig | null)
    const validCategories = new Set(targets.map(t => t.category))
    const fallbackCategory = targets[0]?.category ?? 'this_week'

    // ── Fetch unprocessed transcripts ──
    let query = supabase
      .from('cos_zoom_transcripts')
      .select('id, recording_id, content, content_type, user_id')
      .eq('user_id', userId)
      .is('suggestions_extracted_at', null)
      .order('fetched_at', { ascending: false })
      .limit(5)
    if (transcriptId) {
      query = supabase
        .from('cos_zoom_transcripts')
        .select('id, recording_id, content, content_type, user_id')
        .eq('id', transcriptId)
        .eq('user_id', userId)
        .limit(1)
    }

    const { data: transcripts, error: fetchErr } = await query
    if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500)
    if (!transcripts || transcripts.length === 0) {
      return jsonResponse({ processed: 0, suggestions_added: 0, message: 'No unprocessed transcripts found' }, 200)
    }

    // ── Load recordings + members for attribution ──
    const recordingIds = transcripts.map(t => t.recording_id)
    const { data: recordings } = await supabase
      .from('cos_zoom_recordings')
      .select('id, team_member_id, group_meeting_id, zoom_meeting_id, topic, start_time, participant_names')
      .in('id', recordingIds)
    const recordingById = new Map((recordings ?? []).map(r => [r.id, r]))

    // Tracked group meetings, so suggestions can be labeled with the meeting's
    // subject instead of the raw Zoom topic (which is often generic or stale).
    const groupMeetingIds = [...new Set(
      (recordings ?? []).map(r => r.group_meeting_id).filter((id): id is string => !!id)
    )]
    let groupMeetingById = new Map<string, { id: string; title: string; subject: string | null }>()
    if (groupMeetingIds.length > 0) {
      const { data: groupMeetingRows } = await supabase
        .from('cos_group_meetings')
        .select('id, title, subject')
        .in('id', groupMeetingIds)
      groupMeetingById = new Map((groupMeetingRows ?? []).map(g => [g.id as string, g as { id: string; title: string; subject: string | null }]))
    }

    // Recurring meetings reuse the same zoom_meeting_id across recordings.
    const { data: allRecordings } = await supabase
      .from('cos_zoom_recordings')
      .select('zoom_meeting_id')
      .eq('user_id', userId)
    const meetingIdCounts = new Map<string, number>()
    for (const r of allRecordings ?? []) {
      meetingIdCounts.set(r.zoom_meeting_id, (meetingIdCounts.get(r.zoom_meeting_id) ?? 0) + 1)
    }

    const { data: membersRows } = await supabase
      .from('cos_team_members')
      .select('id, name')
      .eq('user_id', userId)
    const members = (membersRows ?? []) as Array<{ id: string; name: string }>
    const memberById = new Map(members.map(m => [m.id, m]))

    // Inbox tag library for content-aware suggestion tagging (see suggestTagsForSuggestion).
    const { data: inboxTagRows } = await supabase
      .from('inbox_tags')
      .select('id, name, type, color')
      .eq('user_id', userId)
      .in('type', ['project', 'folder', 'person'])
      .is('parent_id', null)
    const inboxTags = (inboxTagRows ?? []) as InboxTagRow[]

    let totalAdded = 0

    for (const transcript of transcripts) {
      const recording = recordingById.get(transcript.recording_id)
      const participantNames: string[] = recording?.participant_names ?? []

      // Classify meeting kind + provenance.
      const member = recording?.team_member_id ? memberById.get(recording.team_member_id) : undefined
      const isRecurring = recording?.zoom_meeting_id
        ? (meetingIdCounts.get(recording.zoom_meeting_id) ?? 0) > 1
        : false
      const groupMeeting = recording?.group_meeting_id ? groupMeetingById.get(recording.group_meeting_id) : undefined

      let sourceType: string
      let sourceLabel: string
      if (member && participantNames.length <= 2) {
        sourceType = 'one_on_one'
        sourceLabel = `1:1 with ${member.name}`
      } else if (groupMeeting) {
        sourceType = 'group_meeting'
        sourceLabel = groupMeeting.subject ?? groupMeeting.title
      } else if (isRecurring) {
        sourceType = 'recurring_meeting'
        sourceLabel = recording?.topic ?? 'Recurring meeting'
      } else {
        sourceType = 'group_meeting'
        sourceLabel = recording?.topic ?? 'Group meeting'
      }

      const text = transcript.content_type === 'vtt' ? stripVtt(transcript.content) : transcript.content
      const words = text.split(/\s+/)
      const truncated = words.length > 8000 ? words.slice(0, 8000).join(' ') + '\n[...truncated]' : text

      const prompt = buildPrompt({
        meetingKind: sourceType,
        meetingLabel: sourceLabel,
        participantNames,
        targets,
        transcript: truncated,
      })

      const geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': googleApiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      )
      if (!geminiRes.ok) {
        console.error(`Gemini failed for transcript ${transcript.id}:`, await geminiRes.text())
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geminiData = await geminiRes.json() as any
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

      let items: Array<{ title: string; suggested_category?: string; urgency?: string; rationale?: string; raw_context?: string }> = []
      try {
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed)) items = parsed
      } catch {
        console.warn(`Failed to parse suggestions JSON for transcript ${transcript.id}:`, jsonStr.slice(0, 200))
      }

      const date = recording?.start_time
        ? new Date(recording.start_time).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      // Load manually-created action items for this member so we can deduplicate
      // AI suggestions against work the user already captured during the meeting.
      const manualActions: Array<{ text: string }> = []
      if (recording?.team_member_id) {
        const { data: actions } = await supabase
          .from('cos_meeting_actions')
          .select('text')
          .eq('user_id', userId)
          .eq('member_id', recording.team_member_id)
          .eq('status', 'pending')
        if (actions) manualActions.push(...(actions as Array<{ text: string }>))
      }

      for (const item of items) {
        const title = (item.title ?? '').trim()
        if (!title) continue

        const category = item.suggested_category && validCategories.has(item.suggested_category)
          ? item.suggested_category
          : fallbackCategory
        const urgency = ['urgent', 'this_week', 'watching'].includes(item.urgency ?? '')
          ? item.urgency
          : 'this_week'

        // Dedupe against pending suggestions (exact title match).
        const { data: existing } = await supabase
          .from('dci_suggested_tasks')
          .select('id')
          .eq('user_id', userId)
          .eq('title', title)
          .eq('status', 'pending')
          .maybeSingle()
        if (existing) continue

        // Dedupe against manually-created action items (word-overlap similarity).
        if (manualActions.some(m => isSimilarText(m.text, title))) continue

        // Recommend an inbox tag destination from the task's content — never
        // from meeting attendance alone (see suggestTagsForSuggestion).
        const tagSuggestions = anthropic
          ? await suggestTagsForSuggestion(anthropic, inboxTags, { title, rawContext: item.raw_context ?? null })
          : []

        const { error: insertErr } = await supabase
          .from('dci_suggested_tasks')
          .insert({
            user_id: userId,
            date,
            title,
            source: sourceLabel,
            source_type: sourceType,
            urgency,
            suggested_category: category,
            rationale: item.rationale ?? null,
            raw_context: item.raw_context ?? null,
            member_id: recording?.team_member_id ?? null,
            group_meeting_id: recording?.group_meeting_id ?? null,
            recording_id: transcript.recording_id,
            tag_suggestions: tagSuggestions,
          })
        if (!insertErr) totalAdded++
      }

      // ── Second pass: colleague-assigned action items ──────────────────────
      // Only attempt if there are known participants to match against.
      if (members.length > 0 && participantNames.length > 1) {
        const colleaguePrompt = buildColleaguePrompt({
          meetingLabel: sourceLabel,
          participantNames,
          transcript: truncated,
        })

        const colleagueRes = await fetch(
          'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': googleApiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: colleaguePrompt }] }] }),
          },
        )

        if (colleagueRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cData = await colleagueRes.json() as any
          const cRaw = cData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          const cJson = cRaw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

          let cItems: Array<{ assignee_name: string; title: string; rationale?: string; raw_context?: string }> = []
          try {
            const parsed = JSON.parse(cJson)
            if (Array.isArray(parsed)) cItems = parsed
          } catch {
            console.warn(`Failed to parse colleague suggestions JSON for transcript ${transcript.id}:`, cJson.slice(0, 200))
          }

          for (const item of cItems) {
            const rawTitle = (item.title ?? '').trim()
            const assigneeName = (item.assignee_name ?? '').trim().toLowerCase()
            if (!rawTitle || !assigneeName) continue

            // Fuzzy-match assignee name to a known team member.
            const matched = members.find(m => {
              const mn = m.name.toLowerCase()
              const parts = mn.split(/\s+/)
              return mn === assigneeName
                || parts[0] === assigneeName
                || parts[parts.length - 1] === assigneeName
                || mn.includes(assigneeName)
            })
            if (!matched) continue

            // Enforce "<FirstName> to <verb> ..." regardless of what the model returned.
            const firstName = matched.name.split(/\s+/)[0]
            const alreadyPrefixed = new RegExp(`^${firstName}\\s+to\\s+`, 'i').test(rawTitle)
            const title = alreadyPrefixed
              ? rawTitle
              : `${firstName} to ${rawTitle.replace(new RegExp(`^${firstName}\\s+`, 'i'), '').replace(/^to\s+/i, '')}`

            // Dedupe: skip if an identical pending suggestion already exists for this colleague.
            const { data: existingC } = await supabase
              .from('dci_suggested_tasks')
              .select('id')
              .eq('user_id', userId)
              .eq('assignee_member_id', matched.id)
              .eq('title', title)
              .eq('status', 'pending')
              .maybeSingle()
            if (existingC) continue

            const { error: cInsertErr } = await supabase
              .from('dci_suggested_tasks')
              .insert({
                user_id: userId,
                date,
                title,
                source: sourceLabel,
                source_type: sourceType,
                urgency: 'this_week',
                rationale: item.rationale ?? null,
                raw_context: item.raw_context ?? null,
                member_id: recording?.team_member_id ?? null,
                group_meeting_id: recording?.group_meeting_id ?? null,
                recording_id: transcript.recording_id,
                assignee_member_id: matched.id,
              })
            if (!cInsertErr) totalAdded++
          }
        } else {
          console.error(`Gemini colleague pass failed for transcript ${transcript.id}:`, await colleagueRes.text())
        }
      }

      await supabase
        .from('cos_zoom_transcripts')
        .update({ suggestions_extracted_at: new Date().toISOString() })
        .eq('id', transcript.id)
    }

    return jsonResponse({ processed: transcripts.length, suggestions_added: totalAdded }, 200)
  } catch (err) {
    console.error('Top-level crash:', String(err))
    return jsonResponse({ error: 'internal_error', detail: String(err) }, 500)
  }
})
