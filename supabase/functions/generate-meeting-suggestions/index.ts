import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY') ?? ''
    if (!googleApiKey) return jsonResponse({ error: 'google_ai_api_key_not_configured' }, 500)

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
    const userId = userData.user.id

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
      .select('id, team_member_id, zoom_meeting_id, topic, start_time, participant_names')
      .in('id', recordingIds)
    const recordingById = new Map((recordings ?? []).map(r => [r.id, r]))

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

    let totalAdded = 0

    for (const transcript of transcripts) {
      const recording = recordingById.get(transcript.recording_id)
      const participantNames: string[] = recording?.participant_names ?? []

      // Classify meeting kind + provenance.
      const member = recording?.team_member_id ? memberById.get(recording.team_member_id) : undefined
      const isRecurring = recording?.zoom_meeting_id
        ? (meetingIdCounts.get(recording.zoom_meeting_id) ?? 0) > 1
        : false
      let sourceType: string
      let sourceLabel: string
      if (member && participantNames.length <= 2) {
        sourceType = 'one_on_one'
        sourceLabel = `1:1 with ${member.name}`
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

      for (const item of items) {
        const title = (item.title ?? '').trim()
        if (!title) continue

        const category = item.suggested_category && validCategories.has(item.suggested_category)
          ? item.suggested_category
          : fallbackCategory
        const urgency = ['urgent', 'this_week', 'watching'].includes(item.urgency ?? '')
          ? item.urgency
          : 'this_week'

        // Dedupe: skip if a pending suggestion with the same title already exists.
        const { data: existing } = await supabase
          .from('dci_suggested_tasks')
          .select('id')
          .eq('user_id', userId)
          .eq('title', title)
          .eq('status', 'pending')
          .maybeSingle()
        if (existing) continue

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
            recording_id: transcript.recording_id,
          })
        if (!insertErr) totalAdded++
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
