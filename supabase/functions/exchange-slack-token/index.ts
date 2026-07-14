import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { retryWithBackoff } from "../_shared/retryWithBackoff.ts"

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
    const slackClientId = Deno.env.get('SLACK_CLIENT_ID') ?? ''
    const slackClientSecret = Deno.env.get('SLACK_CLIENT_SECRET') ?? ''
    const slackRedirectUri = Deno.env.get('SLACK_REDIRECT_URI') ?? ''

    if (!slackClientId || !slackClientSecret) {
      return jsonResponse({ error: 'slack_credentials_not_configured' }, 500)
    }

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

    const body = await req.json()
    const { code } = body as { code: string }
    if (!code) {
      return jsonResponse({ error: 'missing_code' }, 400)
    }

    // Exchange authorization code for token.
    // Slack uses POST form-encoded (not Basic auth like Zoom).
    const tokenRes = await retryWithBackoff(
      () => fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: slackClientId,
          client_secret: slackClientSecret,
          code,
          redirect_uri: slackRedirectUri,
        }),
      }),
      { integration: 'slack', label: 'oauth.v2.access' },
    )

    const tokenData = await tokenRes.json() as {
      ok: boolean
      error?: string
      access_token?: string
      scope?: string
      team?: { id: string; name: string }
      authed_user?: { id: string; access_token?: string; scope?: string }
    }

    if (!tokenData.ok || !tokenData.access_token) {
      return jsonResponse({
        error: 'slack_token_exchange_failed',
        detail: tokenData.error ?? 'unknown',
      }, 502)
    }

    // Fetch user info from Slack.
    const authTestRes = await retryWithBackoff(
      () => fetch('https://slack.com/api/auth.test', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      }),
      { integration: 'slack', label: 'auth.test' },
    )
    const authTest = await authTestRes.json() as {
      ok: boolean
      user_id?: string
      user?: string
    }

    // The Slack user to associate with this account is the human who authorized
    // the app — tokenData.authed_user.id. auth.test on the bot token returns the
    // *bot's* user id, so we must NOT use that as the account's slack_user_id
    // (it would be identical for every user and never match a slash command).
    const slackUserId = tokenData.authed_user?.id ?? authTest.user_id ?? null

    // Also fetch email via users.info for the authorizing user.
    let slackEmail: string | null = null
    if (slackUserId) {
      const userInfoRes = await retryWithBackoff(
        () => fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        }),
        { integration: 'slack', label: 'users.info' },
      )
      const userInfo = await userInfoRes.json() as {
        ok: boolean
        user?: { profile?: { email?: string } }
      }
      if (userInfo.ok) {
        slackEmail = userInfo.user?.profile?.email ?? null
      }
    }

    const { error: upsertErr } = await supabase
      .from('user_slack_credentials')
      .upsert({
        user_id: userId,
        provider: 'slack',
        access_token: tokenData.access_token,
        scope: tokenData.scope ?? '',
        slack_team_id: tokenData.team?.id ?? null,
        slack_team_name: tokenData.team?.name ?? null,
        slack_user_id: slackUserId,
        slack_email: slackEmail,
        last_sync_at: null,
        last_sync_status: null,
      }, { onConflict: 'user_id' })

    if (upsertErr) {
      return jsonResponse({ error: upsertErr.message }, 500)
    }

    return jsonResponse({
      ok: true,
      slack_email: slackEmail,
      slack_team: tokenData.team?.name ?? null,
    }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
