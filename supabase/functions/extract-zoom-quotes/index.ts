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

// Strip VTT timestamps and metadata, returning just the spoken text with speaker labels.
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

// ── Meeting-insight helpers (mirror of src/lib/meetingInsights.ts — Deno can't
// import from src/, see the delegationRequestSchema convention in
// inboxValidation.ts. Keep these two files in sync.) ──────────────────────────

// Max meeting_insight rows created per transcript, independent of how many
// quotes are extracted for cos_member_quotes (up to 3) — plan §6.3.
const MEETING_INSIGHT_CAP_PER_TRANSCRIPT = 2

// Raw transcript speaker labels that carry no useful identity — anonymous
// dial-ins, placeholder labels — never produce an inbox row (plan §6.4).
const NOISY_SPEAKER_RE = /^(unknown|guest\s*\d*|\+?\d{7,})$/i

function isNoisySpeakerName(speaker: string): boolean {
  const trimmed = speaker.trim()
  if (!trimmed) return true
  return NOISY_SPEAKER_RE.test(trimmed)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatShortDate(saidOn: string | null | undefined): string | null {
  if (!saidOn) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(saidOn)
  if (!match) return null
  const monthIdx = Number(match[2]) - 1
  if (monthIdx < 0 || monthIdx > 11) return null
  return `${MONTHS[monthIdx]} ${Number(match[3])}`
}

interface ExtractedQuote { speaker: string; quote: string; context?: string }

// Shape the meeting_insight row's own headline text so a user scanning the
// list never has to open it to know where it came from (plan §9.1).
function buildMeetingInsightText(
  q: ExtractedQuote,
  meetingTopic: string | null | undefined,
  saidOn: string | null | undefined,
): string {
  const speaker = q.speaker.trim()
  const quote = q.quote.trim()
  const base = `${speaker} said: "${quote}"`
  const meetingLabel = meetingTopic?.trim()
  if (!meetingLabel) return base
  const dateLabel = formatShortDate(saidOn)
  return dateLabel ? `${base} — from ${meetingLabel}, ${dateLabel}` : `${base} — from ${meetingLabel}`
}

interface MeetingInsightSourceRef {
  type: 'zoom_recording'
  id: string
  recording_id: string
  transcript_id: string
  quote_id?: string
  speaker_name: string
  meeting_topic?: string
  said_on: string
  context?: string
}

function buildMeetingInsightSourceRef(opts: {
  recordingId: string
  transcriptId: string
  quoteId?: string | null
  meetingTopic?: string | null
  saidOn: string
}, q: ExtractedQuote): MeetingInsightSourceRef {
  return {
    type: 'zoom_recording',
    id: opts.recordingId,
    recording_id: opts.recordingId,
    transcript_id: opts.transcriptId,
    quote_id: opts.quoteId ?? undefined,
    speaker_name: q.speaker.trim(),
    meeting_topic: opts.meetingTopic ?? undefined,
    said_on: opts.saidOn,
    context: q.context,
  }
}

// ── Commitment helpers (mirror of the ExtractedCommitment additions in
// src/lib/meetingInsights.ts — see the file-level comment above. Feeds the
// `owed_by` column added in 20260728000001_inbox_items_owed_by.sql, which
// powers the daily digest's "you're blocking these people" section.) ────────

// Max commitment rows created per transcript — kept modest since commitments
// are a coarser, higher-signal-per-row surface than quotes.
const COMMITMENT_CAP_PER_TRANSCRIPT = 5

interface ExtractedCommitment {
  owner_name: string
  owed_by: 'me' | 'them'
  commitment: string
}

interface CommitmentSourceRef {
  type: 'zoom_recording'
  id: string
  recording_id: string
  transcript_id: string
  speaker_name: string
  meeting_topic?: string
  said_on: string
}

function buildCommitmentSourceRef(opts: {
  recordingId: string
  transcriptId: string
  meetingTopic?: string | null
  saidOn: string
}, c: ExtractedCommitment): CommitmentSourceRef {
  return {
    type: 'zoom_recording',
    id: opts.recordingId,
    recording_id: opts.recordingId,
    transcript_id: opts.transcriptId,
    speaker_name: c.owner_name.trim(),
    meeting_topic: opts.meetingTopic ?? undefined,
    said_on: opts.saidOn,
  }
}

// Shape the commitment inbox row's own headline text, mirroring
// buildMeetingInsightText's "per-card origin clarity" goal.
function buildCommitmentText(
  c: ExtractedCommitment,
  meetingTopic: string | null | undefined,
  saidOn: string | null | undefined,
): string {
  const commitment = c.commitment.trim()
  const base = c.owed_by === 'me'
    ? `You committed: ${commitment}`
    : `${c.owner_name.trim()} committed: ${commitment}`
  const meetingLabel = meetingTopic?.trim()
  if (!meetingLabel) return base
  const dateLabel = formatShortDate(saidOn)
  return dateLabel ? `${base} — from ${meetingLabel}, ${dateLabel}` : `${base} — from ${meetingLabel}`
}

const EXTRACT_PROMPT = `You are analyzing a meeting transcript. Do two independent extraction passes over it.

PASS 1 — QUOTES: Extract 1-3 standout quotes — things a team member said that are insightful, inspiring, funny, or show strong leadership/ownership.
- Only extract quotes actually spoken by someone (not the meeting host/user asking questions)
- Each quote must be a direct, verbatim phrase (clean up filler words like "um", "uh", "you know")
- Keep quotes concise (1-3 sentences max)
- Include the speaker's name exactly as it appears in the transcript
- If no noteworthy quotes exist, return an empty array

PASS 2 — COMMITMENTS: Extract explicit commitments/action items — someone in the meeting explicitly promising to do something for someone else, with clear ownership. For each, classify direction relative to the meeting HOST (the user running the meeting — usually whoever is driving the agenda or asking the questions, not a named external participant):
- "owed_by": "me" — the HOST/USER committed to do something for a participant. Example: Host says "I'll send you the updated deck by Friday" or "Let me follow up with legal and get back to you." → owner_name can be "Host" if the transcript never names the user.
- "owed_by": "them" — a PARTICIPANT committed to do something for the host/user. Example: "Jane: I'll get you the numbers by end of day" or "Marcus: I'll loop in the design team and report back to you." → owner_name is that participant's name as it appears in the transcript.
- Only extract EXPLICIT commitments — a clear, stated promise to do something in the future. Do NOT include vague possibilities ("we should maybe..."), completed past actions, or generic small talk.
- Keep each commitment to one concise sentence describing what was promised (who it's for should be implied by owed_by, not repeated in the sentence).
- Extract at most 5 commitments. If none exist, return an empty array.

Return ONLY valid JSON — no markdown fences, no commentary — matching this exact shape:
{
  "quotes": [
    { "speaker": "Jane Smith", "quote": "The exact quote here.", "context": "Brief 5-word context" }
  ],
  "commitments": [
    { "owner_name": "Jane Smith", "owed_by": "them", "commitment": "Send the updated numbers by EOD Friday." },
    { "owner_name": "Host", "owed_by": "me", "commitment": "Follow up with legal on the contract language." }
  ]
}

Transcript:
`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY') ?? ''

    if (!googleApiKey) {
      return jsonResponse({ error: 'google_ai_api_key_not_configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Two auth modes (mirrors generate-meeting-suggestions/index.ts):
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

    // Find unprocessed transcripts (no quotes_extracted_at, or specific one)
    let query = supabase
      .from('cos_zoom_transcripts')
      .select('id, recording_id, content, content_type, user_id')
      .eq('user_id', userId)
      .is('quotes_extracted_at', null)
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
      return jsonResponse({ processed: 0, quotes_added: 0, insights_added: 0, commitments_added: 0, message: 'No unprocessed transcripts found' }, 200)
    }

    // Load team members for speaker matching
    const { data: membersRows } = await supabase
      .from('cos_team_members')
      .select('id, name, email, relationship_type')
      .eq('user_id', userId)
    const members = (membersRows ?? []) as Array<{ id: string; name: string; email: string | null }>

    // Load recording metadata for dates
    const recordingIds = transcripts.map(t => t.recording_id)
    const { data: recordings } = await supabase
      .from('cos_zoom_recordings')
      .select('id, start_time, topic')
      .in('id', recordingIds)
    const recordingById = new Map((recordings ?? []).map(r => [r.id, r]))

    let totalQuotesAdded = 0
    let totalInsightsAdded = 0
    let totalCommitmentsAdded = 0

    for (const transcript of transcripts) {
      const text = transcript.content_type === 'vtt'
        ? stripVtt(transcript.content)
        : transcript.content

      // Truncate to ~8000 words to stay within context limits
      const words = text.split(/\s+/)
      const truncated = words.length > 8000 ? words.slice(0, 8000).join(' ') + '\n[...truncated]' : text

      console.log(`Processing transcript ${transcript.id}, ${words.length} words`)

      // Per-transcript meeting_insight cap (plan §6.3) — reset for each transcript.
      let insightsAddedForTranscript = 0

      // Call Gemini
      const geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': googleApiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: EXTRACT_PROMPT + truncated }] }],
          }),
        },
      )

      if (!geminiRes.ok) {
        console.error(`Gemini failed for transcript ${transcript.id}:`, await geminiRes.text())
        continue
      }

      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geminiData = await geminiRes.json() as any
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      // Parse JSON from response (strip markdown fences if present). Expected
      // shape is { quotes: [...], commitments: [...] } — see EXTRACT_PROMPT.
      const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      let quotes: Array<{ speaker: string; quote: string; context?: string }> = []
      let commitments: ExtractedCommitment[] = []
      try {
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed)) {
          // Defensive fallback: tolerate a bare quotes array (older prompt shape).
          quotes = parsed
        } else if (parsed && typeof parsed === 'object') {
          quotes = Array.isArray(parsed.quotes) ? parsed.quotes : []
          commitments = Array.isArray(parsed.commitments) ? parsed.commitments : []
        }
      } catch {
        console.warn(`Failed to parse quotes/commitments JSON for transcript ${transcript.id}:`, jsonStr.slice(0, 200))
        quotes = []
        commitments = []
      }

      const recording = recordingById.get(transcript.recording_id)
      const saidOn = recording?.start_time
        ? new Date(recording.start_time).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      for (const q of quotes) {
        if (!q.speaker || !q.quote) continue

        // Match speaker to a team member by name (fuzzy)
        const speakerLower = q.speaker.toLowerCase().trim()
        const matched = members.find(m => {
          const memberLower = m.name.toLowerCase().trim()
          // Exact match
          if (memberLower === speakerLower) return true
          // First name match
          const memberFirst = memberLower.split(' ')[0]
          const speakerFirst = speakerLower.split(' ')[0]
          if (memberFirst === speakerFirst && members.filter(
            o => o.name.toLowerCase().split(' ')[0] === memberFirst
          ).length === 1) return true
          // Last name match
          const memberLast = memberLower.split(' ').pop()
          const speakerLast = speakerLower.split(' ').pop()
          if (memberLast === speakerLast && members.filter(
            o => o.name.toLowerCase().split(' ').pop() === memberLast
          ).length === 1) return true
          return false
        })

        // Unmatched speakers no longer short-circuit here (plan §2/§6.4): they
        // still get a meeting_insight row further below (with quote_id left
        // unset), they just skip the cos_member_quotes insert since that table
        // requires a team_member_id.
        let quoteId: string | null = null

        if (matched) {
          // Check for duplicate quotes
          const { data: existing } = await supabase
            .from('cos_member_quotes')
            .select('id')
            .eq('user_id', userId)
            .eq('team_member_id', matched.id)
            .eq('quote', q.quote)
            .maybeSingle()

          if (existing) {
            quoteId = existing.id
          } else {
            const { data: inserted, error: insertErr } = await supabase
              .from('cos_member_quotes')
              .insert({
                user_id: userId,
                team_member_id: matched.id,
                quote: q.quote,
                said_on: saidOn,
                source: 'zoom',
                source_ref: recording?.topic ?? null,
                featured: true,
              })
              .select('id')
              .single()

            if (!insertErr) {
              totalQuotesAdded++
              quoteId = inserted?.id ?? null
            }
          }
        } else {
          console.log(`No member match for speaker "${q.speaker}" — will still surface as a meeting insight`)
        }

        // ── Meeting insight (plan §2-§6): surface the quote in the inbox ──────
        if (isNoisySpeakerName(q.speaker)) {
          console.log(`Speaker "${q.speaker}" looks like a placeholder/dial-in — skipping inbox insight`)
        } else if (insightsAddedForTranscript >= MEETING_INSIGHT_CAP_PER_TRANSCRIPT) {
          console.log(`Meeting insight cap (${MEETING_INSIGHT_CAP_PER_TRANSCRIPT}) reached for transcript ${transcript.id} — skipping remaining quotes`)
        } else {
          const sourceRef = buildMeetingInsightSourceRef({
            recordingId: transcript.recording_id,
            transcriptId: transcript.id,
            quoteId,
            meetingTopic: recording?.topic ?? null,
            saidOn,
          }, q)

          // Dedup on (transcript, speaker, quote) — not just transcript — so a
          // manual re-extract (via the transcript_id param) stays idempotent
          // instead of being blocked outright or duplicating rows (plan §6.1).
          // The quote itself isn't in source_ref, so it's matched via `text`
          // (which always embeds the verbatim quote — see buildMeetingInsightText)
          // alongside the jsonb containment check on transcript_id/speaker_name.
          const insightText = buildMeetingInsightText(q, recording?.topic, saidOn)
          const { data: existingInsight } = await supabase
            .from('inbox_items')
            .select('id')
            .eq('user_id', userId)
            .eq('type', 'meeting_insight')
            .eq('text', insightText)
            .contains('source_ref', { transcript_id: transcript.id, speaker_name: q.speaker.trim() })
            .maybeSingle()

          if (existingInsight) {
            console.log(`Meeting insight already exists for transcript ${transcript.id} / speaker "${q.speaker}" — skipping`)
          } else {
            const { error: insightErr } = await supabase
              .from('inbox_items')
              .insert({
                user_id: userId,
                type: 'meeting_insight',
                text: insightText,
                status: 'open',
                source_ref: sourceRef,
              })

            if (insightErr) {
              console.error(`Failed to insert meeting_insight for transcript ${transcript.id}:`, insightErr.message)
            } else {
              insightsAddedForTranscript++
              totalInsightsAdded++
            }
          }
        }
      }

      // ── Commitments: surface directional "who owes whom" rows in the inbox ──
      // Additive to the quote/meeting_insight pass above — same transcript,
      // same Gemini call, independent insert target (type: agent_question,
      // matching the convention in extract-inbox-action-items/index.ts for
      // actionable Slack/Gmail findings) so this reuses the exact same
      // `quotes_extracted_at` cursor/gate as quotes: no separate dedup
      // mechanism needed at the transcript level, only per-row (below).
      let commitmentsAddedForTranscript = 0
      for (const c of commitments) {
        if (!c.owner_name || !c.commitment || (c.owed_by !== 'me' && c.owed_by !== 'them')) continue
        if (isNoisySpeakerName(c.owner_name)) {
          console.log(`Commitment owner "${c.owner_name}" looks like a placeholder/dial-in — skipping`)
          continue
        }
        if (commitmentsAddedForTranscript >= COMMITMENT_CAP_PER_TRANSCRIPT) {
          console.log(`Commitment cap (${COMMITMENT_CAP_PER_TRANSCRIPT}) reached for transcript ${transcript.id} — skipping remaining commitments`)
          break
        }

        const commitmentSourceRef = buildCommitmentSourceRef({
          recordingId: transcript.recording_id,
          transcriptId: transcript.id,
          meetingTopic: recording?.topic ?? null,
          saidOn,
        }, c)

        // Dedup on (transcript, owner, commitment) — same idempotency pattern
        // as the meeting_insight check above — so a manual re-extract (via
        // transcript_id) never duplicates rows.
        const commitmentText = buildCommitmentText(c, recording?.topic, saidOn)
        const { data: existingCommitment } = await supabase
          .from('inbox_items')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'agent_question')
          .eq('text', commitmentText)
          .contains('source_ref', { transcript_id: transcript.id, speaker_name: c.owner_name.trim() })
          .maybeSingle()

        if (existingCommitment) {
          console.log(`Commitment already exists for transcript ${transcript.id} / owner "${c.owner_name}" — skipping`)
          continue
        }

        const { error: commitmentErr } = await supabase
          .from('inbox_items')
          .insert({
            user_id: userId,
            type: 'agent_question',
            text: commitmentText,
            status: 'open',
            owed_by: c.owed_by,
            agent_payload: {
              source: 'zoom',
              rationale: c.owed_by === 'me'
                ? 'You committed to this in the meeting'
                : 'They committed to this in the meeting',
              action_required: true,
              cta_label: 'Add to inbox',
            },
            source_ref: commitmentSourceRef,
          })

        if (commitmentErr) {
          console.error(`Failed to insert commitment for transcript ${transcript.id}:`, commitmentErr.message)
        } else {
          commitmentsAddedForTranscript++
          totalCommitmentsAdded++
        }
      }

      // Mark transcript as processed
      await supabase
        .from('cos_zoom_transcripts')
        .update({ quotes_extracted_at: new Date().toISOString() })
        .eq('id', transcript.id)
    }

    return jsonResponse({
      processed: transcripts.length,
      quotes_added: totalQuotesAdded,
      insights_added: totalInsightsAdded,
      commitments_added: totalCommitmentsAdded,
    }, 200)

  } catch (err) {
    console.error('Top-level crash:', String(err))
    return jsonResponse({ error: 'internal_error', detail: String(err) }, 500)
  }
})
