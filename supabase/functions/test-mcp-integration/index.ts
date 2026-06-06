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

/**
 * Test connectivity for an MCP integration.
 *
 * Body: { integration_key: string, base_url: string, auth_value: string,
 *         auth_header_name?: string, test_endpoint?: string }
 *
 * - Pings the test endpoint with the supplied auth header.
 * - On success, upserts the row in cos_mcp_integrations with is_connected=true.
 * - On failure, upserts with is_connected=false + error message.
 *
 * Also supports { action: "disconnect", integration_key: string } to clear
 * credentials and mark disconnected.
 */
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
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Verify the calling user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }

    const body = await req.json()
    const { action, integration_key } = body

    // ── Disconnect ──────────────────────────────────────────────────────────
    if (action === 'disconnect') {
      if (!integration_key) {
        return jsonResponse({ error: 'integration_key required' }, 400)
      }

      await supabase
        .from('cos_mcp_integrations')
        .update({
          auth_value: null,
          is_connected: false,
          last_test_at: null,
          last_test_status: null,
          last_test_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('integration_key', integration_key)

      return jsonResponse({ ok: true }, 200)
    }

    // ── Test connection ─────────────────────────────────────────────────────
    const {
      base_url,
      auth_value,
      auth_header_name = 'Authorization',
      test_endpoint = '/',
    } = body

    if (!integration_key || !base_url) {
      return jsonResponse({ error: 'integration_key and base_url required' }, 400)
    }

    // Build the test URL
    const testUrl = new URL(test_endpoint, base_url.replace(/\/+$/, '') + '/').href

    // Ping the external API
    const headers: Record<string, string> = {}
    if (auth_value) {
      // For bearer-style, the value is sent as-is in the header name
      headers[auth_header_name] = auth_value
    }

    let testStatus: 'ok' | 'error' = 'error'
    let testError: string | null = null
    let responsePreview: unknown = null

    try {
      const resp = await fetch(testUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10_000),
      })

      if (resp.ok) {
        testStatus = 'ok'
        try {
          const json = await resp.json()
          // Return a small preview (first 2 items if array)
          if (json.data && Array.isArray(json.data)) {
            responsePreview = {
              count: json.data.length,
              sample: json.data.slice(0, 2),
            }
          } else {
            responsePreview = { received: true }
          }
        } catch {
          responsePreview = { received: true, format: 'non-json' }
        }
      } else {
        const text = await resp.text().catch(() => '')
        testError = `HTTP ${resp.status}: ${text.slice(0, 200)}`
      }
    } catch (fetchErr) {
      testError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    }

    const now = new Date().toISOString()

    // Upsert the integration row
    await supabase
      .from('cos_mcp_integrations')
      .upsert(
        {
          user_id: user.id,
          integration_key,
          base_url,
          auth_value: auth_value || null,
          is_connected: testStatus === 'ok',
          last_test_at: now,
          last_test_status: testStatus,
          last_test_error: testError,
          updated_at: now,
        },
        { onConflict: 'user_id,integration_key' },
      )

    return jsonResponse({
      status: testStatus,
      error: testError,
      preview: responsePreview,
    }, 200)
  } catch (err) {
    console.error('test-mcp-integration error:', err)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
