import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import {
  findMatchingMemberWithDiagnostics,
  passesTitleFilters,
  inferCategory,
  DEFAULT_SYNC_RULES,
  type CalendarSyncRules,
  type MinimalMember,
  type MinimalEvent,
  type UnmatchedEvent,
  type EventCategory,
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
  recurringEventId?: string | null;
  recurrence?: string[] | null;
  location?: string | null;
  description?: string | null;
}

/**
 * Extract a Zoom numeric meeting ID from a URL or text string.
 * Handles formats like:
 *   https://clearcompany.zoom.us/j/96115707659
 *   https://zoom.us/j/96115707659?pwd=...
 *   Meeting ID: 961 1570 7659
 */
function extractZoomMeetingId(text: string): string | null {
  // URL format: /j/{meetingId}
  const urlMatch = text.match(/zoom\.us\/j\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  // Text format: "Meeting ID: 961 1570 7659"
  const textMatch = text.match(/Meeting\s+ID[:\s]+(\d[\d\s]+\d)/)
  if (textMatch) return textMatch[1].replace(/\s+/g, '')
  return null
}

/** Convert average days between meetings to a human-friendly label. */
function toCadenceLabel(avgDays: number): string {
  if (avgDays >= 1 && avgDays <= 2) return 'Daily';
  if (avgDays >= 5 && avgDays <= 9) return 'Weekly';
  if (avgDays >= 10 && avgDays <= 18) return 'Biweekly';
  if (avgDays >= 19 && avgDays <= 24) return 'Every 3 weeks';
  if (avgDays >= 25 && avgDays <= 38) return 'Monthly';
  if (avgDays >= 39 && avgDays <= 52) return 'Every 6 weeks';
  if (avgDays >= 53 && avgDays <= 75) return 'Every 2 months';
  if (avgDays >= 76 && avgDays <= 105) return 'Quarterly';
  return `~${avgDays}d`;
}

/** Try to parse RRULE frequency directly from Google Calendar recurrence rules. */
function cadenceFromRRule(recurrence: string[]): { label: string; days: number } | null {
  for (const rule of recurrence) {
    if (!rule.startsWith('RRULE:')) continue;
    const parts = Object.fromEntries(
      rule.slice(6).split(';').map(p => p.split('=') as [string, string])
    );
    const freq = parts['FREQ'];
    const interval = parseInt(parts['INTERVAL'] ?? '1', 10);
    if (freq === 'DAILY')   return { label: toCadenceLabel(interval), days: interval };
    if (freq === 'WEEKLY')  return { label: toCadenceLabel(7 * interval), days: 7 * interval };
    if (freq === 'MONTHLY') return { label: toCadenceLabel(30 * interval), days: 30 * interval };
  }
  return null;
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

    // Two auth modes:
    // 1. User JWT — normal client call from "Sync now" button.
    // 2. Service-role key + x-supabase-user-id header — cron/batch invocation.
    let userId: string
    let userEmail: string

    const overrideUserId = req.headers.get('x-supabase-user-id')
    if (overrideUserId && jwt === serviceRoleKey) {
      userId = overrideUserId
      const { data: profile } = await supabase.auth.admin.getUserById(userId)
      if (!profile?.user) {
        return jsonResponse({ error: 'user_not_found' }, 404)
      }
      userEmail = profile.user.email ?? ''
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      userId = userData.user.id
      userEmail = userData.user.email ?? ''
    }

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
    const unmatchedEvents: UnmatchedEvent[] = []

    // Track per-member events for cadence computation at the end.
    const memberEvents = new Map<string, { times: string[]; recurringIds: Set<string>; recurrenceRules: string[] }>()

    for (const event of allEvents) {
      if (!event.start?.dateTime) {
        // All-day or malformed event — skip.
        skipped++
        continue
      }
      seenEventIds.add(event.id)

      // Skip events that fail title filters before running diagnostics.
      if (!passesTitleFilters(event, rules)) {
        skipped++
        continue
      }

      // Check attendee cap (still respect max_other_attendees).
      const others = (event.attendees ?? []).filter((a: { self?: boolean }) => !a.self)
      if (others.length === 0 || others.length > rules.max_other_attendees) {
        skipped++
        continue
      }

      // Try to match a team member (optional — just enriches the category).
      const { match, unmatched } = findMatchingMemberWithDiagnostics(event, members, rules)
      if (unmatched) unmatchedEvents.push(unmatched)

      const primaryAttendee = others[0] as { email?: string | null; displayName?: string | null }
      const attendeeEmail = primaryAttendee?.email ?? null
      const attendeeName = primaryAttendee?.displayName ?? null

      // Auto-populate email on cos_team_members when matched by name/local-part and the
      // member has no email yet. This bootstraps exact-email matching for future syncs.
      if (
        match &&
        attendeeEmail &&
        !match.member.email &&
        (match.matchedBy === 'name' || match.matchedBy === 'first_name' || match.matchedBy === 'email_local')
      ) {
        await supabase
          .from('cos_team_members')
          .update({ email: attendeeEmail })
          .eq('id', match.member.id)
        // Update in-memory so later events in this run benefit too.
        match.member.email = attendeeEmail
      }
      const category: EventCategory = inferCategory(attendeeEmail, userEmail, match?.member ?? null)

      const status: string =
        event.status === 'cancelled'
          ? 'cancelled'
          : event.status === 'tentative'
            ? 'tentative'
            : 'confirmed'

      const attendeeEmails = others
        .map((a: { email?: string | null }) => a.email)
        .filter((e: string | null | undefined): e is string => !!e)

      // Extract Zoom meeting ID from location or description.
      const eventLocation = event.location ?? null
      const eventDescription = event.description ?? null
      const zoomMeetingId =
        (eventLocation ? extractZoomMeetingId(eventLocation) : null) ??
        (eventDescription ? extractZoomMeetingId(eventDescription) : null)

      const row = {
        user_id: userId,
        team_member_id: match?.member.id ?? null,
        google_event_id: event.id,
        recurring_event_id: event.recurringEventId ?? null,
        calendar_id: 'primary',
        title: event.summary ?? null,
        start_time: event.start.dateTime,
        end_time: event.end?.dateTime ?? null,
        attendee_emails: attendeeEmails,
        attendee_name: attendeeName,
        attendee_email: attendeeEmail,
        inferred_category: category,
        status,
        location: eventLocation,
        description: eventDescription,
        zoom_meeting_id: zoomMeetingId,
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

      // Accumulate for cadence computation.
      if (match && event.start?.dateTime && status === 'confirmed') {
        const entry = memberEvents.get(match.member.id) ?? { times: [], recurringIds: new Set(), recurrenceRules: [] }
        entry.times.push(event.start.dateTime)
        if (event.recurringEventId) entry.recurringIds.add(event.recurringEventId)
        if (event.recurrence) entry.recurrenceRules.push(...event.recurrence)
        memberEvents.set(match.member.id, entry)
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

    // ── Compute and store meeting cadence per member ──────────────────────────
    // For recurring meetings: fetch the master event from Google Calendar API to
    // read the RRULE directly — this is the authoritative source of frequency.
    // For non-recurring meetings: fall back to interval inference from past events.

    // 1. Collect all unique recurringEventIds we need to look up.
    const recurringIdToMembers = new Map<string, string[]>()
    for (const [memberId, entry] of memberEvents.entries()) {
      for (const rid of entry.recurringIds) {
        const list = recurringIdToMembers.get(rid) ?? []
        list.push(memberId)
        recurringIdToMembers.set(rid, list)
      }
    }

    // 2. Fetch master events from Google Calendar to get their RRULE.
    //    Each recurring series has one master event; we batch with a cap to avoid
    //    hammering the API (most users have < 20 distinct recurring 1:1 series).
    const rruleCache = new Map<string, { label: string; days: number }>()
    const recurringIds = [...recurringIdToMembers.keys()].slice(0, 30)

    for (const rid of recurringIds) {
      try {
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(rid)}`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) continue
        const master = await res.json() as { recurrence?: string[] }
        if (master.recurrence) {
          const parsed = cadenceFromRRule(master.recurrence)
          if (parsed) rruleCache.set(rid, parsed)
        }
      } catch {
        // Non-critical — we'll fall back to interval inference.
      }
    }

    // 3. Resolve cadence per member: RRULE first, then interval inference.
    for (const [memberId, entry] of memberEvents.entries()) {
      let cadenceLabel: string | null = null
      let cadenceDays: number | null = null

      // Try RRULE from any of this member's recurring series.
      for (const rid of entry.recurringIds) {
        const parsed = rruleCache.get(rid)
        if (parsed) {
          cadenceLabel = parsed.label
          cadenceDays = parsed.days
          break
        }
      }

      // Fall back to interval inference for non-recurring meetings.
      if (!cadenceLabel && entry.times.length >= 2) {
        const sorted = entry.times
          .map(t => new Date(t).getTime())
          .sort((a, b) => a - b)

        let totalGap = 0
        for (let i = 1; i < sorted.length; i++) {
          totalGap += sorted[i] - sorted[i - 1]
        }
        const avgMs = totalGap / (sorted.length - 1)
        cadenceDays = Math.round(avgMs / 86_400_000)
        if (cadenceDays > 0) {
          cadenceLabel = toCadenceLabel(cadenceDays)
        }
      }

      if (cadenceLabel) {
        await supabase
          .from('cos_team_members')
          .update({ meeting_cadence: cadenceLabel, meeting_cadence_days: cadenceDays })
          .eq('id', memberId)
      }
    }

    // Mark success.
    await supabase
      .from('user_calendar_credentials')
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'ok' })
      .eq('user_id', userId)

    return jsonResponse({ created, updated, cancelled, skipped, unmatched: unmatchedEvents }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
