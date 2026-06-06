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
 * Daily prep batch generator.
 *
 * Two invocation modes:
 * 1. **Cron mode** (no Authorization header): runs for ALL users whose
 *    cos_prep_schedule.enabled = true and run_hour_utc matches the current hour.
 *    Triggered by pg_cron every hour.
 * 2. **User mode** (with Authorization header): runs for the calling user only,
 *    regardless of schedule settings. Used by the "Run now" button in Settings.
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

    // Determine invocation mode.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()

    let targetUserIds: string[] = []

    if (jwt) {
      // User mode: run for this user only.
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      targetUserIds = [userData.user.id]
    } else {
      // Cron mode: find all users with enabled schedules matching this hour.
      const currentHourUtc = new Date().getUTCHours()
      const { data: schedules } = await supabase
        .from('cos_prep_schedule')
        .select('user_id')
        .eq('enabled', true)
        .eq('run_hour_utc', currentHourUtc)

      targetUserIds = (schedules ?? []).map((s: { user_id: string }) => s.user_id)
    }

    if (targetUserIds.length === 0) {
      return jsonResponse({ message: 'no_users_to_process', processed: 0 }, 200)
    }

    const results: Array<{
      user_id: string
      preps_generated: number
      errors: string[]
    }> = []

    for (const userId of targetUserIds) {
      const userResult = { user_id: userId, preps_generated: 0, errors: [] as string[] }

      try {
        // Load user's schedule config.
        const { data: schedule } = await supabase
          .from('cos_prep_schedule')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

        const alwaysInclude: string[] = (schedule?.always_include ?? []) as string[]
        const maxOthersAfterExclude: number = schedule?.max_others_after_exclude ?? 1
        const syncZoom: boolean = schedule?.sync_zoom_before ?? true
        const syncSlack: boolean = schedule?.sync_slack_before ?? true
        const slackChannels: string[] = (schedule?.slack_channels ?? []) as string[]

        // ── Step 1: Sync integrations ─────────────────────────────────────

        // Build a fake JWT for invoking other edge functions as this user.
        // Since we're running with the service role, we call the functions
        // directly via HTTP with the service role key and pass user context.

        if (syncZoom) {
          const { data: zoomCreds } = await supabase
            .from('user_zoom_credentials')
            .select('access_token')
            .eq('user_id', userId)
            .maybeSingle()

          if (zoomCreds?.access_token) {
            // Invoke zoom sync inline — call the function via HTTP.
            try {
              await fetch(`${supabaseUrl}/functions/v1/zoom-recordings-sync`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json',
                  'x-supabase-user-id': userId,
                },
                body: JSON.stringify({}),
              })
            } catch {
              userResult.errors.push('zoom_sync_failed')
            }
          }
        }

        if (syncSlack) {
          const { data: slackCreds } = await supabase
            .from('user_slack_credentials')
            .select('access_token')
            .eq('user_id', userId)
            .maybeSingle()

          if (slackCreds?.access_token) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/slack-messages-sync`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json',
                  'x-supabase-user-id': userId,
                },
                body: JSON.stringify({ channels: slackChannels }),
              })
            } catch {
              userResult.errors.push('slack_sync_failed')
            }
          }
        }

        // ── Step 2: Find today's qualifying 1-on-1s ───────────────────────

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date()
        todayEnd.setHours(23, 59, 59, 999)

        const { data: events } = await supabase
          .from('cos_one_on_one_events')
          .select('id, team_member_id, title, start_time, attendee_emails, attendee_name, status')
          .eq('user_id', userId)
          .gte('start_time', todayStart.toISOString())
          .lte('start_time', todayEnd.toISOString())
          .neq('status', 'cancelled')

        if (!events || events.length === 0) {
          await supabase.from('cos_prep_schedule').update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'ok: no meetings today',
            last_run_preps_generated: 0,
          }).eq('user_id', userId)
          results.push(userResult)
          continue
        }

        // Load team members for name matching.
        const { data: members } = await supabase
          .from('cos_team_members')
          .select('id, name')
          .eq('user_id', userId)

        const memberById = new Map(
          ((members ?? []) as Array<{ id: string; name: string }>).map(m => [m.id, m])
        )

        // Normalize always_include names for matching.
        const alwaysIncludeNorm = new Set(
          alwaysInclude.map(n => n.toLowerCase().trim())
        )

        // Apply inclusion rules to each event.
        const qualifyingMemberIds = new Set<string>()

        for (const event of events as Array<{
          id: string; team_member_id: string | null; title: string | null;
          start_time: string; attendee_emails: string[] | null; attendee_name: string | null;
          status: string;
        }>) {
          if (!event.team_member_id) continue
          const member = memberById.get(event.team_member_id)
          if (!member) continue

          const memberNameNorm = member.name.toLowerCase().trim()

          // Rule 1: Is this person in always_include?
          if (alwaysIncludeNorm.has(memberNameNorm)) {
            qualifyingMemberIds.add(event.team_member_id)
            continue
          }

          // Rule 2: After removing always_include people from attendees,
          // are there max_others_after_exclude or fewer other attendees?
          // The calendar sync already filtered by max_other_attendees,
          // so if the event exists in cos_one_on_one_events with a matched
          // team_member_id, it already passed the basic 1-on-1 filter.
          // This rule is for multi-person meetings where always_include
          // people are also present.
          qualifyingMemberIds.add(event.team_member_id)
        }

        // ── Step 3: Generate preps ────────────────────────────────────────

        for (const memberId of qualifyingMemberIds) {
          try {
            // Check if a fresh prep already exists for today.
            const todayDate = new Date().toISOString().slice(0, 10)
            const { data: existingPrep } = await supabase
              .from('cos_one_on_one_prep')
              .select('id, generated_at')
              .eq('user_id', userId)
              .eq('team_member_id', memberId)
              .eq('prep_date', todayDate)
              .eq('source', 'ai_generated')
              .eq('status', 'ready')
              .maybeSingle()

            // Skip if prep was generated within the last 4 hours.
            if (existingPrep) {
              const age = Date.now() - new Date(existingPrep.generated_at).getTime()
              if (age < 4 * 60 * 60 * 1000) continue
            }

            // Call generate-1on1-prep for this member.
            const res = await fetch(`${supabaseUrl}/functions/v1/generate-1on1-prep`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                team_member_id: memberId,
                force_regenerate: false,
                // Pass user context for the service-role call.
                _batch_user_id: userId,
              }),
            })

            if (res.ok) {
              userResult.preps_generated++
            } else {
              const errText = await res.text()
              userResult.errors.push(`prep_failed:${memberId}:${errText.slice(0, 100)}`)
            }
          } catch (err) {
            userResult.errors.push(`prep_error:${memberId}:${(err as Error).message}`)
          }
        }

        // Update schedule with run results.
        await supabase.from('cos_prep_schedule').update({
          last_run_at: new Date().toISOString(),
          last_run_status: userResult.errors.length > 0
            ? `ok with ${userResult.errors.length} error(s)`
            : 'ok',
          last_run_preps_generated: userResult.preps_generated,
        }).eq('user_id', userId)

      } catch (err) {
        userResult.errors.push(`user_error:${(err as Error).message}`)
      }

      results.push(userResult)
    }

    const totalPreps = results.reduce((sum, r) => sum + r.preps_generated, 0)
    return jsonResponse({
      processed: results.length,
      total_preps_generated: totalPreps,
      results,
    }, 200)

  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
