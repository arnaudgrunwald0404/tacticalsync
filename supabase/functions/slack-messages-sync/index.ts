import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SlackMessage {
  type: string
  ts: string
  user?: string
  text: string
  thread_ts?: string
}

interface SlackUser {
  id: string
  name: string
  real_name?: string
  profile?: { email?: string; real_name?: string; display_name?: string }
}

interface SlackChannel {
  id: string
  name: string
  is_im: boolean
  is_mpim?: boolean
  user?: string // for DMs, the other user's ID
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

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'missing_authorization' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Service-role key + x-supabase-user-id header — cron/batch invocation.
    let userId: string
    const overrideUserId = req.headers.get('x-supabase-user-id')
    if (overrideUserId && jwt === serviceRoleKey) {
      userId = overrideUserId
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      userId = userData.user.id
    }

    // Parse optional params: days to sync, extra channel names to include.
    let days = 7
    let bodyChannels: string[] = []
    try {
      const body = await req.json()
      if (typeof body?.days === 'number' && Number.isFinite(body.days)) {
        days = Math.floor(body.days)
      }
      if (Array.isArray(body?.channels)) {
        bodyChannels = body.channels.filter((c: unknown) => typeof c === 'string')
      }
    } catch {
      // empty body is fine
    }
    if (days < 1) days = 1
    if (days > 30) days = 30

    // Load Slack credentials (including stored extra channels).
    const { data: creds, error: credsErr } = await supabase
      .from('user_slack_credentials')
      .select('access_token, slack_user_id, sync_channels')
      .eq('user_id', userId)
      .maybeSingle()

    if (credsErr) return jsonResponse({ error: credsErr.message }, 500)
    if (!creds?.access_token) return jsonResponse({ error: 'not_connected' }, 400)

    const token = creds.access_token as string
    const mySlackId = creds.slack_user_id as string | null

    // The channel allowlist a user configures in Settings → Briefs & Schedule
    // → Tools is stored on cos_prep_schedule.slack_channels — that's the
    // real source of truth. Look it up here directly (rather than trusting
    // every caller to pass the right channels through) so any invocation for
    // this user — including the cron/service-role path, which never used to
    // see this selection — picks up their current choice automatically.
    // user_slack_credentials.sync_channels is kept as a legacy fallback and
    // merged in too: nothing in the codebase currently writes to it, but
    // merging costs nothing and avoids silently dropping channels if that
    // ever changes.
    const { data: scheduleRow } = await supabase
      .from('cos_prep_schedule')
      .select('slack_channels')
      .eq('user_id', userId)
      .maybeSingle()
    const scheduleChannels: string[] = Array.isArray(scheduleRow?.slack_channels) ? scheduleRow.slack_channels : []
    const storedChannels: string[] = Array.isArray(creds.sync_channels) ? creds.sync_channels : []
    const extraChannels = Array.from(new Set([...scheduleChannels, ...storedChannels, ...bodyChannels]))

    // Helper: call a Slack API method.
    async function slackApi(method: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
      const url = new URL(`https://slack.com/api/${method}`)
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      return res.json() as Promise<Record<string, unknown>>
    }

    // Load team members for matching.
    const { data: membersRows } = await supabase
      .from('cos_team_members')
      .select('id, name, email')
      .eq('user_id', userId)
    const members = (membersRows ?? []) as Array<{ id: string; name: string; email: string | null }>

    // Build a Slack user cache: slack_user_id → { name, email }
    const slackUsers = new Map<string, { name: string; email: string | null }>()

    // Fetch Slack user list (paginated, but cap at 200 for perf).
    const usersRes = await slackApi('users.list', { limit: '200' })
    if (usersRes.ok && Array.isArray(usersRes.members)) {
      for (const u of usersRes.members as SlackUser[]) {
        if (u.id === 'USLACKBOT') continue
        slackUsers.set(u.id, {
          name: u.profile?.real_name ?? u.real_name ?? u.name,
          email: u.profile?.email ?? null,
        })
      }
    }

    // Match Slack user → team member by email or name.
    function matchMember(slackUserId: string): string | null {
      const su = slackUsers.get(slackUserId)
      if (!su) return null
      // Email match
      if (su.email) {
        const norm = su.email.toLowerCase()
        const byEmail = members.find(m => m.email?.toLowerCase() === norm)
        if (byEmail) return byEmail.id
      }
      // Name match
      const normName = su.name.toLowerCase().trim()
      const byName = members.find(m => m.name.toLowerCase().trim() === normName)
      if (byName) return byName.id
      return null
    }

    const oldest = String(Math.floor((Date.now() - days * 86_400_000) / 1000))
    let synced = 0

    // ── 1. Sync DMs ──────────────────────────────────────────────────────────
    const convRes = await slackApi('conversations.list', {
      types: 'im',
      limit: '100',
    })

    if (convRes.ok && Array.isArray(convRes.channels)) {
      for (const ch of convRes.channels as SlackChannel[]) {
        if (!ch.is_im || !ch.user) continue
        // Skip self-DM
        if (ch.user === mySlackId) continue

        const memberId = matchMember(ch.user)
        // Only sync DMs with known team members
        if (!memberId) continue

        const histRes = await slackApi('conversations.history', {
          channel: ch.id,
          oldest,
          limit: '20',
        })

        if (!histRes.ok || !Array.isArray(histRes.messages)) continue

        for (const msg of histRes.messages as SlackMessage[]) {
          if (msg.type !== 'message' || !msg.text) continue
          // Skip bot messages and very short messages
          if (msg.text.length < 5) continue

          const senderInfo = slackUsers.get(msg.user ?? '')
          const messageDate = new Date(parseFloat(msg.ts) * 1000).toISOString()

          const { error: insertErr } = await supabase
            .from('cos_slack_messages')
            .upsert({
              user_id: userId,
              team_member_id: memberId,
              channel_id: ch.id,
              channel_name: null, // DMs don't have a name
              message_ts: msg.ts,
              sender_slack_id: msg.user ?? null,
              sender_name: senderInfo?.name ?? null,
              content: msg.text.slice(0, 2000), // cap length
              is_dm: true,
              thread_ts: msg.thread_ts ?? null,
              message_date: messageDate,
            }, { onConflict: 'user_id,channel_id,message_ts' })

          if (!insertErr) synced++
        }
      }
    }

    // ── 2. Sync specified channels ───────────────────────────────────────────
    if (extraChannels.length > 0) {
      // Find channel IDs by name.
      const allChRes = await slackApi('conversations.list', {
        types: 'public_channel,private_channel',
        limit: '500',
      })

      if (allChRes.ok && Array.isArray(allChRes.channels)) {
        const channelMap = new Map<string, { id: string; name: string }>()
        for (const ch of allChRes.channels as Array<{ id: string; name: string }>) {
          channelMap.set(ch.name.toLowerCase(), { id: ch.id, name: ch.name })
        }

        for (const chName of extraChannels) {
          const ch = channelMap.get(chName.toLowerCase().replace(/^#/, ''))
          if (!ch) continue

          const histRes = await slackApi('conversations.history', {
            channel: ch.id,
            oldest,
            limit: '50',
          })

          if (!histRes.ok || !Array.isArray(histRes.messages)) continue

          for (const msg of histRes.messages as SlackMessage[]) {
            if (msg.type !== 'message' || !msg.text) continue
            if (msg.text.length < 10) continue

            const senderInfo = slackUsers.get(msg.user ?? '')
            const memberId = msg.user ? matchMember(msg.user) : null
            const messageDate = new Date(parseFloat(msg.ts) * 1000).toISOString()

            const { error: insertErr } = await supabase
              .from('cos_slack_messages')
              .upsert({
                user_id: userId,
                team_member_id: memberId,
                channel_id: ch.id,
                channel_name: ch.name,
                message_ts: msg.ts,
                sender_slack_id: msg.user ?? null,
                sender_name: senderInfo?.name ?? null,
                content: msg.text.slice(0, 2000),
                is_dm: false,
                thread_ts: msg.thread_ts ?? null,
                message_date: messageDate,
              }, { onConflict: 'user_id,channel_id,message_ts' })

            if (!insertErr) synced++
          }
        }
      }
    }

    // Mark success.
    await supabase
      .from('user_slack_credentials')
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'ok' })
      .eq('user_id', userId)

    return jsonResponse({ synced }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
