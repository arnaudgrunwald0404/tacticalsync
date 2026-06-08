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
    let triggerType: 'cron' | 'manual' = 'manual'

    if (jwt) {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      targetUserIds = [userData.user.id]
      triggerType = 'manual'
    } else {
      const currentHourUtc = new Date().getUTCHours()
      // Include users with either 1:1 prep or DCI brief enabled at this hour
      const { data: schedules } = await supabase
        .from('cos_prep_schedule')
        .select('user_id, enabled, dci_enabled')
        .eq('run_hour_utc', currentHourUtc)
        .or('enabled.eq.true,dci_enabled.eq.true')

      targetUserIds = (schedules ?? []).map((s: { user_id: string }) => s.user_id)
      triggerType = 'cron'
    }

    if (targetUserIds.length === 0) {
      return jsonResponse({ message: 'no_users_to_process', processed: 0 }, 200)
    }

    // Load schedule flags per user to know which features are enabled
    const { data: userSchedules } = await supabase
      .from('cos_prep_schedule')
      .select('user_id, enabled, dci_enabled')
      .in('user_id', targetUserIds)
    const scheduleByUser = new Map(
      ((userSchedules ?? []) as Array<{ user_id: string; enabled: boolean; dci_enabled: boolean }>)
        .map(s => [s.user_id, s])
    )

    const allResults: Array<{ user_id: string; log_id: string; preps_generated: number; dci_generated?: boolean }> = []

    for (const userId of targetUserIds) {
      // ── Create batch log entry ────────────────────────────────────────
      const { data: logRow } = await supabase
        .from('cos_prep_batch_log')
        .insert({
          user_id: userId,
          trigger_type: triggerType,
          started_at: new Date().toISOString(),
          status: 'running',
        })
        .select('id')
        .single()

      const logId = logRow?.id ?? null
      let meetingsFound = 0
      let meetingsQualified = 0
      let prepsGenerated = 0
      let prepsCached = 0
      let calendarSynced = false
      let calendarCreated: number | null = null
      let calendarUpdated: number | null = null
      let zoomSynced = false
      let zoomRecordings: number | null = null
      let slackSynced = false
      let slackMessages: number | null = null
      let dciGenerated = false
      const errors: Array<{ member_id?: string; member_name?: string; error: string }> = []

      const userFlags = scheduleByUser.get(userId)
      const prepEnabled = userFlags?.enabled ?? true
      const dciEnabled = userFlags?.dci_enabled ?? false

      try {
        const { data: schedule } = await supabase
          .from('cos_prep_schedule')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

        const alwaysInclude: string[] = (schedule?.always_include ?? []) as string[]
        const syncZoom: boolean = schedule?.sync_zoom_before ?? true
        const syncSlack: boolean = schedule?.sync_slack_before ?? true
        const slackChannels: string[] = (schedule?.slack_channels ?? []) as string[]

        // ── Step 1: Sync integrations ─────────────────────────────────────

        // Calendar sync — always attempt when credentials exist so prep
        // generation works with the freshest event list.
        const { data: calCreds } = await supabase
          .from('user_calendar_credentials')
          .select('refresh_token')
          .eq('user_id', userId)
          .maybeSingle()

        if (calCreds?.refresh_token) {
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
              const data = await res.json() as { created?: number; updated?: number }
              calendarSynced = true
              calendarCreated = data.created ?? 0
              calendarUpdated = data.updated ?? 0
            } else {
              errors.push({ error: `calendar_sync: ${res.status}` })
            }
          } catch (err) {
            errors.push({ error: `calendar_sync: ${(err as Error).message}` })
          }
        }

        if (syncZoom) {
          const { data: zoomCreds } = await supabase
            .from('user_zoom_credentials')
            .select('access_token')
            .eq('user_id', userId)
            .maybeSingle()

          if (zoomCreds?.access_token) {
            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/zoom-recordings-sync`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json',
                  'x-supabase-user-id': userId,
                },
                body: JSON.stringify({}),
              })
              if (res.ok) {
                const data = await res.json() as { synced?: number }
                zoomSynced = true
                zoomRecordings = data.synced ?? 0
              } else {
                errors.push({ error: `zoom_sync: ${res.status}` })
              }
            } catch (err) {
              errors.push({ error: `zoom_sync: ${(err as Error).message}` })
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
              const res = await fetch(`${supabaseUrl}/functions/v1/slack-messages-sync`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json',
                  'x-supabase-user-id': userId,
                },
                body: JSON.stringify({ channels: slackChannels }),
              })
              if (res.ok) {
                const data = await res.json() as { synced?: number }
                slackSynced = true
                slackMessages = data.synced ?? 0
              } else {
                errors.push({ error: `slack_sync: ${res.status}` })
              }
            } catch (err) {
              errors.push({ error: `slack_sync: ${(err as Error).message}` })
            }
          }
        }

        // ── Step 2: Find today's qualifying 1-on-1s ───────────────────────
        // Skip 1:1 prep generation if only DCI is enabled for this user.

        if (prepEnabled) {

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

        meetingsFound = (events ?? []).length

        const { data: members } = await supabase
          .from('cos_team_members')
          .select('id, name')
          .eq('user_id', userId)

        const memberById = new Map(
          ((members ?? []) as Array<{ id: string; name: string }>).map(m => [m.id, m])
        )

        const alwaysIncludeNorm = new Set(
          alwaysInclude.map(n => n.toLowerCase().trim())
        )

        const qualifyingMemberIds = new Set<string>()

        for (const event of (events ?? []) as Array<{
          id: string; team_member_id: string | null; title: string | null;
          start_time: string; attendee_emails: string[] | null; attendee_name: string | null;
          status: string;
        }>) {
          if (!event.team_member_id) continue
          const member = memberById.get(event.team_member_id)
          if (!member) continue

          const memberNameNorm = member.name.toLowerCase().trim()

          if (alwaysIncludeNorm.has(memberNameNorm)) {
            qualifyingMemberIds.add(event.team_member_id)
            continue
          }

          qualifyingMemberIds.add(event.team_member_id)
        }

        meetingsQualified = qualifyingMemberIds.size

        // ── Step 3: Generate preps ────────────────────────────────────────

        const todayDate = new Date().toISOString().slice(0, 10)

        for (const memberId of qualifyingMemberIds) {
          const member = memberById.get(memberId)
          try {
            // Check for cached prep.
            const { data: existingPrep } = await supabase
              .from('cos_one_on_one_prep')
              .select('id, generated_at')
              .eq('user_id', userId)
              .eq('team_member_id', memberId)
              .eq('prep_date', todayDate)
              .eq('source', 'ai_generated')
              .eq('status', 'ready')
              .maybeSingle()

            if (existingPrep) {
              const age = Date.now() - new Date(existingPrep.generated_at).getTime()
              if (age < 4 * 60 * 60 * 1000) {
                prepsCached++
                continue
              }
            }

            const res = await fetch(`${supabaseUrl}/functions/v1/generate-1on1-prep`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                team_member_id: memberId,
                force_regenerate: false,
                _batch_user_id: userId,
              }),
            })

            if (res.ok) {
              prepsGenerated++
            } else {
              const errText = await res.text()
              errors.push({
                member_id: memberId,
                member_name: member?.name ?? 'unknown',
                error: errText.slice(0, 200),
              })
            }
          } catch (err) {
            errors.push({
              member_id: memberId,
              member_name: member?.name ?? 'unknown',
              error: (err as Error).message,
            })
          }
        }

        } // end if (prepEnabled)

        // ── Step 3: Generate DCI brief (if enabled) ──────────────────────

        if (dciEnabled) {
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/generate-dci-brief`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ _batch_user_id: userId }),
            })
            if (res.ok) {
              dciGenerated = true
            } else {
              const errText = await res.text()
              errors.push({ error: `dci_brief: ${errText.slice(0, 200)}` })
            }
          } catch (err) {
            errors.push({ error: `dci_brief: ${(err as Error).message}` })
          }
        }

        // ── Finalize log ──────────────────────────────────────────────────

        const status = errors.length > 0
          ? (prepsGenerated > 0 || dciGenerated ? 'partial' : 'failed')
          : 'ok'

        const summaryParts: string[] = []
        if (prepsGenerated > 0) summaryParts.push(`${prepsGenerated} prep(s) generated`)
        if (prepsCached > 0) summaryParts.push(`${prepsCached} cached`)
        if (dciGenerated) summaryParts.push('DCI brief generated')
        if (calendarSynced) summaryParts.push(`Calendar: ${calendarCreated} new, ${calendarUpdated} updated`)
        if (zoomSynced) summaryParts.push(`Zoom: ${zoomRecordings} recordings`)
        if (slackSynced) summaryParts.push(`Slack: ${slackMessages} messages`)
        if (meetingsFound === 0 && prepEnabled) summaryParts.push('No meetings today')
        if (errors.length > 0) summaryParts.push(`${errors.length} error(s)`)

        if (logId) {
          await supabase.from('cos_prep_batch_log').update({
            finished_at: new Date().toISOString(),
            status,
            meetings_found: meetingsFound,
            meetings_qualified: meetingsQualified,
            preps_generated: prepsGenerated,
            preps_cached: prepsCached,
            zoom_synced: zoomSynced,
            zoom_recordings: zoomRecordings,
            slack_synced: slackSynced,
            slack_messages: slackMessages,
            errors: JSON.stringify(errors),
            summary: summaryParts.join(' · '),
          }).eq('id', logId)
        }

        await supabase.from('cos_prep_schedule').update({
          last_run_at: new Date().toISOString(),
          last_run_status: status,
          last_run_preps_generated: prepsGenerated,
        }).eq('user_id', userId)

        allResults.push({ user_id: userId, log_id: logId ?? '', preps_generated: prepsGenerated, dci_generated: dciGenerated })

      } catch (err) {
        if (logId) {
          await supabase.from('cos_prep_batch_log').update({
            finished_at: new Date().toISOString(),
            status: 'failed',
            errors: JSON.stringify([{ error: (err as Error).message }]),
            summary: `Fatal: ${(err as Error).message}`,
          }).eq('id', logId)
        }
        allResults.push({ user_id: userId, log_id: logId ?? '', preps_generated: 0 })
      }
    }

    const totalPreps = allResults.reduce((sum, r) => sum + r.preps_generated, 0)
    const totalDci = allResults.filter(r => r.dci_generated).length
    return jsonResponse({
      processed: allResults.length,
      total_preps_generated: totalPreps,
      total_dci_generated: totalDci,
      results: allResults,
    }, 200)

  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
