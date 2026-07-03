import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { detectEscalations } from "../agent-escalation/index.ts"

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

interface AgentConfig {
  enabled: boolean
  nudge_actions: boolean
  pre_stage_prep: boolean
  escalate_patterns: boolean
  recommend_format: boolean
  post_meeting_check: boolean
  nudge_timing_hours: number
  nudge_max_count: number // stop nudging an action after this many nudges
  quiet_hours_start: number // 0-23
  quiet_hours_end: number   // 0-23
  timezone: string
  slack_notifications: boolean
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  nudge_actions: true,
  pre_stage_prep: true,
  escalate_patterns: false,
  recommend_format: false,
  post_meeting_check: true,
  nudge_timing_hours: 24,
  nudge_max_count: 5,
  quiet_hours_start: 18,
  quiet_hours_end: 9,
  timezone: 'America/New_York',
  slack_notifications: true,
}

/**
 * Check if the current time is within quiet hours for the given timezone.
 */
function isInQuietHours(config: AgentConfig): boolean {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone,
      hour: 'numeric',
      hour12: false,
    })
    const currentHour = parseInt(formatter.format(now), 10)

    const start = config.quiet_hours_start
    const end = config.quiet_hours_end

    if (start > end) {
      // Quiet hours span midnight (e.g., 18-9 = 18:00 to 09:00)
      return currentHour >= start || currentHour < end
    } else {
      return currentHour >= start && currentHour < end
    }
  } catch {
    // If timezone is invalid, default to not in quiet hours
    return false
  }
}

/**
 * Send a Slack DM to a user using their stored Slack credentials.
 * Returns true if the message was sent successfully.
 */
async function sendSlackDM(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  text: string,
  blocks?: unknown[],
): Promise<boolean> {
  // Get user's Slack credentials
  const { data: slackCreds } = await supabase
    .from('user_slack_credentials')
    .select('access_token, slack_user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!slackCreds?.access_token || !slackCreds?.slack_user_id) {
    return false
  }

  // Open DM conversation
  const openRes = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${slackCreds.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users: slackCreds.slack_user_id }),
  })

  const openData = await openRes.json() as { ok: boolean; channel?: { id: string } }
  if (!openData.ok || !openData.channel?.id) {
    return false
  }

  // Send message
  const msgBody: Record<string, unknown> = {
    channel: openData.channel.id,
    text,
  }
  if (blocks) {
    msgBody.blocks = blocks
  }

  const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${slackCreds.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(msgBody),
  })

  const msgData = await msgRes.json() as { ok: boolean }
  return msgData.ok
}

/**
 * Agent Tick: The central loop for agentic follow-through.
 *
 * Called by pg_cron every 30 minutes. For each user with agent enabled:
 * 1. Check quiet hours → skip if in quiet hours
 * 2. Phase 2+: Nudge on overdue action items
 * 3. Phase 3+: Pre-stage meeting prep
 * 4. Phase 4+: Escalation patterns
 * 5. Phase 5+: Format recommendations
 *
 * Auth: service-role only (verify_jwt = false in config.toml).
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

    // Validate service-role auth
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token !== serviceRoleKey) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Fetch all users with agent enabled
    const { data: settingsRows, error: settingsErr } = await supabase
      .from('cos_settings')
      .select('user_id, agent_config')

    if (settingsErr) {
      return jsonResponse({ error: 'settings_fetch_failed', detail: settingsErr.message }, 500)
    }

    const enabledUsers = (settingsRows ?? []).filter((row: { agent_config: unknown }) => {
      const config = row.agent_config as Partial<AgentConfig> | null
      return config?.enabled === true
    })

    if (enabledUsers.length === 0) {
      return jsonResponse({ message: 'no_enabled_users', processed: 0 }, 200)
    }

    const results: Array<{
      user_id: string
      skipped_reason?: string
      actions_nudged?: number
      preps_staged?: number
      escalations?: number
    }> = []

    for (const row of enabledUsers) {
      const userId = (row as { user_id: string }).user_id
      const rawConfig = (row as { agent_config: unknown }).agent_config
      const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...(rawConfig as Partial<AgentConfig>) }

      // Post-meeting transcript check runs regardless of quiet hours — it only
      // does silent DB work (sync Zoom + extract action items). We just suppress
      // the Slack ping during quiet hours. Running it here (before the quiet-hours
      // skip) ensures meetings that finish in the evening are still processed.
      const inQuiet = isInQuietHours(config)
      if (config.post_meeting_check) {
        try {
          await postMeetingCheck(supabase, supabaseUrl, serviceRoleKey, userId, config, inQuiet)
        } catch (err) {
          await logAgentEvent(supabase, userId, 'error', {
            handler: 'post_meeting_check',
            error: (err as Error).message,
          })
        }
      }

      // Check quiet hours — skip the notification-heavy handlers below.
      if (inQuiet) {
        results.push({ user_id: userId, skipped_reason: 'quiet_hours' })
        continue
      }

      let actionsNudged = 0
      let prepsStaged = 0
      let escalations = 0

      // ── Adaptive behavior: adjust config based on feedback ────────────
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

        const { data: recentFeedback } = await supabase
          .from('cos_agent_feedback')
          .select('feedback_type')
          .eq('user_id', userId)
          .gte('created_at', thirtyDaysAgo)

        if (recentFeedback && recentFeedback.length >= 3) {
          const counts: Record<string, number> = {}
          for (const f of recentFeedback as Array<{ feedback_type: string }>) {
            counts[f.feedback_type] = (counts[f.feedback_type] ?? 0) + 1
          }

          // Too-early feedback: increase nudge timing (up to 48h)
          if ((counts.too_early ?? 0) >= 3 && config.nudge_timing_hours < 48) {
            config.nudge_timing_hours = Math.min(48, config.nudge_timing_hours + 6)
          }
          // Too-late feedback: decrease nudge timing (down to 6h)
          if ((counts.too_late ?? 0) >= 3 && config.nudge_timing_hours > 6) {
            config.nudge_timing_hours = Math.max(6, config.nudge_timing_hours - 6)
          }
        }
      } catch {
        // Non-fatal
      }

      // ── Nudge overdue action items ────────────────────────────────────
      if (config.nudge_actions) {
        try {
          actionsNudged = await nudgeActionItems(supabase, userId, config)
        } catch (err) {
          await logAgentEvent(supabase, userId, 'error', {
            handler: 'nudge_actions',
            error: (err as Error).message,
          })
        }
      }

      // ── Pre-stage meeting prep ────────────────────────────────────────
      if (config.pre_stage_prep) {
        try {
          prepsStaged = await prestagePreps(supabase, supabaseUrl, serviceRoleKey, userId, config)
        } catch (err) {
          await logAgentEvent(supabase, userId, 'error', {
            handler: 'pre_stage_prep',
            error: (err as Error).message,
          })
        }
      }

      // ── Escalation detection ───────────────────────────────────────
      if (config.escalate_patterns) {
        try {
          const patterns = await detectEscalations(supabase, userId)

          for (const pattern of patterns) {
            const severityEmoji = pattern.severity === 'critical' ? ':rotating_light:' : ':warning:'
            const typeLabels: Record<string, string> = {
              chronic_overdue: 'Chronic Overdue',
              missing_meetings: 'Missing Meetings',
              commitment_drift: 'Commitment Drift',
              stalled_topics: 'Stalled Topics',
            }

            if (config.slack_notifications) {
              await sendSlackDM(supabase, userId,
                `${typeLabels[pattern.type] ?? pattern.type}: ${pattern.details}`,
                [{
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `${severityEmoji} *${typeLabels[pattern.type]}*${pattern.member_name ? ` — ${pattern.member_name}` : ''}\n\n${pattern.details}`,
                  },
                }],
              )
            }

            await supabase.from('cos_agent_log').insert({
              user_id: userId,
              event_type: 'escalation_flagged',
              member_id: pattern.member_id ?? null,
              payload: {
                type: pattern.type,
                member_id: pattern.member_id,
                severity: pattern.severity,
                details: pattern.details,
              },
            })

            escalations++
          }
        } catch (err) {
          await logAgentEvent(supabase, userId, 'error', {
            handler: 'escalate_patterns',
            error: (err as Error).message,
          })
        }
      }

      // ── Format recommendations ─────────────────────────────────────
      if (config.recommend_format) {
        try {
          await computeFormatRecommendations(supabase, userId, config)
        } catch (err) {
          await logAgentEvent(supabase, userId, 'error', {
            handler: 'recommend_format',
            error: (err as Error).message,
          })
        }
      }

      // Log tick completion
      await logAgentEvent(supabase, userId, 'tick_completed', {
        actions_nudged: actionsNudged,
        preps_staged: prepsStaged,
        escalations,
      })

      results.push({
        user_id: userId,
        actions_nudged: actionsNudged,
        preps_staged: prepsStaged,
        escalations,
      })
    }

    return jsonResponse({
      processed: results.length,
      results,
    }, 200)

  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})

// ── Action item nudging ─────────────────────────────────────────────────────

async function nudgeActionItems(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: AgentConfig,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const nudgeWindowMs = config.nudge_timing_hours * 3600 * 1000
  const nudgeDate = new Date(Date.now() + nudgeWindowMs).toISOString().slice(0, 10)

  // Find actions approaching or past due date
  const { data: dueActions } = await supabase
    .from('cos_meeting_actions')
    .select('id, text, due_date, member_id, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .not('due_date', 'is', null)
    .lte('due_date', nudgeDate)

  // Also find age-based actions (no due date, pending > 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const { data: agedActions } = await supabase
    .from('cos_meeting_actions')
    .select('id, text, due_date, member_id, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .is('due_date', null)
    .lte('created_at', fourteenDaysAgo)

  const allActions = [...(dueActions ?? []), ...(agedActions ?? [])]
  if (allActions.length === 0) return 0

  // Pull the full nudge history (and any prior "capped" markers) for the
  // candidate actions. This drives both the same-day de-dupe AND the all-time
  // ceiling that stops a stale pending item from nagging forever.
  const candidateIds = allActions.map((a: { id: string }) => a.id)
  const { data: historyLogs } = await supabase
    .from('cos_agent_log')
    .select('action_id, event_type, created_at')
    .eq('user_id', userId)
    .in('event_type', ['nudge_sent', 'nudge_capped'])
    .in('action_id', candidateIds)

  const nudgeCountByAction = new Map<string, number>()
  const nudgedToday = new Set<string>()
  const alreadyCapped = new Set<string>()
  for (const log of (historyLogs ?? []) as Array<{ action_id: string | null; event_type: string; created_at: string }>) {
    if (!log.action_id) continue
    if (log.event_type === 'nudge_capped') {
      alreadyCapped.add(log.action_id)
      continue
    }
    nudgeCountByAction.set(log.action_id, (nudgeCountByAction.get(log.action_id) ?? 0) + 1)
    if (log.created_at >= today + 'T00:00:00Z') nudgedToday.add(log.action_id)
  }

  // Actions that have hit the nudge ceiling but haven't been parked yet.
  // Park them with a one-time notice so they stop nagging daily; the user can
  // still resolve them via Mark done / Snooze in Slack.
  const newlyCapped = allActions.filter(
    (a: { id: string }) =>
      !alreadyCapped.has(a.id) &&
      (nudgeCountByAction.get(a.id) ?? 0) >= config.nudge_max_count,
  ) as Array<{ id: string; text: string; member_id: string }>

  for (const action of newlyCapped) {
    await supabase.from('cos_agent_log').insert({
      user_id: userId,
      event_type: 'nudge_capped',
      action_id: action.id,
      member_id: action.member_id,
      payload: {
        text: action.text,
        nudge_count: config.nudge_max_count,
        reason: 'max_nudges_reached',
      },
    })
  }

  const toNudgeRaw = allActions.filter(
    (a: { id: string }) =>
      !nudgedToday.has(a.id) &&
      !alreadyCapped.has(a.id) &&
      (nudgeCountByAction.get(a.id) ?? 0) < config.nudge_max_count,
  )

  if (toNudgeRaw.length === 0) return 0

  // Get member info including agent overrides
  const memberIds = [...new Set(
    toNudgeRaw.map((a: { member_id: string }) => a.member_id)
  )]

  const { data: members } = await supabase
    .from('cos_team_members')
    .select('id, name, agent_overrides')
    .in('id', memberIds)

  // Filter out members with nudge_actions disabled in their overrides
  const suppressedMembers = new Set(
    ((members ?? []) as Array<{ id: string; agent_overrides: Record<string, unknown> }>)
      .filter(m => m.agent_overrides?.nudge_actions === false)
      .map(m => m.id)
  )

  const toNudge = toNudgeRaw.filter(
    (a: { member_id: string }) => !suppressedMembers.has(a.member_id)
  )

  if (toNudge.length === 0) return 0

  const memberMap = new Map(
    (members ?? []).map((m: { id: string; name: string }) => [m.id, m.name])
  )

  // Group by member for a consolidated message
  const byMember: Record<string, Array<{ id: string; text: string; due_date: string | null; created_at: string }>> = {}
  for (const action of toNudge as Array<{ id: string; text: string; due_date: string | null; member_id: string; created_at: string }>) {
    const memberName = memberMap.get(action.member_id) ?? 'Team member'
    if (!byMember[memberName]) byMember[memberName] = []
    byMember[memberName].push(action)
  }

  // Build Slack message with interactive buttons
  if (config.slack_notifications) {
    const blocks: unknown[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:bell: *Action Items Need Attention*\n\nYou have ${toNudge.length} item(s) approaching or past their due date:`,
        },
      },
    ]

    for (const [memberName, actions] of Object.entries(byMember)) {
      // Section header per member
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${memberName}:*`,
        },
      })

      // Each action with its own buttons
      for (const a of actions) {
        const dueLabel = a.due_date
          ? `due ${a.due_date}`
          : `pending ${Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86_400_000)} days`

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• ${a.text} _(${dueLabel})_`,
          },
          accessory: {
            type: 'overflow',
            action_id: `action_overflow:${a.id}`,
            options: [
              {
                text: { type: 'plain_text', text: ':white_check_mark: Mark done' },
                value: `mark_done:${a.id}`,
              },
              {
                text: { type: 'plain_text', text: ':clock3: Snooze 2 days' },
                value: `snooze:${a.id}:2`,
              },
              {
                text: { type: 'plain_text', text: ':clock4: Snooze 7 days' },
                value: `snooze:${a.id}:7`,
              },
            ],
          },
        })
      }
    }

    // Feedback buttons at the bottom
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: ':thumbsup: Helpful' },
          action_id: 'feedback:nudge:helpful',
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: ':clock1: Too early' },
          action_id: 'feedback:nudge:too_early',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: ':thumbsdown: Not helpful' },
          action_id: 'feedback:nudge:not_helpful',
        },
      ],
    })

    await sendSlackDM(
      supabase,
      userId,
      `You have ${toNudge.length} action item(s) approaching or past their due date`,
      blocks,
    )
  }

  // Log each nudge and collect log IDs for feedback linkage
  for (const action of toNudge as Array<{ id: string; text: string; due_date: string | null; member_id: string }>) {
    await supabase.from('cos_agent_log').insert({
      user_id: userId,
      event_type: 'nudge_sent',
      action_id: action.id,
      member_id: action.member_id,
      payload: { due_date: action.due_date, text: action.text },
    })
  }

  return toNudge.length
}

// ── Pre-stage meeting prep ──────────────────────────────────────────────────

async function prestagePreps(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  config: AgentConfig,
): Promise<number> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 3600 * 1000)
  const todayDate = now.toISOString().slice(0, 10)

  // Find meetings in the next 24 hours with a team_member_id
  const { data: events } = await supabase
    .from('cos_one_on_one_events')
    .select('id, team_member_id, title, start_time')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .not('team_member_id', 'is', null)
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())

  let staged = 0

  for (const event of (events ?? []) as Array<{
    id: string; team_member_id: string; title: string | null; start_time: string
  }>) {
    // Check per-person override
    const { data: memberOverrides } = await supabase
      .from('cos_team_members')
      .select('agent_overrides')
      .eq('id', event.team_member_id)
      .single()

    if ((memberOverrides?.agent_overrides as Record<string, unknown>)?.auto_prep === false) continue

    // Check if we already staged prep for this event today
    const { count: alreadyStaged } = await supabase
      .from('cos_agent_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'prep_staged')
      .eq('event_id', event.id)
      .gte('created_at', todayDate + 'T00:00:00Z')

    if ((alreadyStaged ?? 0) > 0) continue

    // Check if prep already exists for this member today
    const { data: existingPrep } = await supabase
      .from('cos_one_on_one_prep')
      .select('id')
      .eq('user_id', userId)
      .eq('team_member_id', event.team_member_id)
      .eq('prep_date', todayDate)
      .eq('source', 'ai_generated')
      .eq('status', 'ready')
      .maybeSingle()

    if (existingPrep) continue

    // Call generate-1on1-prep with service-role auth
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-1on1-prep`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team_member_id: event.team_member_id,
          event_id: event.id,
          force_regenerate: false,
          _batch_user_id: userId,
        }),
      })

      if (res.ok) {
        staged++

        // Get member name for notification
        const { data: member } = await supabase
          .from('cos_team_members')
          .select('name')
          .eq('id', event.team_member_id)
          .single()

        const memberName = member?.name ?? 'your team member'

        // Format meeting time in user's timezone
        let meetingTime = event.start_time
        try {
          meetingTime = new Date(event.start_time).toLocaleTimeString('en-US', {
            timeZone: config.timezone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        } catch { /* use raw if timezone fails */ }

        // Notify via Slack
        if (config.slack_notifications) {
          await sendSlackDM(supabase, userId, `Your 1:1 prep for ${memberName} is ready (meeting at ${meetingTime})`, [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `:sparkles: *1:1 Prep Ready*\n\nYour meeting with *${memberName}* is at *${meetingTime}*. I've prepared your briefing.`,
              },
            },
          ])
        }

        // Log
        await supabase.from('cos_agent_log').insert({
          user_id: userId,
          event_type: 'prep_staged',
          event_id: event.id,
          member_id: event.team_member_id,
          payload: { member_name: memberName, meeting_time: event.start_time },
        })
      }
    } catch (err) {
      console.warn(`Prep staging failed for event ${event.id}:`, (err as Error).message)
    }
  }

  return staged
}

// ── Format recommendations ──────────────────────────────────────────────────

const CADENCE_DAYS: Record<string, number> = {
  direct_report: 7, collaborator: 14, boss: 14,
  peer: 14, skip_level: 30, stakeholder: 30, external: 30,
}

async function computeFormatRecommendations(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: AgentConfig,
): Promise<void> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 3600 * 1000)
  const todayDate = now.toISOString().slice(0, 10)

  // Find meetings in the next 24 hours
  const { data: events } = await supabase
    .from('cos_one_on_one_events')
    .select('id, team_member_id, title, start_time')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .not('team_member_id', 'is', null)
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())

  for (const event of (events ?? []) as Array<{
    id: string; team_member_id: string; title: string | null; start_time: string
  }>) {
    // Check if we already recommended for this event today
    const { count: alreadyDone } = await supabase
      .from('cos_agent_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'format_recommended')
      .eq('event_id', event.id)
      .gte('created_at', todayDate + 'T00:00:00Z')

    if ((alreadyDone ?? 0) > 0) continue

    // Gather signals for scoring
    const [actionsRes, topicsRes, memberRes, flaggedRes] = await Promise.all([
      supabase
        .from('cos_meeting_actions')
        .select('id, due_date', { count: 'exact' })
        .eq('user_id', userId)
        .eq('member_id', event.team_member_id)
        .eq('status', 'pending'),
      supabase
        .from('cos_person_topics')
        .select('id', { count: 'exact' })
        .eq('member_id', event.team_member_id),
      supabase
        .from('cos_team_members')
        .select('relationship_type, last_1on1_date')
        .eq('id', event.team_member_id)
        .single(),
      supabase
        .from('quarterly_priorities')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('flagged', true),
    ])

    const pendingCount = actionsRes.count ?? 0
    const topicCount = topicsRes.count ?? 0
    const member = memberRes.data as { relationship_type: string; last_1on1_date: string | null } | null
    const flaggedCount = flaggedRes.count ?? 0

    // Count overdue items
    const overdueActions = ((actionsRes.data ?? []) as Array<{ due_date: string | null }>)
      .filter(a => a.due_date && a.due_date < todayDate)
    const overdueCount = overdueActions.length

    // Compute cadence gap
    let cadenceExceeded = false
    if (member?.last_1on1_date) {
      const cadence = CADENCE_DAYS[member.relationship_type] ?? 14
      const daysSince = Math.floor(
        (Date.now() - new Date(member.last_1on1_date + 'T00:00:00').getTime()) / 86_400_000
      )
      cadenceExceeded = daysSince > cadence
    }

    // Score
    const score =
      (pendingCount * 2) +
      (topicCount * 1) +
      (overdueCount * 3) +
      (cadenceExceeded ? 5 : 0) +
      (flaggedCount > 0 ? 4 : 0)

    let format: string
    let emoji: string
    const reasons: string[] = []

    if (score === 0) {
      format = 'Skip or async check-in'
      emoji = ':fast_forward:'
      reasons.push('No pending items or topics')
    } else if (score <= 3) {
      format = 'Quick sync (15 min)'
      emoji = ':zap:'
      if (pendingCount > 0) reasons.push(`${pendingCount} pending action(s)`)
      if (topicCount > 0) reasons.push(`${topicCount} standing topic(s)`)
    } else if (score <= 8) {
      format = 'Standard (30 min)'
      emoji = ':speech_balloon:'
      if (pendingCount > 0) reasons.push(`${pendingCount} pending action(s)`)
      if (overdueCount > 0) reasons.push(`${overdueCount} overdue`)
      if (cadenceExceeded) reasons.push('Overdue for catch-up')
    } else {
      format = 'Extended (45-60 min)'
      emoji = ':calendar:'
      if (overdueCount > 0) reasons.push(`${overdueCount} overdue action(s)`)
      if (flaggedCount > 0) reasons.push(`${flaggedCount} flagged priority`)
      if (cadenceExceeded) reasons.push('Overdue for catch-up')
      if (pendingCount >= 5) reasons.push(`${pendingCount} pending items`)
    }

    // Get member name
    const { data: memberData } = await supabase
      .from('cos_team_members')
      .select('name')
      .eq('id', event.team_member_id)
      .single()

    const memberName = memberData?.name ?? 'Team member'

    // Send notification (only if score suggests something non-standard)
    if (score === 0 || score > 8) {
      if (config.slack_notifications) {
        await sendSlackDM(supabase, userId,
          `Meeting format suggestion for ${memberName}: ${format}`,
          [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *Suggested format for ${memberName}:* ${format}\n\n${reasons.map(r => `• ${r}`).join('\n')}`,
            },
          }],
        )
      }
    }

    // Log
    await supabase.from('cos_agent_log').insert({
      user_id: userId,
      event_type: 'format_recommended',
      event_id: event.id,
      member_id: event.team_member_id,
      payload: {
        format,
        score,
        reasons,
        member_name: memberName,
      },
    })
  }
}

// ── Post-meeting transcript check ──────────────────────────────────────────
//
// Called every 30 min. Looks for 1:1 calendar events with a Zoom meeting ID
// that started 15 min–2.5 h ago (i.e., likely just finished), syncs the Zoom
// recording, then runs generate-meeting-suggestions to extract action items.
// Uses dci_meeting_schedule to track which meetings have been processed so
// each meeting is handled exactly once.

async function postMeetingCheck(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  config: AgentConfig,
  suppressNotify = false,
): Promise<void> {
  const now = new Date()
  // Look back 24 h (not 2.5 h): Zoom cloud transcripts frequently aren't ready
  // within a couple hours, and meetings that end during quiet hours must still
  // be caught later. A meeting stays eligible until its transcript arrives or it
  // ages out of this window.
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 h ago
  const windowEnd   = new Date(now.getTime() -  15 * 60 * 1000)     // 15 min ago

  // Find calendar events with a Zoom link that recently ended.
  const { data: calEvents } = await supabase
    .from('cos_one_on_one_events')
    .select('id, team_member_id, title, start_time, zoom_meeting_id')
    .eq('user_id', userId)
    .not('zoom_meeting_id', 'is', null)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .neq('status', 'cancelled')

  if (!calEvents || calEvents.length === 0) return

  // Ensure each event has a dci_meeting_schedule row (insert-only; never
  // overwrite an existing row so transcript_checked state is preserved).
  for (const event of calEvents as Array<{
    id: string; team_member_id: string | null; title: string | null
    start_time: string; zoom_meeting_id: string
  }>) {
    const startDt = new Date(event.start_time)
    const endDt   = new Date(startDt.getTime() + 60 * 60 * 1000) // assume 60-min meeting
    await supabase
      .from('dci_meeting_schedule')
      .upsert({
        user_id:        userId,
        date:           startDt.toISOString().slice(0, 10),
        title:          event.title ?? 'Meeting',
        start_time:     event.start_time,
        end_time:       endDt.toISOString(),
        zoom_meeting_id: event.zoom_meeting_id,
        attendees:      [] as string[],
      }, { onConflict: 'user_id,date,title,start_time', ignoreDuplicates: true })
  }

  // Find the subset that hasn't been processed yet.
  const { data: pending } = await supabase
    .from('dci_meeting_schedule')
    .select('id, title, zoom_meeting_id')
    .eq('user_id', userId)
    .eq('transcript_checked', false)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())

  if (!pending || pending.length === 0) return

  const pendingIds = (pending as Array<{ id: string }>).map(r => r.id)

  // Step 1: Sync Zoom recordings for the last day.
  let zoomSyncOk = false
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/zoom-recordings-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'x-supabase-user-id': userId,
      },
      body: JSON.stringify({ days: 1 }),
    })
    zoomSyncOk = res.ok
    if (!res.ok) console.warn(`post_meeting_check: zoom-recordings-sync returned ${res.status}`)
  } catch (err) {
    console.warn('post_meeting_check: zoom sync failed:', (err as Error).message)
  }

  // Step 2: Extract action item suggestions from any new transcripts.
  let suggestionsAdded = 0
  if (zoomSyncOk) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-meeting-suggestions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'x-supabase-user-id': userId,
        },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json() as { suggestions_added?: number }
        suggestionsAdded = data.suggestions_added ?? 0
      } else {
        console.warn(`post_meeting_check: generate-meeting-suggestions returned ${res.status}`)
      }
    } catch (err) {
      console.warn('post_meeting_check: suggestions extraction failed:', (err as Error).message)
    }
  }

  // Only mark meetings whose Zoom transcript has actually arrived. Meetings
  // still awaiting a transcript stay pending and are retried on later ticks
  // until their transcript lands or they age out of the 24 h window — this is
  // what prevents slow Zoom transcripts from being permanently skipped.
  const pendingZoomIds = [...new Set(
    (pending as Array<{ zoom_meeting_id: string | null }>)
      .map(r => r.zoom_meeting_id)
      .filter((z): z is string => !!z),
  )]

  let transcribedZoomIds = new Set<string>()
  if (pendingZoomIds.length > 0) {
    const { data: recs } = await supabase
      .from('cos_zoom_recordings')
      .select('zoom_meeting_id')
      .eq('user_id', userId)
      .eq('has_transcript', true)
      .in('zoom_meeting_id', pendingZoomIds)
    transcribedZoomIds = new Set(
      ((recs ?? []) as Array<{ zoom_meeting_id: string }>).map(r => r.zoom_meeting_id),
    )
  }

  const doneIds = (pending as Array<{ id: string; zoom_meeting_id: string | null }>)
    .filter(r => r.zoom_meeting_id != null && transcribedZoomIds.has(r.zoom_meeting_id))
    .map(r => r.id)

  if (doneIds.length > 0) {
    await supabase
      .from('dci_meeting_schedule')
      .update({
        transcript_checked:     true,
        action_items_extracted: suggestionsAdded > 0,
      })
      .in('id', doneIds)
  }

  // Notify via Slack if action items were surfaced (suppressed during quiet hours).
  if (suggestionsAdded > 0 && config.slack_notifications && !suppressNotify) {
    const label = (pending as Array<{ title: string }>)[0]?.title ?? 'your recent meeting'
    const n = suggestionsAdded
    await sendSlackDM(
      supabase, userId,
      `${n} action item${n === 1 ? '' : 's'} extracted from ${label}`,
      [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:memo: *${n} action item${n === 1 ? '' : 's'} from ${label}*\n\nI found follow-ups from your recent meeting. Review them in your task suggestions panel.`,
        },
      }],
    )
  }

  await logAgentEvent(supabase, userId, 'post_meeting_check', {
    meetings_checked:   pendingIds.length,
    meetings_processed: doneIds.length,
    zoom_sync_ok:       zoomSyncOk,
    suggestions_added:  suggestionsAdded,
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function logAgentEvent(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
  extras?: { member_id?: string; event_id?: string; action_id?: string },
) {
  await supabase.from('cos_agent_log').insert({
    user_id: userId,
    event_type: eventType,
    payload,
    ...(extras ?? {}),
  })
}
