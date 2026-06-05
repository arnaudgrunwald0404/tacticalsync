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

    // Attempt token revocation (best-effort)
    if (zoomClientId && zoomClientSecret) {
      const { data: creds } = await supabase
        .from('user_zoom_credentials')
        .select('access_token')
        .eq('user_id', userId)
        .maybeSingle()

      if (creds?.access_token) {
        const basicAuth = btoa(`${zoomClientId}:${zoomClientSecret}`)
        await fetch(`https://zoom.us/oauth/revoke?token=${encodeURIComponent(creds.access_token)}`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${basicAuth}` },
        }).catch(() => { /* best-effort */ })
      }
    }

    const { error: delErr } = await supabase
      .from('user_zoom_credentials')
      .delete()
      .eq('user_id', userId)

    if (delErr) {
      return jsonResponse({ error: delErr.message }, 500)
    }

    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
