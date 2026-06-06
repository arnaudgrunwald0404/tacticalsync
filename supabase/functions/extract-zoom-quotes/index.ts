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

const EXTRACT_PROMPT = `You are analyzing a meeting transcript. Extract 1-3 standout quotes — things a team member said that are insightful, inspiring, funny, or show strong leadership/ownership.

Rules:
- Only extract quotes actually spoken by someone (not the meeting host/user asking questions)
- Each quote must be a direct, verbatim phrase (clean up filler words like "um", "uh", "you know")
- Keep quotes concise (1-3 sentences max)
- Include the speaker's name exactly as it appears in the transcript
- If no noteworthy quotes exist, return an empty array

Return ONLY valid JSON — no markdown fences, no commentary:
[
  { "speaker": "Jane Smith", "quote": "The exact quote here.", "context": "Brief 5-word context" }
]

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

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
    const userId = userData.user.id

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
      return jsonResponse({ processed: 0, quotes_added: 0, message: 'No unprocessed transcripts found' }, 200)
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

    for (const transcript of transcripts) {
      const text = transcript.content_type === 'vtt'
        ? stripVtt(transcript.content)
        : transcript.content

      // Truncate to ~8000 words to stay within context limits
      const words = text.split(/\s+/)
      const truncated = words.length > 8000 ? words.slice(0, 8000).join(' ') + '\n[...truncated]' : text

      console.log(`Processing transcript ${transcript.id}, ${words.length} words`)

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
      const geminiData = await geminiRes.json() as any
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      // Parse JSON from response (strip markdown fences if present)
      const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      // deno-lint-ignore no-explicit-any
      let quotes: Array<{ speaker: string; quote: string; context?: string }> = []
      try {
        quotes = JSON.parse(jsonStr)
        if (!Array.isArray(quotes)) quotes = []
      } catch {
        console.warn(`Failed to parse quotes JSON for transcript ${transcript.id}:`, jsonStr.slice(0, 200))
        quotes = []
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

        if (!matched) {
          console.log(`No member match for speaker "${q.speaker}", skipping quote`)
          continue
        }

        // Check for duplicate quotes
        const { data: existing } = await supabase
          .from('cos_member_quotes')
          .select('id')
          .eq('user_id', userId)
          .eq('team_member_id', matched.id)
          .eq('quote', q.quote)
          .maybeSingle()

        if (existing) continue

        const { error: insertErr } = await supabase
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

        if (!insertErr) totalQuotesAdded++
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
    }, 200)

  } catch (err) {
    console.error('Top-level crash:', String(err))
    return jsonResponse({ error: 'internal_error', detail: String(err) }, 500)
  }
})
