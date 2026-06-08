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
 * Hourly calendar sync cron.
 *
 * Called by pg_cron every hour. Finds users whose auto_sync_enabled = true
 * and whose morning or midday hour matches the current UTC hour, then calls
 * google-calendar-sync for each.
 *
 * Also supports manual invocation with an Authorization header (user JWT)
 * to trigger an immediate sync for that user.
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

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()

    let targetUserIds: string[] = []

    if (jwt && jwt !== serviceRoleKey) {
      // Manual mode: sync for the calling user only.
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      targetUserIds = [userData.user.id]
    } else {
      // Cron mode: find users whose auto-sync hour matches now.
      const currentHourUtc = new Date().getUTCHours()

      const { data: rows } = await supabase
        .from('user_calendar_credentials')
        .select('user_id')
        .eq('auto_sync_enabled', true)
        .or(`auto_sync_morning_hour_utc.eq.${currentHourUtc},auto_sync_midday_hour_utc.eq.${currentHourUtc}`)

      targetUserIds = (rows ?? []).map((r: { user_id: string }) => r.user_id)
    }

    if (targetUserIds.length === 0) {
      return jsonResponse({ message: 'no_users_to_sync', synced: 0 }, 200)
    }

    const results: Array<{
      user_id: string
      status: 'ok' | 'error'
      created?: number
      updated?: number
      cancelled?: number
      error?: string
    }> = []

    for (const userId of targetUserIds) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'x-supabase-user-id': userId,
          },
          body: JSON.stringify({}),
        })

        if (res.ok) {
          const data = await res.json() as {
            created?: number
            updated?: number
            cancelled?: number
          }
          results.push({
            user_id: userId,
            status: 'ok',
            created: data.created ?? 0,
            updated: data.updated ?? 0,
            cancelled: data.cancelled ?? 0,
          })
        } else {
          const errText = await res.text()
          results.push({
            user_id: userId,
            status: 'error',
            error: `${res.status}: ${errText.slice(0, 200)}`,
          })
        }
      } catch (err) {
        results.push({
          user_id: userId,
          status: 'error',
          error: (err as Error).message,
        })
      }
    }

    const succeeded = results.filter(r => r.status === 'ok').length
    return jsonResponse({
      synced: succeeded,
      failed: results.length - succeeded,
      total: results.length,
      results,
    }, 200)

  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
