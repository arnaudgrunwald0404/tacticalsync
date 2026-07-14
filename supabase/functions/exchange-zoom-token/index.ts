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
    const zoomClientId = Deno.env.get('ZOOM_CLIENT_ID') ?? ''
    const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET') ?? ''
    const zoomRedirectUri = Deno.env.get('ZOOM_REDIRECT_URI') ?? ''

    if (!zoomClientId || !zoomClientSecret) {
      return jsonResponse({ error: 'zoom_credentials_not_configured' }, 500)
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

    // Exchange authorization code for tokens
    const basicAuth = btoa(`${zoomClientId}:${zoomClientSecret}`)
    const tokenRes = await retryWithBackoff(
      () => fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: zoomRedirectUri,
        }),
      }),
      { integration: 'zoom', label: 'exchange authorization code' },
    )

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      return jsonResponse({ error: 'zoom_token_exchange_failed', detail: errBody }, 502)
    }

    const tokenData = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
      scope: string
    }

    // Fetch Zoom user info
    const meRes = await retryWithBackoff(
      () => fetch('https://api.zoom.us/v2/users/me', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      }),
      { integration: 'zoom', label: 'fetch user info' },
    )

    let zoomUserId: string | null = null
    let zoomEmail: string | null = null
    if (meRes.ok) {
      const meData = await meRes.json() as { id: string; email: string }
      zoomUserId = meData.id
      zoomEmail = meData.email
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    const { error: upsertErr } = await supabase
      .from('user_zoom_credentials')
      .upsert({
        user_id: userId,
        provider: 'zoom',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
        expires_at: expiresAt,
        zoom_user_id: zoomUserId,
        zoom_email: zoomEmail,
        last_sync_at: null,
        last_sync_status: null,
      }, { onConflict: 'user_id' })

    if (upsertErr) {
      return jsonResponse({ error: upsertErr.message }, 500)
    }

    return jsonResponse({ ok: true, zoom_email: zoomEmail }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
