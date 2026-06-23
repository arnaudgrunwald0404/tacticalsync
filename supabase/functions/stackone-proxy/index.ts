import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function stackoneHeaders(apiKey: string): Record<string, string> {
  const encoded = btoa(apiKey + ':')
  return {
    'Authorization': `Basic ${encoded}`,
    'Content-Type': 'application/json',
  }
}

const STACKONE_API = 'https://api.stackone.com'
const INTEGRATION_KEY = 'stackone'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const authHeader = req.headers.get('Authorization') ?? ''
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) {
      return json({ error: 'unauthorized' }, 401)
    }

    const body = await req.json()
    const { action } = body

    // Helper: get stored API key for this user
    async function getStoredKey(): Promise<string | null> {
      const { data } = await supabase
        .from('cos_mcp_integrations')
        .select('auth_value')
        .eq('user_id', user!.id)
        .eq('integration_key', INTEGRATION_KEY)
        .maybeSingle()
      return data?.auth_value ?? null
    }

    // ── save_key: Store StackOne API key and validate it ────────────────────
    if (action === 'save_key') {
      const { api_key } = body
      if (!api_key?.trim()) return json({ error: 'api_key required' }, 400)

      // Validate by listing accounts
      const resp = await fetch(`${STACKONE_API}/accounts`, {
        headers: stackoneHeaders(api_key.trim()),
        signal: AbortSignal.timeout(10_000),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        return json({
          status: 'error',
          error: `StackOne returned ${resp.status}: ${text.slice(0, 200)}`,
        })
      }

      const now = new Date().toISOString()
      await supabase.from('cos_mcp_integrations').upsert({
        user_id: user.id,
        integration_key: INTEGRATION_KEY,
        base_url: STACKONE_API,
        auth_value: api_key.trim(),
        is_connected: true,
        last_test_at: now,
        last_test_status: 'ok',
        last_test_error: null,
        updated_at: now,
      }, { onConflict: 'user_id,integration_key' })

      return json({ status: 'ok' })
    }

    // ── list_accounts: Fetch linked accounts from StackOne ──────────────────
    if (action === 'list_accounts') {
      const apiKey = await getStoredKey()
      if (!apiKey) return json({ error: 'not_configured' }, 400)

      const resp = await fetch(`${STACKONE_API}/accounts`, {
        headers: stackoneHeaders(apiKey),
        signal: AbortSignal.timeout(10_000),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        return json({ status: 'error', error: `HTTP ${resp.status}: ${text.slice(0, 200)}` })
      }

      const result = await resp.json()
      const accounts = Array.isArray(result) ? result : (result.data ?? [])
      return json({ status: 'ok', accounts })
    }

    // ── create_session: Create a StackOne Connect session for Hub embed ─────
    if (action === 'create_session') {
      const apiKey = await getStoredKey()
      if (!apiKey) return json({ error: 'not_configured' }, 400)

      const { categories } = body

      const sessionBody: Record<string, unknown> = {
        origin_owner_id: user.id,
        origin_owner_name: user.email ?? user.id,
      }
      if (categories?.length) {
        sessionBody.categories = categories
      }

      const resp = await fetch(`${STACKONE_API}/connect_sessions`, {
        method: 'POST',
        headers: stackoneHeaders(apiKey),
        body: JSON.stringify(sessionBody),
        signal: AbortSignal.timeout(10_000),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        return json({ status: 'error', error: `HTTP ${resp.status}: ${text.slice(0, 200)}` })
      }

      const result = await resp.json()
      return json({ status: 'ok', session: result.data ?? result })
    }

    // ── list_connector_profiles: Fetch configured connector profiles ─────────
    if (action === 'list_connector_profiles') {
      const apiKey = await getStoredKey()
      if (!apiKey) return json({ error: 'not_configured' }, 400)

      const resp = await fetch(`${STACKONE_API}/connector_profiles`, {
        headers: stackoneHeaders(apiKey),
        signal: AbortSignal.timeout(10_000),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        return json({ status: 'error', error: `HTTP ${resp.status}: ${text.slice(0, 200)}` })
      }

      const result = await resp.json()
      const profiles = Array.isArray(result) ? result : (result.data ?? [])
      return json({ status: 'ok', profiles })
    }

// ── disconnect: Clear stored API key ────────────────────────────────────
    if (action === 'disconnect') {
      await supabase
        .from('cos_mcp_integrations')
        .update({
          auth_value: null,
          is_connected: false,
          last_test_at: null,
          last_test_status: null,
          last_test_error: null,
          config: {},
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('integration_key', INTEGRATION_KEY)

      return json({ status: 'ok' })
    }

    return json({ error: `unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('stackone-proxy error:', err)
    return json({ error: 'internal_error' }, 500)
  }
})
