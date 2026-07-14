import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import {
  findMatchingMember,
  matchMemberByTitle,
  DEFAULT_SYNC_RULES,
  type CalendarSyncRules,
  type MinimalMember,
  type MinimalEvent,
} from "../_shared/matchEventToMember.ts"
import { retryWithBackoff } from "../_shared/retryWithBackoff.ts"

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

    // Two auth modes:
    // 1. User JWT — normal client call from "Sync now" button.
    // 2. Service-role key + x-supabase-user-id header — cron/batch invocation.
    let userId: string

    const overrideUserId = req.headers.get('x-supabase-user-id')
    if (overrideUserId && jwt === serviceRoleKey) {
      userId = overrideUserId
      const { data: profile } = await supabase.auth.admin.getUserById(userId)
      if (!profile?.user) {
        return jsonResponse({ error: 'user_not_found' }, 404)
      }
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      userId = userData.user.id
    }

    // Parse + clamp days. Defaults widened to a 90-day window (max 180) to
    // reach back far enough to backfill older recordings on first sync;
    // per-call overrides (e.g. agent-tick's days:1) still apply.
    let days = 90
    try {
      const body = await req.json()
      if (typeof body?.days === 'number' && Number.isFinite(body.days)) {
        days = Math.floor(body.days)
      }
    } catch {
      // empty body is fine
    }
    if (days < 1) days = 1
    if (days > 180) days = 180

    // Load credentials.
    const { data: creds, error: credsErr } = await supabase
      .from('user_zoom_credentials')
      .select('access_token, refresh_token, expires_at, scope, notes_folder_id')
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
    let notesFolderId: string | null = creds.notes_folder_id ?? null

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
      const refreshRes = await retryWithBackoff(
        () => fetch('https://zoom.us/oauth/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        }),
        { integration: 'zoom', label: 'refresh access token' },
      )

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

    // Load the user's tracked (included) group meetings that have a known Zoom
    // meeting ID (extracted from their calendar invite by google-calendar-sync),
    // so recordings can be attributed back to the specific meeting instead of
    // landing as an unlinked "group meeting" suggestion.
    const { data: groupMeetingRows } = await supabase
      .from('cos_group_meetings')
      .select('id, zoom_meeting_id, title, last_seen_at, next_start_at')
      .eq('user_id', userId)
      .eq('included', true)
      .not('zoom_meeting_id', 'is', null)
    const groupMeetingsByZoomId = new Map(
      (groupMeetingRows ?? []).map(g => [g.zoom_meeting_id as string, g.id as string])
    )

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

      const res = await retryWithBackoff(
        () => fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }),
        { integration: 'zoom', label: 'list recordings' },
      )

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
        const partRes = await retryWithBackoff(
          () => fetch(partUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }),
          { integration: 'zoom', label: 'list participants' },
        )
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

      // Relax the rules for Zoom: match against any relationship type. (Zoom
      // recordings are matched by participant, not by attendee count.)
      const zoomRules: CalendarSyncRules = {
        ...rules,
        include_relationship_types: [
          'direct_report', 'collaborator', 'boss', 'peer',
          'skip_level', 'stakeholder', 'external',
        ],
      }
      const match = findMatchingMember(syntheticEvent, members, zoomRules)

      // Fallback: Zoom often doesn't return participant emails/names (the
      // past_meetings participants API needs a scope/plan many accounts lack),
      // so participant matching yields nothing. When that happens, match the
      // recording's title against tracked member names (e.g. "Kristin / Arnaud",
      // "30-min chat — Joe Pritchard"). Only resolves an unambiguous single name.
      const titleMatchId = match ? null : matchMemberByTitle(meeting.topic, members)?.id ?? null
      const resolvedMemberId = match?.member.id ?? titleMatchId

      // Check for transcript files
      const hasTranscript = (meeting.recording_files ?? []).some(
        f => f.file_type === 'TRANSCRIPT' || f.recording_type === 'audio_transcript'
      )

      const row = {
        user_id: userId,
        team_member_id: resolvedMemberId,
        group_meeting_id: groupMeetingsByZoomId.get(String(meeting.id)) ?? null,
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
                const tRes = await retryWithBackoff(
                  () => fetch(transcriptFile.download_url, {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                  }),
                  { integration: 'zoom', label: 'download transcript' },
                )
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
                } else {
                  console.error(`Transcript download failed for meeting ${meeting.uuid}: ${tRes.status} ${tRes.statusText}`)
                }
              } catch (err) {
                console.error(`Transcript download error for meeting ${meeting.uuid}:`, (err as Error).message)
              }
            }
          }
        }
      }
    }

    // ── Calendar-based discovery ─────────────────────────────────────────────
    // The recordings API above only finds meetings the user hosted.
    // Many 1:1 meetings are hosted by the other person (e.g. a manager or peer).
    // Calendar events contain the Zoom Meeting ID in their location or description
    // (e.g. https://clearcompany.zoom.us/j/96115707659).
    // We use those IDs to fetch recordings/transcripts for non-hosted meetings.
    let calendarDiscovered = 0

    // Find calendar events in the date window that have a Zoom meeting ID.
    const { data: calendarEvents } = await supabase
      .from('cos_one_on_one_events')
      .select('zoom_meeting_id, team_member_id, title, start_time')
      .eq('user_id', userId)
      .not('zoom_meeting_id', 'is', null)
      .gte('start_time', from.toISOString())
      .lte('start_time', to.toISOString())

    interface DiscoveryTarget {
      zoom_meeting_id: string
      team_member_id: string | null
      group_meeting_id: string | null
      title: string | null
      start_time: string
    }

    // Group meetings have no per-occurrence calendar row (cos_group_meetings is
    // one row per recurring series), so there's no exact "this instance just
    // ended" timestamp to filter on the way 1:1 events have. Use last_seen_at
    // (falling back to the next scheduled occurrence) as the anchor for Zoom
    // instance-proximity matching below.
    const groupDiscoveryTargets: DiscoveryTarget[] = (groupMeetingRows ?? []).map(g => ({
      zoom_meeting_id: g.zoom_meeting_id as string,
      team_member_id: null,
      group_meeting_id: g.id as string,
      title: g.title as string | null,
      start_time: (g.last_seen_at as string | null) ?? (g.next_start_at as string | null) ?? new Date().toISOString(),
    }))

    const discoveryTargets: DiscoveryTarget[] = [
      ...(calendarEvents ?? []).map(e => ({
        zoom_meeting_id: e.zoom_meeting_id as string,
        team_member_id: e.team_member_id as string | null,
        group_meeting_id: null,
        title: e.title as string | null,
        start_time: e.start_time as string,
      })),
      ...groupDiscoveryTargets,
    ]

    if (discoveryTargets.length > 0) {
      // Find which Zoom meeting IDs we already have recordings for.
      const calendarZoomIds = [...new Set(
        discoveryTargets.map(e => e.zoom_meeting_id)
      )]
      const { data: existingRecordings } = await supabase
        .from('cos_zoom_recordings')
        .select('zoom_meeting_id')
        .eq('user_id', userId)
        .in('zoom_meeting_id', calendarZoomIds)

      const alreadySynced = new Set(
        (existingRecordings ?? []).map(r => r.zoom_meeting_id as string)
      )

      // For each new meeting ID, try to fetch recordings via the per-meeting endpoint.
      for (const calEvent of discoveryTargets) {
        const zoomId = calEvent.zoom_meeting_id
        if (alreadySynced.has(zoomId)) continue
        alreadySynced.add(zoomId) // prevent duplicate attempts within this run

        try {
          const recUrl = `https://api.zoom.us/v2/meetings/${zoomId}/recordings`
          const recRes = await retryWithBackoff(
            () => fetch(recUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }),
            { integration: 'zoom', label: 'per-meeting recordings' },
          )

          if (!recRes.ok) {
            const errBody = await recRes.text().catch(() => '')
            console.warn(`Calendar discovery: recordings API returned ${recRes.status} for meeting ${zoomId}: ${errBody}`)

            // Fallback: resolve meeting number → instance UUIDs, then try meeting summary.
            // The meeting summary endpoint needs a specific instance UUID, not the
            // recurring meeting number. We get UUIDs via the past_meetings/instances API.
            try {
              const instancesUrl = `https://api.zoom.us/v2/past_meetings/${zoomId}/instances`
              const instancesRes = await retryWithBackoff(
                () => fetch(instancesUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` },
                }),
                { integration: 'zoom', label: 'past meeting instances' },
              )

              if (!instancesRes.ok) {
                console.warn(`Calendar discovery: past_meetings/instances returned ${instancesRes.status} for ${zoomId}`)
              } else {
                const instancesData = await instancesRes.json() as {
                  meetings?: Array<{ uuid: string; start_time?: string }>
                }

                // Match instance to calendar event by date proximity.
                const eventTime = new Date(calEvent.start_time).getTime()
                const instances = (instancesData.meetings ?? [])
                  .map(m => ({
                    uuid: m.uuid,
                    startTime: m.start_time,
                    diff: m.start_time ? Math.abs(new Date(m.start_time).getTime() - eventTime) : Infinity,
                  }))
                  .sort((a, b) => a.diff - b.diff)

                // Try the closest instance first (within 24h of the calendar event).
                const matchedInstance = instances.find(i => i.diff < 86_400_000)

                if (matchedInstance) {
                  const encodedUuid = encodeURIComponent(encodeURIComponent(matchedInstance.uuid))

                  // Try AI Companion transcript first (requires cloud_recording:read:meeting_transcript scope).
                  let transcriptContent: string | null = null
                  try {
                    const transcriptRes = await retryWithBackoff(
                      () => fetch(
                        `https://api.zoom.us/v2/meetings/${encodedUuid}/transcript`,
                        { headers: { 'Authorization': `Bearer ${accessToken}` } },
                      ),
                      { integration: 'zoom', label: 'AI Companion transcript' },
                    )
                    if (transcriptRes.ok) {
                      transcriptContent = await transcriptRes.text()
                    } else {
                      console.warn(`Calendar discovery: transcript returned ${transcriptRes.status} for ${matchedInstance.uuid}`)
                    }
                  } catch (tErr) {
                    console.warn(`Calendar discovery: transcript fetch failed for ${matchedInstance.uuid}:`, (tErr as Error).message)
                  }

                  // Also try meeting summary for high-level recap text.
                  let summaryText: string | null = null
                  let meetingTopic: string | null = null
                  let meetingStartTime: string | null = null
                  try {
                    const summaryRes = await retryWithBackoff(
                      () => fetch(
                        `https://api.zoom.us/v2/meetings/${encodedUuid}/meeting_summary`,
                        { headers: { 'Authorization': `Bearer ${accessToken}` } },
                      ),
                      { integration: 'zoom', label: 'meeting summary' },
                    )
                    if (summaryRes.ok) {
                      const summaryData = await summaryRes.json() as {
                        meeting_topic?: string
                        meeting_start_time?: string
                        summary_details?: Array<{ summary_overview?: string; next_steps?: string[] }>
                      }
                      meetingTopic = summaryData.meeting_topic ?? null
                      meetingStartTime = summaryData.meeting_start_time ?? null
                      summaryText = (summaryData.summary_details ?? [])
                        .map(d => [d.summary_overview, ...(d.next_steps ?? [])].filter(Boolean).join('\n'))
                        .join('\n\n') || null
                    } else {
                      console.warn(`Calendar discovery: meeting_summary returned ${summaryRes.status} for ${matchedInstance.uuid}`)
                    }
                  } catch (sErr) {
                    console.warn(`Calendar discovery: summary fetch failed for ${matchedInstance.uuid}:`, (sErr as Error).message)
                  }

                  const row = {
                    user_id: userId,
                    team_member_id: calEvent.team_member_id,
                    group_meeting_id: calEvent.group_meeting_id,
                    zoom_meeting_id: zoomId,
                    zoom_meeting_uuid: matchedInstance.uuid,
                    topic: meetingTopic ?? calEvent.title ?? null,
                    start_time: meetingStartTime ?? matchedInstance.startTime ?? calEvent.start_time,
                    duration_minutes: null,
                    participant_emails: [] as string[],
                    participant_names: [] as string[],
                    has_transcript: !!transcriptContent,
                    recording_files: [] as unknown[],
                    ai_summary: summaryText ?? null,
                    last_synced_at: new Date().toISOString(),
                  }
                  const { error: upsertErr } = await supabase
                    .from('cos_zoom_recordings')
                    .upsert(row, { onConflict: 'user_id,zoom_meeting_uuid' })
                  if (!upsertErr) {
                    calendarDiscovered++
                    synced++

                    if (transcriptContent) {
                      const { data: newRec } = await supabase
                        .from('cos_zoom_recordings')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('zoom_meeting_uuid', matchedInstance.uuid)
                        .single()
                      if (newRec) {
                        const wordCount = transcriptContent.split(/\s+/).length
                        await supabase.from('cos_zoom_transcripts').insert({
                          recording_id: newRec.id,
                          user_id: userId,
                          content: transcriptContent,
                          content_type: 'vtt',
                          word_count: wordCount,
                        })
                        transcriptsFetched++
                      }
                    }
                  }
                } else {
                  console.warn(`Calendar discovery: no matching instance found for meeting ${zoomId} near ${calEvent.start_time}`)
                }
              }
            } catch (summaryErr) {
              console.warn(`Calendar discovery: summary fallback failed for ${zoomId}:`, (summaryErr as Error).message)
            }
            continue
          }

          const recData = await recRes.json() as {
            uuid?: string
            topic?: string
            start_time?: string
            duration?: number
            recording_files?: Array<{
              id: string
              file_type: string
              file_extension: string
              file_size: number
              download_url: string
              status: string
              recording_type: string
            }>
          }

          if (!recData.uuid) continue

          // Fetch participants for team-member matching.
          let participantEmails: string[] = []
          let participantNames: string[] = []
          try {
            const partUrl = `https://api.zoom.us/v2/past_meetings/${encodeURIComponent(recData.uuid)}/participants?page_size=50`
            const partRes = await retryWithBackoff(
              () => fetch(partUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
              }),
              { integration: 'zoom', label: 'list participants (calendar discovery)' },
            )
            if (partRes.ok) {
              const partData = await partRes.json() as ZoomParticipantsResponse
              for (const p of partData.participants ?? []) {
                if (p.user_email) participantEmails.push(p.user_email)
                if (p.name) participantNames.push(p.name)
              }
            }
          } catch {
            // continue without participant data
          }
          participantEmails = [...new Set(participantEmails)]
          participantNames = [...new Set(participantNames)]

          // Use calendar event's team_member_id if participant matching fails.
          const syntheticEvent: MinimalEvent = {
            id: recData.uuid,
            summary: recData.topic ?? calEvent.title ?? '',
            attendees: participantEmails.map((email, i) => ({
              email,
              displayName: participantNames[i] ?? null,
              self: false,
            })),
          }
          const zoomRules: CalendarSyncRules = {
            ...rules,
            max_other_attendees: Math.max(rules.max_other_attendees, 10),
            include_relationship_types: [
              'direct_report', 'collaborator', 'boss', 'peer',
              'skip_level', 'stakeholder', 'external',
            ],
          }
          const match = findMatchingMember(syntheticEvent, members, zoomRules)
          const teamMemberId = match?.member.id ?? calEvent.team_member_id ?? null

          const hasTranscript = (recData.recording_files ?? []).some(
            f => f.file_type === 'TRANSCRIPT' || f.recording_type === 'audio_transcript'
          )

          const row = {
            user_id: userId,
            team_member_id: teamMemberId,
            group_meeting_id: calEvent.group_meeting_id,
            zoom_meeting_id: zoomId,
            zoom_meeting_uuid: recData.uuid,
            topic: recData.topic ?? calEvent.title ?? null,
            start_time: recData.start_time ?? calEvent.start_time,
            duration_minutes: recData.duration ?? null,
            participant_emails: participantEmails,
            participant_names: participantNames,
            has_transcript: hasTranscript,
            recording_files: recData.recording_files ?? [],
            last_synced_at: new Date().toISOString(),
          }

          const { error: upsertErr } = await supabase
            .from('cos_zoom_recordings')
            .upsert(row, { onConflict: 'user_id,zoom_meeting_uuid' })

          if (upsertErr) continue
          calendarDiscovered++
          synced++

          // Fetch transcript for this calendar-discovered meeting.
          if (hasTranscript) {
            const { data: newRec } = await supabase
              .from('cos_zoom_recordings')
              .select('id')
              .eq('user_id', userId)
              .eq('zoom_meeting_uuid', recData.uuid)
              .single()

            if (newRec) {
              const transcriptFile = (recData.recording_files ?? []).find(
                f => f.file_type === 'TRANSCRIPT' || f.recording_type === 'audio_transcript'
              )
              if (transcriptFile?.download_url) {
                try {
                  const tRes = await retryWithBackoff(
                    () => fetch(transcriptFile.download_url, {
                      headers: { 'Authorization': `Bearer ${accessToken}` },
                    }),
                    { integration: 'zoom', label: 'download transcript (calendar discovery)' },
                  )
                  if (tRes.ok) {
                    const content = await tRes.text()
                    const wordCount = content.split(/\s+/).length
                    await supabase.from('cos_zoom_transcripts').insert({
                      recording_id: newRec.id,
                      user_id: userId,
                      content,
                      content_type: 'vtt',
                      word_count: wordCount,
                    })
                    transcriptsFetched++
                  } else {
                    console.error(`Calendar discovery: transcript download failed for meeting ${zoomId}: ${tRes.status}`)
                  }
                } catch (err) {
                  console.error(`Calendar discovery: transcript download error for meeting ${zoomId}:`, (err as Error).message)
                }
              }
            }
          }
        } catch (err) {
          console.error(`Calendar discovery: error processing meeting ${zoomId}:`, (err as Error).message)
        }
      }
    }

    // ── Zoom Docs meeting notes sync ─────────────────────────────────────────
    // AI Companion stores meeting transcripts as Zoom Docs (type=notes).
    // The cloud recordings API misses these entirely, so we list them directly.
    // Requires docs:read:file scope.
    //
    // type=notes only catches AI Companion-generated docs. To also catch docs
    // that live in the user's "My Notes" folder but aren't tagged that way,
    // we bootstrap that folder's id from the parent of any type=notes doc (no
    // Zoom API exposes "get my Notes folder id" directly) and list its
    // children on every run. The folder id is cached per user once found.
    let docsDiscovered = 0

    try {
      const docsUrl = new URL('https://api.zoom.us/v2/docs')
      docsUrl.searchParams.set('type', 'notes')
      docsUrl.searchParams.set('page_size', '100')

      const docsRes = await retryWithBackoff(
        () => fetch(docsUrl.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }),
        { integration: 'zoom', label: 'list docs' },
      )

      const candidateDocs = new Map<string, { file_id: string; title: string; create_time?: string }>()

      if (docsRes.ok) {
        const docsData = await docsRes.json() as {
          docs?: Array<{ file_id: string; title: string; create_time?: string }>
        }
        for (const doc of docsData.docs ?? []) {
          candidateDocs.set(doc.file_id, doc)
        }

        if (!notesFolderId && docsData.docs && docsData.docs.length > 0) {
          try {
            const metaRes = await retryWithBackoff(
              () => fetch(
                `https://api.zoom.us/v2/docs/files/${encodeURIComponent(docsData.docs[0].file_id)}`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } },
              ),
              { integration: 'zoom', label: 'doc file metadata' },
            )
            if (metaRes.ok) {
              const meta = await metaRes.json() as Record<string, unknown>
              const parentId = (meta.parent_id ?? meta.parent_file_id ?? meta.folder_id) as string | undefined
              if (parentId) {
                notesFolderId = parentId
                await supabase
                  .from('user_zoom_credentials')
                  .update({ notes_folder_id: notesFolderId })
                  .eq('user_id', userId)
              }
            } else {
              console.warn(`Zoom Docs sync: file metadata lookup returned ${metaRes.status}`)
            }
          } catch (metaErr) {
            console.warn(`Zoom Docs sync: file metadata lookup failed:`, (metaErr as Error).message)
          }
        }
      } else {
        console.warn(`Zoom Docs sync: API returned ${docsRes.status}`)
      }

      if (notesFolderId) {
        try {
          const childrenRes = await retryWithBackoff(
            () => fetch(
              `https://api.zoom.us/v2/docs/files/${encodeURIComponent(notesFolderId)}/children`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } },
            ),
            { integration: 'zoom', label: 'doc folder children' },
          )
          if (childrenRes.ok) {
            const childrenData = await childrenRes.json() as {
              files?: Array<{ file_id: string; title?: string; name?: string; create_time?: string }>
            }
            for (const child of childrenData.files ?? []) {
              if (!candidateDocs.has(child.file_id)) {
                candidateDocs.set(child.file_id, {
                  file_id: child.file_id,
                  title: child.title ?? child.name ?? '',
                  create_time: child.create_time,
                })
              }
            }
          } else {
            console.warn(`Zoom Docs sync: folder children lookup returned ${childrenRes.status}`)
          }
        } catch (childrenErr) {
          console.warn(`Zoom Docs sync: folder children lookup failed:`, (childrenErr as Error).message)
        }
      }

      {
        const docUuids = [...candidateDocs.keys()].map(id => `doc:${id}`)
        const { data: existingDocRecs } = await supabase
          .from('cos_zoom_recordings')
          .select('zoom_meeting_uuid')
          .eq('user_id', userId)
          .in('zoom_meeting_uuid', docUuids)
        const alreadySyncedDocs = new Set(
          (existingDocRecs ?? []).map(r => r.zoom_meeting_uuid as string)
        )

        for (const doc of candidateDocs.values()) {
          const docUuid = `doc:${doc.file_id}`
          if (alreadySyncedDocs.has(docUuid)) continue

          // Parse "2026-06-25 11:31(GMT-7:00)" from title
          const dateMatch = doc.title.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?:\(GMT([+-]\d+:\d+)\))?/)
          let startTime: string
          if (dateMatch) {
            const tzOffset = dateMatch[3] ?? '-07:00'
            startTime = `${dateMatch[1]}T${dateMatch[2]}:00${tzOffset}`
          } else {
            startTime = doc.create_time ?? new Date().toISOString()
          }

          const startDate = new Date(startTime)
          if (isNaN(startDate.getTime()) || startDate < from || startDate > to) continue

          // Match a team member by name in the title (case-insensitive).
          // Strip the date suffix first so date digits don't confuse matching.
          const titleCore = doc.title.replace(/\d{4}-\d{2}-\d{2}.*$/, '').toLowerCase()
          let matchedMember: MinimalMember | null = null
          for (const member of members) {
            const firstName = member.name.split(' ')[0].toLowerCase()
            const fullName = member.name.toLowerCase()
            if (titleCore.includes(fullName) || titleCore.includes(firstName)) {
              matchedMember = member
              break
            }
          }
          if (!matchedMember) continue

          const row = {
            user_id: userId,
            team_member_id: matchedMember.id,
            zoom_meeting_id: docUuid,
            zoom_meeting_uuid: docUuid,
            topic: doc.title,
            start_time: startTime,
            duration_minutes: null,
            participant_emails: [] as string[],
            participant_names: [] as string[],
            has_transcript: false,
            recording_files: [] as unknown[],
            last_synced_at: new Date().toISOString(),
          }

          const { error: upsertErr } = await supabase
            .from('cos_zoom_recordings')
            .upsert(row, { onConflict: 'user_id,zoom_meeting_uuid' })

          if (!upsertErr) {
            docsDiscovered++
            synced++
          }
        }
      }
    } catch (docsErr) {
      console.warn(`Zoom Docs sync failed:`, (docsErr as Error).message)
    }

    // Mark success.
    await supabase
      .from('user_zoom_credentials')
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'ok' })
      .eq('user_id', userId)

    return jsonResponse({
      synced,
      transcripts_fetched: transcriptsFetched,
      calendar_discovered: calendarDiscovered,
    }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
