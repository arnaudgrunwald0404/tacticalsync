import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import {
  matchEventToMember,
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

interface SyncRequest {
  days?: number;
}

interface GoogleEvent extends MinimalEvent {
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}

interface GoogleEventsResponse {
  items?: GoogleEvent[];
  nextPageToken?: string;
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
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

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
    let days = 14
    try {
      const body: SyncRequest = await req.json()
      if (typeof body?.days === 'number' && Number.isFinite(body.days)) {
        days = Math.floor(body.days)
      }
    } catch {
      // ignore — empty body is fine
    }
    if (days < 1) days = 1
    if (days > 60) days = 60

    // Load credentials.
    const { data: creds, error: credsErr } = await supabase
      .from('user_calendar_credentials')
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
          .from('user_calendar_credentials')
          .update({ last_sync_status: 'error: refresh failed' })
          .eq('user_id', userId)
        return jsonResponse({ error: 'refresh_failed' }, 401)
      }

      const form = new URLSearchParams()
      form.set('client_id', googleClientId)
      form.set('client_secret', googleClientSecret)
      form.set('refresh_token', refreshToken)
      form.set('grant_type', 'refresh_token')

      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })

      if (!refreshRes.ok) {
        await supabase
          .from('user_calendar_credentials')
          .update({ last_sync_status: 'error: refresh failed' })
          .eq('user_id', userId)
        return jsonResponse({ error: 'refresh_failed' }, 401)
      }

      const refreshData = await refreshRes.json() as { access_token?: string; expires_in?: number }
      if (!refreshData.access_token || typeof refreshData.expires_in !== 'number') {
        await supabase
          .from('user_calendar_credentials')
          .update({ last_sync_status: 'error: refresh failed' })
          .eq('user_id', userId)
        return jsonResponse({ error: 'refresh_failed' }, 401)
      }

      accessToken = refreshData.access_token
      const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

      await supabase
        .from('user_calendar_credentials')
        .update({ access_token: accessToken, expires_at: newExpiresAt })
        .eq('user_id', userId)
    }

    // Load sync rules.
    const { data: settingsRow } = await supabase
      .from('cos_settings')
      .select('calendar_sync_rules')
      .eq('user_id', userId)
      .maybeSingle()
    const rules: CalendarSyncRules =
      (settingsRow?.calendar_sync_rules as CalendarSyncRules | null) ?? DEFAULT_SYNC_RULES

    // Load team members.
    const { data: membersRows, error: membersErr } = await supabase
      .from('cos_team_members')
      .select('id, name, email, relationship_type')
      .eq('user_id', userId)

    if (membersErr) {
      return jsonResponse({ error: membersErr.message }, 500)
    }
    const members: MinimalMember[] = (membersRows ?? []) as MinimalMember[]

    // Build window.
    const now = new Date()
    const timeMin = now.toISOString()
    const timeMaxDate = new Date(now.getTime() + days * 86_400_000)
    const timeMax = timeMaxDate.toISOString()

    // Fetch events with pagination (cap 4 pages).
    const allEvents: GoogleEvent[] = []
    let pageToken: string | undefined = undefined
    const MAX_PAGES = 4
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
      url.searchParams.set('timeMin', timeMin)
      url.searchParams.set('timeMax', timeMax)
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('maxResults', '250')
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (res.status === 401) {
        await supabase
          .from('user_calendar_credentials')
          .update({ last_sync_status: 'error: unauthorized' })
          .eq('user_id', userId)
        return jsonResponse({ error: 'unauthorized' }, 401)
      }

      if (!res.ok) {
        const errText = await res.text()
        await supabase
          .from('user_calendar_credentials')
          .update({ last_sync_status: `error: ${res.status}` })
          .eq('user_id', userId)
        return jsonResponse({ error: `google_api_error`, detail: errText, status: res.status }, 500)
      }

      const data = await res.json() as GoogleEventsResponse
      if (Array.isArray(data.items)) {
        allEvents.push(...data.items)
      }
      if (!data.nextPageToken) break
      pageToken = data.nextPageToken
    }

    // Existing rows in window for created/cancelled diff.
    const { data: existingRows, error: existingErr } = await supabase
      .from('cos_one_on_one_events')
      .select('id, google_event_id, status, start_time')
      .eq('user_id', userId)
      .gte('start_time', timeMin)
      .lte('start_time', timeMax)

    if (existingErr) {
      return jsonResponse({ error: existingErr.message }, 500)
    }
    const existingByEventId = new Map<string, { id: string; status: string | null }>()
    for (const r of existingRows ?? []) {
      if (r.google_event_id) {
        existingByEventId.set(r.google_event_id as string, { id: r.id as string, status: r.status as string | null })
      }
    }

    let created = 0
    let updated = 0
    let skipped = 0
    const seenEventIds = new Set<string>()

    for (const event of allEvents) {
      if (!event.start?.dateTime) {
        // All-day or malformed event — skip.
        skipped++
        continue
      }
      seenEventIds.add(event.id)

      const match = matchEventToMember(event, members, rules)
      if (!match) {
        skipped++
        continue
      }

      const status: string =
        event.status === 'cancelled'
          ? 'cancelled'
          : event.status === 'tentative'
            ? 'tentative'
            : 'confirmed'

      const attendeeEmails = (match.otherAttendees ?? [])
        .map(a => a.email)
        .filter((e): e is string => !!e)

      const row = {
        user_id: userId,
        team_member_id: match.member.id,
        google_event_id: event.id,
        calendar_id: 'primary',
        title: event.summary ?? null,
        start_time: event.start.dateTime,
        end_time: event.end?.dateTime ?? null,
        attendee_emails: attendeeEmails,
        status,
        last_synced_at: new Date().toISOString(),
      }

      const { error: upsertErr } = await supabase
        .from('cos_one_on_one_events')
        .upsert(row, { onConflict: 'user_id,google_event_id' })

      if (upsertErr) {
        skipped++
        continue
      }

      if (existingByEventId.has(event.id)) {
        updated++
      } else {
        created++
      }
    }

    // Soft-cancel: existing non-cancelled rows in window not seen this run.
    let cancelled = 0
    const toCancelIds: string[] = []
    for (const [eventId, row] of existingByEventId.entries()) {
      if (!seenEventIds.has(eventId) && row.status !== 'cancelled') {
        toCancelIds.push(row.id)
      }
    }
    if (toCancelIds.length > 0) {
      const { error: cancelErr, count } = await supabase
        .from('cos_one_on_one_events')
        .update({ status: 'cancelled', last_synced_at: new Date().toISOString() }, { count: 'exact' })
        .in('id', toCancelIds)
      if (!cancelErr) {
        cancelled = count ?? toCancelIds.length
      }
    }

    // Mark success.
    await supabase
      .from('user_calendar_credentials')
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'ok' })
      .eq('user_id', userId)

    return jsonResponse({ created, updated, cancelled, skipped }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
