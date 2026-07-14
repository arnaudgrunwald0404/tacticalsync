import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { matchMemberByTitle, type MinimalMember } from "../_shared/matchEventToMember.ts"
import { retryWithBackoff } from "../_shared/retryWithBackoff.ts"

// ── Gmail "Meeting assets ready" sync ────────────────────────────────────────
//
// Zoom emails "Meeting assets for {topic} are ready!" to the meeting HOST once
// a cloud recording/AI summary is ready. zoom-recordings-sync already covers
// hosted meetings via the Zoom API directly — this is a resilience fallback
// for cases where that path misses something (e.g. cloud recording disabled
// but an AI Companion summary still got emailed). It only ever sees meetings
// the connected user hosted, since Zoom only emails the host.
//
// Requires the `https://www.googleapis.com/auth/gmail.readonly` scope on the
// user's Google connection (see src/lib/calendarZoomConnect.ts). Users who
// connected Google before this scope was added need to reconnect.

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

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}
interface GmailMessage {
  id: string
  internalDate?: string
  payload?: { headers?: GmailHeader[] } & GmailPart
}
interface GmailListResponse {
  messages?: Array<{ id: string }>
  nextPageToken?: string
}

function base64UrlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/** Depth-first search for the text/html part of a (possibly multipart) message. */
function findHtmlBody(part: GmailPart | undefined): string | null {
  if (!part) return null
  if (part.mimeType === 'text/html' && part.body?.data) return base64UrlDecode(part.body.data)
  for (const child of part.parts ?? []) {
    const found = findHtmlBody(child)
    if (found) return found
  }
  return null
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Subject looks like "Meeting assets for {topic} are ready!" */
function extractTopicFromSubject(subject: string): string | null {
  const m = subject.match(/^Meeting assets for (.+?)\s+(?:is|are) ready!?\s*$/i)
  return m ? m[1].trim() : null
}

/** The "View in Zoom" / recording links embed the meeting UUID, double
 *  URL-encoded (e.g. meeting_id%3De6uMmswARDe%252FlkpDc8hRVA%253D%253D). */
function extractMeetingUuid(html: string): string | null {
  const m = html.match(/meeting_?[Ii]d%3D([^"&]+?)(?:%26|&|")/)
  if (!m) return null
  try {
    return decodeURIComponent(decodeURIComponent(m[1]))
  } catch {
    return null
  }
}

/** Slice out the "Meeting summary" card (id="branding-doc-summary") and
 *  convert it to plain text — content, not markup, is what downstream
 *  action-item extraction needs. */
function extractSummaryText(html: string): string | null {
  const start = html.indexOf('id="branding-doc-summary"')
  if (start === -1) return null
  const tipsIdx = html.indexOf('class="tips-text"', start)
  const end = tipsIdx === -1 ? html.length : tipsIdx
  const text = htmlToText(html.slice(start, end))
  return text.length > 0 ? text : null
}

function extractDurationMinutes(html: string): number | null {
  const m = html.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, hh, mm, ss] = m
  return parseInt(hh, 10) * 60 + parseInt(mm, 10) + Math.round(parseInt(ss, 10) / 60)
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
    if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Two auth modes: user JWT (manual "Sync now"), or service-role + header (cron).
    let userId: string
    const overrideUserId = req.headers.get('x-supabase-user-id')
    if (overrideUserId && jwt === serviceRoleKey) {
      userId = overrideUserId
      const { data: profile } = await supabase.auth.admin.getUserById(userId)
      if (!profile?.user) return jsonResponse({ error: 'user_not_found' }, 404)
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
      userId = userData.user.id
    }

    let days = 3
    try {
      const body = await req.json()
      if (typeof body?.days === 'number' && Number.isFinite(body.days)) days = Math.floor(body.days)
    } catch {
      // empty body is fine
    }
    if (days < 1) days = 1
    if (days > 14) days = 14

    // Load Google credentials (shared with calendar sync).
    const { data: creds, error: credsErr } = await supabase
      .from('user_calendar_credentials')
      .select('access_token, refresh_token, expires_at, scope')
      .eq('user_id', userId)
      .maybeSingle()

    if (credsErr) return jsonResponse({ error: credsErr.message }, 500)
    if (!creds) return jsonResponse({ error: 'not_connected' }, 400)

    if (!creds.scope?.includes('gmail.readonly')) {
      return jsonResponse({
        error: 'missing_scope',
        message: 'Reconnect Google to grant Gmail read access (gmail.readonly).',
      }, 400)
    }

    let accessToken: string = creds.access_token
    const refreshToken: string | null = creds.refresh_token
    const expiresAt: string | null = creds.expires_at

    const needsRefresh = !expiresAt || (new Date(expiresAt).getTime() - Date.now() < 30_000)
    if (needsRefresh) {
      if (!refreshToken) return jsonResponse({ error: 'refresh_failed' }, 401)

      const form = new URLSearchParams()
      form.set('client_id', googleClientId)
      form.set('client_secret', googleClientSecret)
      form.set('refresh_token', refreshToken)
      form.set('grant_type', 'refresh_token')

      const refreshRes = await retryWithBackoff(
        () => fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        }),
        { integration: 'gmail', label: 'refresh access token' },
      )
      if (!refreshRes.ok) return jsonResponse({ error: 'refresh_failed' }, 401)

      const refreshData = await refreshRes.json() as { access_token?: string; expires_in?: number }
      if (!refreshData.access_token || typeof refreshData.expires_in !== 'number') {
        return jsonResponse({ error: 'refresh_failed' }, 401)
      }
      accessToken = refreshData.access_token
      const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      await supabase
        .from('user_calendar_credentials')
        .update({ access_token: accessToken, expires_at: newExpiresAt })
        .eq('user_id', userId)
    }

    const { data: membersRows } = await supabase
      .from('cos_team_members')
      .select('id, name, email, relationship_type')
      .eq('user_id', userId)
    const members: MinimalMember[] = (membersRows ?? []) as MinimalMember[]

    let processed = 0
    let transcriptsInserted = 0

    const q = `from:no-reply@zoom.us subject:"Meeting assets for" newer_than:${days}d`
    let pageToken: string | undefined
    let pagesFetched = 0

    do {
      const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
      listUrl.searchParams.set('q', q)
      listUrl.searchParams.set('maxResults', '50')
      if (pageToken) listUrl.searchParams.set('pageToken', pageToken)

      const listRes = await retryWithBackoff(
        () => fetch(listUrl.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }),
        { integration: 'gmail', label: 'list messages' },
      )
      if (!listRes.ok) {
        console.warn(`gmail-meeting-assets-sync: list returned ${listRes.status}`)
        break
      }
      const listData = await listRes.json() as GmailListResponse
      pageToken = listData.nextPageToken
      pagesFetched++

      for (const { id } of listData.messages ?? []) {
        try {
          const msgRes = await retryWithBackoff(
            () => fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } },
            ),
            { integration: 'gmail', label: 'get message' },
          )
          if (!msgRes.ok) {
            console.warn(`gmail-meeting-assets-sync: message ${id} returned ${msgRes.status}`)
            continue
          }
          const msg = await msgRes.json() as GmailMessage
          const headers = msg.payload?.headers ?? []
          const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? ''
          const topic = extractTopicFromSubject(subject) ?? subject
          if (!topic) continue

          const html = findHtmlBody(msg.payload)
          if (!html) continue

          const uuid = extractMeetingUuid(html) ?? `gmail:${id}`
          const summaryText = extractSummaryText(html)
          const insufficientTranscript = !summaryText
            || summaryText.toLowerCase().includes('could not be generated')
          const durationMinutes = extractDurationMinutes(html)
          const startTime = msg.internalDate
            ? new Date(parseInt(msg.internalDate, 10)).toISOString()
            : new Date().toISOString()
          const matchedMember = matchMemberByTitle(topic, members)

          const row = {
            user_id: userId,
            team_member_id: matchedMember?.id ?? null,
            zoom_meeting_id: null,
            zoom_meeting_uuid: uuid,
            topic,
            start_time: startTime,
            duration_minutes: durationMinutes,
            participant_emails: [] as string[],
            participant_names: [] as string[],
            has_transcript: !insufficientTranscript,
            recording_files: [] as unknown[],
            ai_summary: insufficientTranscript ? null : summaryText,
            last_synced_at: new Date().toISOString(),
          }

          const { data: upserted, error: upsertErr } = await supabase
            .from('cos_zoom_recordings')
            .upsert(row, { onConflict: 'user_id,zoom_meeting_uuid' })
            .select('id')
            .single()

          if (upsertErr || !upserted) {
            console.warn(`gmail-meeting-assets-sync: upsert failed for ${uuid}:`, upsertErr?.message)
            continue
          }
          processed++

          if (!insufficientTranscript && summaryText) {
            const { count: existingTranscripts } = await supabase
              .from('cos_zoom_transcripts')
              .select('id', { count: 'exact', head: true })
              .eq('recording_id', upserted.id)

            if (!existingTranscripts) {
              const { error: transcriptErr } = await supabase.from('cos_zoom_transcripts').insert({
                recording_id: upserted.id,
                user_id: userId,
                content: summaryText,
                content_type: 'text',
                word_count: summaryText.split(/\s+/).length,
              })
              if (!transcriptErr) transcriptsInserted++
            }
          }
        } catch (err) {
          console.warn(`gmail-meeting-assets-sync: error processing message ${id}:`, (err as Error).message)
        }
      }
    } while (pageToken && pagesFetched < 5)

    return jsonResponse({ processed, transcripts_fetched: transcriptsInserted }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
