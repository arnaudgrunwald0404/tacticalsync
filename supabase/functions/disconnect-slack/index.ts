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

    // Attempt Slack token revocation (best-effort).
    const { data: creds } = await supabase
      .from('user_slack_credentials')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle()

    if (creds?.access_token) {
      try {
        const revokeRes = await retryWithBackoff(
          () => fetch('https://slack.com/api/auth.revoke', {
            headers: { 'Authorization': `Bearer ${creds.access_token}` },
          }),
          { integration: 'slack', label: 'auth.revoke', maxAttempts: 2 },
        )
        if (!revokeRes.ok) {
          console.error(`[disconnect-slack] auth.revoke failed for user ${userId}: HTTP ${revokeRes.status}`)
        } else {
          // Slack's Web API returns HTTP 200 even on logical failure —
          // the real outcome is in the JSON body's `ok`/`error` fields.
          const body = await revokeRes.json().catch(() => null) as { ok?: boolean; error?: string } | null
          if (body && body.ok === false) {
            console.error(`[disconnect-slack] auth.revoke rejected for user ${userId}: ${body.error ?? 'unknown_error'}`)
          }
        }
      } catch (err) {
        // Best-effort: local disconnect must still proceed even if Slack's
        // side is unreachable, but the failure is no longer discarded silently.
        console.error(`[disconnect-slack] auth.revoke threw for user ${userId}: ${(err as Error).message}`)
      }
    }

    const { error: delErr } = await supabase
      .from('user_slack_credentials')
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
