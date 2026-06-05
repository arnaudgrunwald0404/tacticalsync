import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import {
  findMatchingMember,
  DEFAULT_SYNC_RULES,
  type CalendarSyncRules,
  type MinimalMember,
  type MinimalEvent,
} from "../_shared/matchEventToMember.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ZoomRecording {
  uuid: string
  id: number
  topic: string
  start_time: string
  duration: number
  recording_files?: Array<{
    id: string
    file_type: string
    file_extension: string
    file_size: number
    download_url: string
    status: string
    recording_type: string
  }>
  participant_audio_files?: Array<{
    id: string
    file_name: string
    download_url: string
  }>
}

interface ZoomRecordingsResponse {
  meetings?: ZoomRecording[]
  next_page_token?: string
}

interface ZoomParticipant {
  id?: string
  name: string
  user_email: string
}

interface ZoomParticipantsResponse {
  participants?: ZoomParticipant[]
  next_page_token?: string
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const zoomClientId = Deno.env.get('ZOOM_CLIENT_ID') ?? ''
    const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET') ?? ''

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'missing_authorization' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return jsonResponse({ error: 'invalid_token' }, 401)
    }
    const userId = userData.user.id

    // Parse + clamp days.
    let days = 30
    try {
      const body = await req.json()
      if (typeof body?.days === 'number' && Number.isFinite(body.days)) {
        days = Math.floor(body.days)
      }
    } catch {
      // empty body is fine
    }
    if (days < 1) days = 1
    if (days > 90) days = 90

    // Load credentials.
    const { data: creds, error: credsErr } = await supabase
      .from('user_zoom_credentials')
      .select('access_token, refresh_token, expires_at, scope')
      .eq('user_id', userId)
      .maybeSingle()

    if (credsErr) {
      return jsonResponse({ error: credsErr.message }, 500)
    }
    if (!creds) {
      return jsonResponse({ error: 'not_connected' }, 400)
    }

    let accessToken: string = creds.access_token
    const refreshToken: string | null = creds.refresh_token
    const expiresAt: string | null = creds.expires_at

    // Refresh if expired or near-expired (30s skew).
    const needsRefresh = !expiresAt || (new Date(expiresAt).getTime() - Date.now() < 30_000)
    if (needsRefresh) {
      if (!refreshToken) {
        await supabase
          .from('user_zoom_credentials')
          .update({ last_sync_status: 'error: refresh failed' })
          .eq('user_id', userId)
        return jsonResponse({ error: 'refresh_failed' }, 401)
      }

      const basicAuth = btoa(`${zoomClientId}:${zoomClientSecret}`)
      const refreshRes = await fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      })

      if (!refreshRes.ok) {
        const status = refreshRes.status
        const syncStatus = status === 401
          ? 'error: reauth_required'
          : 'error: refresh failed'
        await supabase
          .from('user_zoom_credentials')
          .update({ last_sync_status: syncStatus })
          .eq('user_id', userId)
        return jsonResponse({ error: syncStatus }, 401)
      }

      const refreshData = await refreshRes.json() as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
      }
      if (!refreshData.access_token || typeof refreshData.expires_in !== 'number') {
        await supabase
          .from('user_zoom_credentials')
          .update({ last_sync_status: 'error: refresh failed' })
          .eq('user_id', userId)
        return jsonResponse({ error: 'refresh_failed' }, 401)
      }

      accessToken = refreshData.access_token
      const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

      // Zoom issues a new refresh_token on every refresh — must persist it.
      const updatePayload: Record<string, unknown> = {
        access_token: accessToken,
        expires_at: newExpiresAt,
      }
      if (refreshData.refresh_token) {
        updatePayload.refresh_token = refreshData.refresh_token
      }

      await supabase
        .from('user_zoom_credentials')
        .update(updatePayload)
        .eq('user_id', userId)
    }

    // Load team members for participant matching.
    const { data: membersRows } = await supabase
      .from('cos_team_members')
      .select('id, name, email, relationship_type')
      .eq('user_id', userId)
    const members: MinimalMember[] = (membersRows ?? []) as MinimalMember[]

    // Load sync rules for member matching.
    const { data: settingsRow } = await supabase
      .from('cos_settings')
      .select('calendar_sync_rules')
      .eq('user_id', userId)
      .maybeSingle()
    const rules: CalendarSyncRules =
      (settingsRow?.calendar_sync_rules as CalendarSyncRules | null) ?? DEFAULT_SYNC_RULES

    // Build date window.
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)
    const fromStr = from.toISOString().slice(0, 10)
    const toStr = to.toISOString().slice(0, 10)

    // Fetch recordings with pagination (cap 4 pages).
    const allMeetings: ZoomRecording[] = []
    let nextPageToken: string | undefined = undefined
    const MAX_PAGES = 4
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL('https://api.zoom.us/v2/users/me/recordings')
      url.searchParams.set('from', fromStr)
      url.searchParams.set('to', toStr)
      url.searchParams.set('page_size', '100')
      if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken)

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })

      if (res.status === 401) {
        await supabase
          .from('user_zoom_credentials')
          .update({ last_sync_status: 'error: unauthorized' })
          .eq('user_id', userId)
        return jsonResponse({ error: 'unauthorized' }, 401)
      }

      if (!res.ok) {
        const errText = await res.text()
        await supabase
          .from('user_zoom_credentials')
          .update({ last_sync_status: `error: ${res.status}` })
          .eq('user_id', userId)
        return jsonResponse({ error: 'zoom_api_error', detail: errText, status: res.status }, 500)
      }

      const data = await res.json() as ZoomRecordingsResponse
      if (Array.isArray(data.meetings)) {
        allMeetings.push(...data.meetings)
      }
      if (!data.next_page_token) break
      nextPageToken = data.next_page_token
    }

    let synced = 0
    let transcriptsFetched = 0

    for (const meeting of allMeetings) {
      // Fetch participants to match against team members.
      let participantEmails: string[] = []
      let participantNames: string[] = []

      try {
        const partUrl = `https://api.zoom.us/v2/past_meetings/${encodeURIComponent(meeting.uuid)}/participants?page_size=50`
        const partRes = await fetch(partUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
        if (partRes.ok) {
          const partData = await partRes.json() as ZoomParticipantsResponse
          for (const p of partData.participants ?? []) {
            if (p.user_email) participantEmails.push(p.user_email)
            if (p.name) participantNames.push(p.name)
          }
        }
      } catch {
        // participant fetch failed — continue without participant data
      }

      // Deduplicate
      participantEmails = [...new Set(participantEmails)]
      participantNames = [...new Set(participantNames)]

      // Build a synthetic MinimalEvent for findMatchingMember
      const syntheticEvent: MinimalEvent = {
        id: meeting.uuid,
        summary: meeting.topic,
        attendees: participantEmails.map((email, i) => ({
          email,
          displayName: participantNames[i] ?? null,
          self: false,
        })),
      }

      // Relax the rules for Zoom: allow any relationship type and higher attendee cap
      const zoomRules: CalendarSyncRules = {
        ...rules,
        max_other_attendees: Math.max(rules.max_other_attendees, 10),
        include_relationship_types: [
          'direct_report', 'collaborator', 'boss', 'peer',
          'skip_level', 'stakeholder', 'external',
        ],
      }
      const match = findMatchingMember(syntheticEvent, members, zoomRules)

      // Check for transcript files
      const hasTranscript = (meeting.recording_files ?? []).some(
        f => f.file_type === 'TRANSCRIPT' || f.recording_type === 'audio_transcript'
      )

      const row = {
        user_id: userId,
        team_member_id: match?.member.id ?? null,
        zoom_meeting_id: String(meeting.id),
        zoom_meeting_uuid: meeting.uuid,
        topic: meeting.topic ?? null,
        start_time: meeting.start_time,
        duration_minutes: meeting.duration ?? null,
        participant_emails: participantEmails,
        participant_names: participantNames,
        has_transcript: hasTranscript,
        recording_files: meeting.recording_files ?? [],
        last_synced_at: new Date().toISOString(),
      }

      const { error: upsertErr } = await supabase
        .from('cos_zoom_recordings')
        .upsert(row, { onConflict: 'user_id,zoom_meeting_uuid' })

      if (upsertErr) continue
      synced++

      // Auto-populate email on cos_team_members when matched by name
      if (match && !match.member.email && match.matchedAttendee?.email) {
        if (match.matchedBy === 'name' || match.matchedBy === 'first_name') {
          await supabase
            .from('cos_team_members')
            .update({ email: match.matchedAttendee.email })
            .eq('id', match.member.id)
          match.member.email = match.matchedAttendee.email
        }
      }

      // Fetch transcript if available and not already stored
      if (hasTranscript) {
        const { data: existingRecording } = await supabase
          .from('cos_zoom_recordings')
          .select('id')
          .eq('user_id', userId)
          .eq('zoom_meeting_uuid', meeting.uuid)
          .single()

        if (existingRecording) {
          const { data: existingTranscript } = await supabase
            .from('cos_zoom_transcripts')
            .select('id')
            .eq('recording_id', existingRecording.id)
            .maybeSingle()

          if (!existingTranscript) {
            const transcriptFile = (meeting.recording_files ?? []).find(
              f => f.file_type === 'TRANSCRIPT' || f.recording_type === 'audio_transcript'
            )

            if (transcriptFile?.download_url) {
              try {
                const tRes = await fetch(`${transcriptFile.download_url}?access_token=${accessToken}`)
                if (tRes.ok) {
                  const content = await tRes.text()
                  const wordCount = content.split(/\s+/).length

                  await supabase.from('cos_zoom_transcripts').insert({
                    recording_id: existingRecording.id,
                    user_id: userId,
                    content,
                    content_type: 'vtt',
                    word_count: wordCount,
                  })
                  transcriptsFetched++
                }
              } catch {
                // transcript fetch failed — continue
              }
            }
          }
        }
      }
    }

    // Mark success.
    await supabase
      .from('user_zoom_credentials')
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'ok' })
      .eq('user_id', userId)

    return jsonResponse({ synced, transcripts_fetched: transcriptsFetched }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
