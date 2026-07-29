// Tool: propose_meeting_time
//
// v1 scoping deliberately stops short of "check both calendars and book the
// meeting": the OAuth scope granted for calendar connections is
// calendar.events.readonly (src/lib/calendarZoomConnect.ts), so this tool
// never writes to any calendar, and there is no linkage from a team member
// (cos_team_members) to their own connected calendar, so it can only ever
// see the acting user's own busy/free time — never the other person's. It
// reads the acting user's calendar, proposes a few open slots, and sends
// them to the other person over Slack DM for them to confirm. Booking (and
// checking the other person's calendar) is a follow-up, not this pass.

import type { Tool, ToolContext, ToolExecutionResult } from './types.ts'
import { retryWithBackoff } from '../../_shared/retryWithBackoff.ts'

interface ProposeMeetingTimeParams {
  team_member_id: string
  window_start_utc: string
  window_end_utc: string
  duration_minutes: number
  resolved_member_name?: string
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const MAX_WINDOW_DAYS = 14
const MAX_CANDIDATES = 3

function isParams(v: Record<string, unknown>): v is ProposeMeetingTimeParams & Record<string, unknown> {
  return typeof v.team_member_id === 'string'
    && typeof v.window_start_utc === 'string'
    && typeof v.window_end_utc === 'string'
    && typeof v.duration_minutes === 'number'
}

function formatWindow(startUtc: string, endUtc: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }
  const start = new Date(startUtc).toLocaleString('en-US', opts)
  const end = new Date(endUtc).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  return `${start}–${end} UTC`
}

function formatSlot(startUtc: string, durationMinutes: number): string {
  const start = new Date(startUtc)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }
  const startStr = start.toLocaleString('en-US', opts)
  const endStr = end.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  return `${startStr}–${endStr} UTC`
}

export const proposeMeetingTimeTool: Tool = {
  name: 'propose_meeting_time',

  validateParams(params) {
    if (!isParams(params)) return 'team_member_id, window_start_utc, window_end_utc and duration_minutes are required.'
    if (!UUID_RE.test(params.team_member_id)) return 'team_member_id must be a UUID.'

    const start = Date.parse(params.window_start_utc)
    const end = Date.parse(params.window_end_utc)
    if (Number.isNaN(start)) return 'window_start_utc must be a valid ISO datetime.'
    if (Number.isNaN(end)) return 'window_end_utc must be a valid ISO datetime.'
    if (end <= start) return 'window_end_utc must be after window_start_utc.'
    if (end - start > MAX_WINDOW_DAYS * 86_400_000) return `window cannot span more than ${MAX_WINDOW_DAYS} days.`

    if (!Number.isFinite(params.duration_minutes) || params.duration_minutes < 5 || params.duration_minutes > 480) {
      return 'duration_minutes must be between 5 and 480.'
    }
    if (end - start < params.duration_minutes * 60_000) return 'the window is shorter than duration_minutes.'

    return null
  },

  describe(params) {
    const p = params as unknown as ProposeMeetingTimeParams
    const name = p.resolved_member_name ?? 'them'
    return `Check my calendar ${formatWindow(p.window_start_utc, p.window_end_utc)} and send ${name} time options via Slack`
  },

  async execute(ctx: ToolContext, params): Promise<ToolExecutionResult> {
    const db = ctx.db as any
    if (!isParams(params)) throw new Error('Invalid params.')

    // ── Resolve the team member (must belong to the acting user) ──────────
    const { data: member } = await db
      .from('cos_team_members')
      .select('id, name, email')
      .eq('id', params.team_member_id)
      .eq('user_id', ctx.userId)
      .maybeSingle()
    const memberEmail = (member as { email?: string } | null)?.email
    if (!memberEmail) {
      throw new Error("Couldn't find that person's email — add it in Team Members settings, then retry this step.")
    }
    const memberName = (member as { name?: string } | null)?.name ?? memberEmail

    // ── Calendar: load + refresh the acting user's own credentials ────────
    const { data: creds } = await db
      .from('user_calendar_credentials')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    if (!creds) {
      throw new Error('Your calendar is not connected. Connect it in Settings, then retry this step.')
    }

    let accessToken: string = creds.access_token
    const needsRefresh = !creds.expires_at || (new Date(creds.expires_at).getTime() - Date.now() < 30_000)
    if (needsRefresh) {
      if (!creds.refresh_token) throw new Error('Your calendar connection expired. Reconnect it in Settings, then retry this step.')

      const form = new URLSearchParams()
      form.set('client_id', Deno.env.get('GOOGLE_CLIENT_ID') ?? '')
      form.set('client_secret', Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '')
      form.set('refresh_token', creds.refresh_token)
      form.set('grant_type', 'refresh_token')

      const refreshRes = await retryWithBackoff(
        () => fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        }),
        { integration: 'google-calendar', label: 'refresh access token' },
      )
      if (!refreshRes.ok) throw new Error('Your calendar connection expired. Reconnect it in Settings, then retry this step.')

      const refreshData = await refreshRes.json() as { access_token?: string; expires_in?: number }
      if (!refreshData.access_token || typeof refreshData.expires_in !== 'number') {
        throw new Error('Your calendar connection expired. Reconnect it in Settings, then retry this step.')
      }

      accessToken = refreshData.access_token
      const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      await db.from('user_calendar_credentials').update({ access_token: accessToken, expires_at: newExpiresAt }).eq('user_id', ctx.userId)
    }

    // ── List events in the window and compute busy blocks ──────────────────
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('timeMin', params.window_start_utc)
    url.searchParams.set('timeMax', params.window_end_utc)
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')

    const eventsRes = await retryWithBackoff(
      () => fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } }),
      { integration: 'google-calendar', label: 'list events' },
    )
    if (eventsRes.status === 401) throw new Error('Your calendar connection expired. Reconnect it in Settings, then retry this step.')
    if (!eventsRes.ok) throw new Error(`Couldn't read your calendar (HTTP ${eventsRes.status}).`)

    const eventsData = await eventsRes.json() as {
      items?: {
        status?: string
        transparency?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
      }[]
    }

    const busy: { start: number; end: number }[] = []
    for (const event of eventsData.items ?? []) {
      if (event.status === 'cancelled') continue
      if (event.transparency === 'transparent') continue // marked "free" — doesn't block
      const startStr = event.start?.dateTime ?? event.start?.date
      const endStr = event.end?.dateTime ?? event.end?.date
      if (!startStr || !endStr) continue
      const s = Date.parse(startStr)
      const e = Date.parse(endStr)
      if (Number.isNaN(s) || Number.isNaN(e)) continue
      busy.push({ start: s, end: e })
    }
    busy.sort((a, b) => a.start - b.start)

    // ── Walk the window in duration-sized steps, collecting open slots ─────
    const durationMs = params.duration_minutes * 60_000
    const windowStart = Date.parse(params.window_start_utc)
    const windowEnd = Date.parse(params.window_end_utc)
    const candidates: string[] = []

    for (let slotStart = windowStart; slotStart + durationMs <= windowEnd && candidates.length < MAX_CANDIDATES; slotStart += durationMs) {
      const slotEnd = slotStart + durationMs
      const overlaps = busy.some(b => slotStart < b.end && slotEnd > b.start)
      if (!overlaps) candidates.push(new Date(slotStart).toISOString())
    }

    if (candidates.length === 0) {
      throw new Error('No open slots found in that window — try widening it, then retry this step.')
    }

    // ── Send the proposal over Slack DM ─────────────────────────────────────
    const { data: slackCred } = await db
      .from('user_slack_credentials')
      .select('access_token')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    const slackToken = (slackCred as { access_token: string } | null)?.access_token
    if (!slackToken) {
      throw new Error('Slack is not connected. Connect it in Settings, then retry this step.')
    }

    const lookupRes = await retryWithBackoff(
      () => fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(memberEmail)}`, {
        headers: { Authorization: `Bearer ${slackToken}` },
      }),
      { integration: 'slack', label: 'users.lookupByEmail' },
    )
    const lookupData = await lookupRes.json() as { ok: boolean; user?: { id: string }; error?: string }
    if (!lookupData.ok || !lookupData.user?.id) {
      throw new Error(`Couldn't find ${memberName} on Slack (${lookupData.error ?? 'unknown error'}).`)
    }

    const openRes = await retryWithBackoff(
      () => fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${slackToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: lookupData.user!.id }),
      }),
      { integration: 'slack', label: 'conversations.open' },
    )
    const openData = await openRes.json() as { ok: boolean; channel?: { id: string }; error?: string }
    if (!openData.ok || !openData.channel?.id) {
      throw new Error(`Couldn't open a DM with ${memberName} (${openData.error ?? 'unknown error'}).`)
    }

    const message = [
      `Hey! Looking to grab some time — do any of these work for you?`,
      ...candidates.map(c => `• ${formatSlot(c, params.duration_minutes)}`),
      `Let me know which works, or suggest another time.`,
    ].join('\n')

    const sendRes = await retryWithBackoff(
      () => fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${slackToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: openData.channel!.id, text: message }),
      }),
      { integration: 'slack', label: 'chat.postMessage' },
    )
    const sendData = await sendRes.json() as { ok: boolean; ts?: string; error?: string }
    if (!sendData.ok) {
      throw new Error(`Slack rejected the message: ${sendData.error ?? 'unknown error'}.`)
    }

    return {
      result: { candidate_slots: candidates, sent_to: memberEmail, ts: sendData.ts },
    }
  },
}
