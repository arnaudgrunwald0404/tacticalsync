import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SaveTokensRequest {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'missing_authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = userData.user.id

    const body: SaveTokensRequest = await req.json()
    const { access_token, refresh_token, expires_in, scope } = body

    if (!access_token || typeof expires_in !== 'number') {
      return new Response(JSON.stringify({ error: 'invalid_body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    // Preserve existing refresh_token when the incoming one is empty.
    let refreshTokenToWrite: string | null = refresh_token && refresh_token.length > 0
      ? refresh_token
      : null

    if (!refreshTokenToWrite) {
      const { data: existing } = await supabase
        .from('user_calendar_credentials')
        .select('refresh_token')
        .eq('user_id', userId)
        .maybeSingle()
      refreshTokenToWrite = existing?.refresh_token ?? null
    }

    const row: Record<string, unknown> = {
      user_id: userId,
      provider: 'google',
      access_token,
      scope,
      expires_at: expiresAt,
      last_sync_at: null,
      last_sync_status: null,
    }
    if (refreshTokenToWrite !== null) {
      row.refresh_token = refreshTokenToWrite
    }

    const { error: upsertErr } = await supabase
      .from('user_calendar_credentials')
      .upsert(row, { onConflict: 'user_id' })

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
