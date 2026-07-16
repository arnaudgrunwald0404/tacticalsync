import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { detectEscalations } from "../agent-escalation/index.ts"
import { retryWithBackoff } from "../_shared/retryWithBackoff.ts"
import {
  selectDueItemsToNudge,
  selectMeetingsForInboxNudge,
  decideOptInAction,
  buildMeetingNudgeRationale,
  buildDueDateNudgeRationale,
  fetchDoNowItems,
  fetchDueNowTierItems,
  fetchNeedsInputItems,
  fetchBlockingOthersItems,
  type DueInboxItem,
  type NudgeHistoryEntry,
  type UpcomingMeeting,
  type OptInState,
  type InboxNudgeCandidateItem,
  type BlockingOthersItem,
} from "../_shared/agentInboxNudges.ts"

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

// Same fallback convention as send-cos-team-member-invite's invite links.
function appOrigin(): string {
  return Deno.env.get('APP_ORIGIN') || 'https://app.tacticalsync.com'
}

interface AgentConfig {
  enabled: boolean
  nudge_actions: boolean
  pre_stage_prep: boolean
  escalate_patterns: boolean
  recommend_format: boolean
  post_meeting_check: boolean
  // Idea #7 (Relationship memory): pre-1:1 person brief in the inbox, 24h
  // ahead. Off by default — see PLAN_idea7_relationship_memory.md §4/§5c;
  // should only be enabled once Unified Funnel (idea #1) ingestion is live
  // for the workspace, since a brief built on incomplete data undermines
  // the trust the feature is meant to build.
  pre_stage_inbox_brief: boolean
  // Idea #4 (PLAN_idea4_agentic_followthrough.md): nudge before 1:1s about
  // open inbox items tagged to that person, and as fixed-due-date inbox
  // items approach their date. Defaults to false even when `enabled` is
  // true — gated behind the one-time opt-in prompt (see maybePromptOrNudge
  // below), not silently bundled into the master toggle.
  nudge_inbox_items: boolean
  // Gates the extract-zoom-quotes call inside postMeetingCheck (meeting_insight
  // rows in inbox_items). Rollout flag, defaults false — see
  // PLAN_idea3_meeting_insights.md §7 Step 6. Distinct from any future
  // user-facing Settings toggle (plan §9.4).
  enable_meeting_insights: boolean
  nudge_timing_hours: number
  nudge_max_count: number // stop nudging an action after this many nudges
  quiet_hours_start: number // 0-23
  quiet_hours_end: number   // 0-23
  timezone: string
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  nudge_actions: true,
  pre_stage_prep: true,
  escalate_patterns: false,
  recommend_format: false,
  post_meeting_check: true,
  pre_stage_inbox_brief: false,
  nudge_inbox_items: false,
  enable_meeting_insights: false,
  nudge_timing_hours: 24,
  nudge_max_count: 5,
  quiet_hours_start: 18,
  quiet_hours_end: 9,
  timezone: 'America/New_York',
}

// Per-notification-type Slack delivery toggles, replacing the old single
// agent_config.slack_notifications master flag. Set via the Notifications
// settings page (src/components/cos/NotificationSettingsPanel.tsx).
interface NotificationPreferences {
  overdue_action_nudges: boolean
  prep_ready: boolean
  escalation_alerts: boolean
  format_suggestions: boolean
  meeting_followups: boolean
  daily_brief: boolean
  inbox_item_nudges: boolean
  // Not read by agent-tick itself — sent by the standalone rcdo-stale-check
  // function (see its own copy of this interface) — kept here too so this
  // duplicated shape doesn't silently drift from the one in
  // src/hooks/useNotificationPreferences.ts and rcdo-stale-check/index.ts.
  rcdo_stale_alerts: boolean
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  overdue_action_nudges: true,
  prep_ready: true,
  escalation_alerts: true,
  format_suggestions: true,
  meeting_followups: true,
  daily_brief: true,
  inbox_item_nudges: true,
  rcdo_stale_alerts: true,
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
 * Format a Date as YYYY-MM-DD in the given timezone (not UTC), for same-day comparisons.
 */
function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/**
 * Describe when a meeting falls relative to now, in the user's timezone: "today", "tomorrow",
 * or a short weekday/date (e.g. "Wed, Jul 8"). Prep is staged up to 24h ahead, so notifications
 * must say which day the meeting is on or they read as same-day when checked against "today".
 */
function meetingDayLabel(startTime: string, timeZone: string): string {
  const now = new Date()
  const meetingDate = new Date(startTime)
  const todayKey = localDateKey(now, timeZone)
  const meetingKey = localDateKey(meetingDate, timeZone)

  if (meetingKey === todayKey) return 'today'

  const tomorrowKey = localDateKey(new Date(now.getTime() + 24 * 3600 * 1000), timeZone)
  if (meetingKey === tomorrowKey) return 'tomorrow'

  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(meetingDate)
}

/**
 * Mirrors categorizeMeeting()/meetingQualifies() in src/lib/prepTools.ts: 1:1s (at
 * most one other attendee) always qualify. Recurring meetings with 2+ other
 * attendees only qualify if the user opted their series into
 * cos_prep_schedule.included_group_series via the "Group meetings" settings panel.
 * One-off group meetings never qualify. Keep this in sync with prepTools.ts.
 */
function meetingQualifiesForPrep(
  recurringEventId: string | null,
  attendeeEmails: string[] | null,
  includedGroupSeries: string[],
): boolean {
  const attendeeCount = attendeeEmails?.length ?? 0
  if (attendeeCount <= 1) return true
  return !!recurringEventId && includedGroupSeries.includes(recurringEventId)
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
  const openRes = await retryWithBackoff(
    () => fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackCreds.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackCreds.slack_user_id }),
    }),
    { integration: 'slack', label: 'conversations.open' },
  )

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

  const msgRes = await retryWithBackoff(
    () => fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackCreds.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(msgBody),
    }),
    { integration: 'slack', label: 'chat.postMessage' },
  )

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

    // Auth: allow the pg_cron trigger (which posts with no Authorization header)
    // and service-role calls. Reject only a present-but-wrong token. This mirrors
    // daily-prep-batch's cron handling — the agent-tick-30m cron sends no auth
    // header, and the previous strict check made every tick 401 (so the body
    // never ran). verify_jwt is false for this function.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token && token !== serviceRoleKey) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Fetch all users with agent enabled
    const { data: settingsRows, error: settingsErr } = await supabase
      .from('cos_settings')
      .select('user_id, agent_config, notification_preferences')

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
      inbox_briefs_staged?: number
      escalations?: number
      inbox_items_nudged?: number
    }> = []

    for (const row of enabledUsers) {
      const userId = (row as { user_id: string }).user_id
      const rawConfig = (row as { agent_config: unknown }).agent_config
      const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...(rawConfig as Partial<AgentConfig>) }
      const rawNotifPrefs = (row as { notification_preferences: unknown }).notification_preferences
      const notifPrefs: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...(rawNotifPrefs as Partial<NotificationPreferences>),
      }

      // Post-meeting transcript check runs regardless of quiet hours — it only
      // does silent DB work (sync Zoom + extract action items). We just suppress
      // the Slack ping during quiet hours. Running it here (before the quiet-hours
      // skip) ensures meetings that finish in the evening are still processed.
      const inQuiet = isInQuietHours(config)
      if (config.post_meeting_check) {
        try {
          await postMeetingCheck(supabase, supabaseUrl, serviceRoleKey, userId, config, notifPrefs, inQuiet)
        } catch (err) {
          await logAgentEvent(supabase, userId, 'error', {
            handler: 'post_meeting_check',
            error: (err as Error).message,
          })
        }
      }

      // Gmail inbox mining — runs independently of Zoom, once per tick.
      // Dedup is handled inside gmail-inbox-sync via suggestion_source_processed.
      try {
        await fetch(`${supabaseUrl}/functions/v1/gmail-inbox-sync`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'x-supabase-user-id': userId,
          },
          body: JSON.stringify({ days: 7 }),
        })
      } catch (err) {
        await logAgentEvent(supabase, userId, 'error', {
          handler: 'gmail_inbox_sync',
          error: (err as Error).message,
        })
      }

      // Slack inbox mining — runs after slack-messages-sync has populated
      // cos_slack_messages. Dedup via suggestion_source_processed.
      try {
        await fetch(`${supabaseUrl}/functions/v1/slack-messages-sync`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'x-supabase-user-id': userId,
          },
          body: JSON.stringify({ days: 7 }),
        })
      } catch (err) {
        await logAgentEvent(supabase, userId, 'error', {
          handler: 'slack_messages_sync',
          error: (err as Error).message,
        })
      }

      try {
        await fetch(`${supabaseUrl}/functions/v1/slack-inbox-sync`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'x-supabase-user-id': userId,
          },
          body: JSON.stringify({ days: 7 }),
        })
      } catch (err) {
        await logAgentEvent(supabase, userId, 'error', {
          handler: 'slack_inbox_sync',
          error: (err as Error).message,
        })
      }

      // Check quiet hours — skip the notification-heavy handlers below.
      if (inQuiet) {
        results.push({ user_id: userId, skipped_reason: 'quiet_hours' })
        continue
      }

      let actionsNudged = 0
      let prepsStaged = 0
      let escalations = 0
      let inboxItemsNudged = 0
      let dailyDigestExtrasNudged = 0

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

      // ── Consolidated daily to-do digest ───────────────────────────────
      // Union of overdue/aged meeting action items (config.nudge_actions)
      // with Do Now / due-now / needs-your-input / blocking-others inbox
      // segments, sent as one message at most once per day — see
      // sendDailyDigest() for the once-daily gate and section assembly.
      try {
        const digestResult = await sendDailyDigest(supabase, userId, config, notifPrefs)
        actionsNudged = digestResult.actionsNudged
        dailyDigestExtrasNudged = digestResult.extrasNudged
      } catch (err) {
        await logAgentEvent(supabase, userId, 'error', {
          handler: 'daily_digest',
          error: (err as Error).message,
        })
      }

      // ── Pre-stage meeting prep ────────────────────────────────────────
      if (config.pre_stage_prep) {
        try {
          prepsStaged = await prestagePreps(supabase, supabaseUrl, serviceRoleKey, userId, config, notifPrefs)
        } catch (err) {
          await logAgentEvent(supabase, userId, 'error', {
            handler: 'pre_stage_prep',
            error: (err as Error).message,
          })
        }
      }

      // ── Pre-stage pre-1:1 inbox briefs (Idea #7: Relationship memory) ──
      let inboxBriefsStaged = 0
      if (config.pre_stage_inbox_brief) {
        try {
          inboxBriefsStaged = await prestageInboxBriefs(supabase, supabaseUrl, serviceRoleKey, userId, config, notifPrefs)
        } catch (err) {
          await logAgentEvent(supabase, userId, 'error', {
            handler: 'pre_stage_inbox_brief',
            error: (err as Error).message,
          })
        }
      }

      // ── Inbox item nudges (Idea #4) ─────────────────────────────────
      // Gated behind its own opt-in, independent of the master `enabled`
      // toggle and `nudge_inbox_items` config value — see
      // maybeNudgeInboxItems() for the opt-in prompt/cooldown logic.
      try {
        inboxItemsNudged = await maybeNudgeInboxItems(supabase, userId, config, notifPrefs)
      } catch (err) {
        await logAgentEvent(supabase, userId, 'error', {
          handler: 'nudge_inbox_items',
          error: (err as Error).message,
        })
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

            // Insert the log row first so its id is available to attach as the
            // Dismiss button's action_id (dismiss_escalation:<log_id>) — the
            // handler for this action already exists in both
            // agent-slack-action/index.ts and slack-bot/index.js, it just
            // never had a button pointing at it before.
            const { data: insertedEscalationLog } = await supabase.from('cos_agent_log').insert({
              user_id: userId,
              event_type: 'escalation_flagged',
              member_id: pattern.member_id ?? null,
              payload: {
                type: pattern.type,
                member_id: pattern.member_id,
                severity: pattern.severity,
                details: pattern.details,
              },
            }).select('id').single()

            if (notifPrefs.escalation_alerts) {
              const escalationBlocks: unknown[] = [{
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `${severityEmoji} *${typeLabels[pattern.type]}*${pattern.member_name ? ` — ${pattern.member_name}` : ''}\n\n${pattern.details}`,
                },
              }]

              const escalationLogId = (insertedEscalationLog as { id: string } | null)?.id
              if (escalationLogId) {
                escalationBlocks.push({ type: 'divider' })
                escalationBlocks.push({
                  type: 'actions',
                  elements: [
                    {
                      type: 'button',
                      text: { type: 'plain_text', text: ':mute: Dismiss' },
                      action_id: `dismiss_escalation:${escalationLogId}`,
                    },
                  ],
                })
              }

              await sendSlackDM(supabase, userId,
                `${typeLabels[pattern.type] ?? pattern.type}: ${pattern.details}`,
                escalationBlocks,
              )
            }

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
          await computeFormatRecommendations(supabase, userId, config, notifPrefs)
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
        inbox_briefs_staged: inboxBriefsStaged,
        escalations,
        inbox_items_nudged: inboxItemsNudged,
        daily_digest_extras_nudged: dailyDigestExtrasNudged,
      })

      results.push({
        user_id: userId,
        actions_nudged: actionsNudged,
        preps_staged: prepsStaged,
        inbox_briefs_staged: inboxBriefsStaged,
        escalations,
        inbox_items_nudged: inboxItemsNudged,
        daily_digest_extras_nudged: dailyDigestExtrasNudged,
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

type ActionItemCandidate = { id: string; text: string; due_date: string | null; member_id: string; created_at: string }

/**
 * Fetches overdue/aged cos_meeting_actions, applies the same-day dedupe and
 * all-time nudge-count ceiling (logging any newly-capped items along the
 * way — bookkeeping that happens regardless of whether a message ends up
 * being sent), and groups the result by member name.
 *
 * This is a pure candidate fetch — building/sending the Slack message is the
 * caller's job (see sendDailyDigest()), so this same candidate list can be
 * folded into one consolidated daily digest alongside Do Now / due-now /
 * needs-input / blocking-others, instead of firing its own separate message.
 */
async function fetchActionItemNudgeCandidates(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: AgentConfig,
): Promise<{ byMember: Record<string, ActionItemCandidate[]>; toNudge: ActionItemCandidate[] }> {
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
  if (allActions.length === 0) return { byMember: {}, toNudge: [] }

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

  if (toNudgeRaw.length === 0) return { byMember: {}, toNudge: [] }

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
  ) as ActionItemCandidate[]

  if (toNudge.length === 0) return { byMember: {}, toNudge: [] }

  const memberMap = new Map(
    (members ?? []).map((m: { id: string; name: string }) => [m.id, m.name])
  )

  // Group by member for a consolidated message
  const byMember: Record<string, ActionItemCandidate[]> = {}
  for (const action of toNudge) {
    const memberName = memberMap.get(action.member_id) ?? 'Team member'
    if (!byMember[memberName]) byMember[memberName] = []
    byMember[memberName].push(action)
  }

  return { byMember, toNudge }
}

/** Pure Slack block builder for the action-item section of the daily digest
 *  — one sub-section per member, each action with its own Mark done/Snooze
 *  overflow menu. No header/feedback blocks; the caller wraps this into the
 *  consolidated digest alongside the other sections. */
function buildActionItemBlocks(byMember: Record<string, ActionItemCandidate[]>): unknown[] {
  const blocks: unknown[] = []

  for (const [memberName, actions] of Object.entries(byMember)) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${memberName}:*` },
    })

    for (const a of actions) {
      const dueLabel = a.due_date
        ? `due ${a.due_date}`
        : `pending ${Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86_400_000)} days`

      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `• ${a.text} _(${dueLabel})_` },
        accessory: {
          type: 'overflow',
          action_id: `action_overflow:${a.id}`,
          options: [
            { text: { type: 'plain_text', text: ':white_check_mark: Mark done' }, value: `mark_done:${a.id}` },
            { text: { type: 'plain_text', text: ':clock3: Snooze 2 days' }, value: `snooze:${a.id}:2` },
            { text: { type: 'plain_text', text: ':clock4: Snooze 7 days' }, value: `snooze:${a.id}:7` },
          ],
        },
      })
    }
  }

  return blocks
}

/** Logs 'nudge_sent' for each action-item candidate once the consolidated
 *  digest has actually been sent — kept separate from the candidate fetch so
 *  a computed-but-unsent candidate (e.g. digest suppressed by notifPrefs)
 *  never gets marked as nudged. */
async function logActionItemNudgesSent(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  toNudge: ActionItemCandidate[],
): Promise<void> {
  for (const action of toNudge) {
    await supabase.from('cos_agent_log').insert({
      user_id: userId,
      event_type: 'nudge_sent',
      action_id: action.id,
      member_id: action.member_id,
      payload: { due_date: action.due_date, text: action.text },
    })
  }
}

// ── Pre-stage meeting prep ──────────────────────────────────────────────────

async function prestagePreps(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  config: AgentConfig,
  notifPrefs: NotificationPreferences,
): Promise<number> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 12 * 3600 * 1000)
  const todayDate = now.toISOString().slice(0, 10)

  // Find meetings in the next 12 hours with a team_member_id
  const { data: events } = await supabase
    .from('cos_one_on_one_events')
    .select('id, team_member_id, title, start_time, recurring_event_id, attendee_emails')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .not('team_member_id', 'is', null)
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())

  const { data: prepSchedule } = await supabase
    .from('cos_prep_schedule')
    .select('included_group_series')
    .eq('user_id', userId)
    .maybeSingle()

  const includedGroupSeries = (prepSchedule?.included_group_series as string[] | null) ?? []

  let staged = 0

  for (const event of (events ?? []) as Array<{
    id: string; team_member_id: string; title: string | null; start_time: string
    recurring_event_id: string | null; attendee_emails: string[] | null
  }>) {
    // Skip group meetings the user hasn't opted into daily prep for
    if (!meetingQualifiesForPrep(event.recurring_event_id, event.attendee_emails, includedGroupSeries)) continue

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

        // Idea #4 (plan Section 4, Option B): append any open inbox items
        // tagged to this person as an agenda section on the freshly
        // generated prep, rather than creating a separate inbox item or
        // rewriting generate-1on1-prep's own prompt (Option A, deferred).
        try {
          await appendInboxAgendaSection(supabase, userId, event.team_member_id, memberName, todayDate)
        } catch (err) {
          console.warn(`Agenda pre-staging failed for event ${event.id}:`, (err as Error).message)
        }

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

        const dayLabel = meetingDayLabel(event.start_time, config.timezone)

        // Notify via Slack
        if (notifPrefs.prep_ready) {
          await sendSlackDM(supabase, userId, `Your 1:1 prep for ${memberName} is ready (meeting ${dayLabel} at ${meetingTime})`, [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `:sparkles: *1:1 Prep Ready*\n\nYour meeting with *${memberName}* is ${dayLabel} at *${meetingTime}*. I've prepared your briefing.`,
              },
            },
            {
              type: 'actions',
              elements: [
                { type: 'button', text: { type: 'plain_text', text: 'View prep' }, url: `${appOrigin()}/check-ins`, style: 'primary' },
              ],
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

// ── Pre-stage pre-1:1 inbox briefs (Idea #7: Relationship memory) ───────────
// Mirrors prestagePreps' shape (same 12h window, same cos_one_on_one_events
// source, same qualifies-as-1:1 + per-member override checks) but calls
// generate-person-brief and writes a brief_item into inbox_items instead of
// cos_one_on_one_prep. See PLAN_idea7_relationship_memory.md §3.2.
async function prestageInboxBriefs(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  config: AgentConfig,
  notifPrefs: NotificationPreferences,
): Promise<number> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 3600 * 1000)
  const todayDate = now.toISOString().slice(0, 10)

  // Find meetings in the next 24 hours with a team_member_id — 24h (not the
  // 12h window prestagePreps uses) because the brief is meant to land a full
  // day ahead per the idea's "24 hours before each 1:1" requirement.
  const { data: events } = await supabase
    .from('cos_one_on_one_events')
    .select('id, team_member_id, title, start_time, recurring_event_id, attendee_emails')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .not('team_member_id', 'is', null)
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())

  const { data: prepSchedule } = await supabase
    .from('cos_prep_schedule')
    .select('included_group_series')
    .eq('user_id', userId)
    .maybeSingle()

  const includedGroupSeries = (prepSchedule?.included_group_series as string[] | null) ?? []

  let staged = 0

  for (const event of (events ?? []) as Array<{
    id: string; team_member_id: string; title: string | null; start_time: string
    recurring_event_id: string | null; attendee_emails: string[] | null
  }>) {
    // Only real 1:1s qualify — same rule prestagePreps and
    // computeFormatRecommendations already apply, kept in sync deliberately
    // rather than re-derived (see meetingQualifiesForPrep's docstring).
    if (!meetingQualifiesForPrep(event.recurring_event_id, event.attendee_emails, includedGroupSeries)) continue

    // Check per-person override (same flag prep-staging honors)
    const { data: memberOverrides } = await supabase
      .from('cos_team_members')
      .select('agent_overrides')
      .eq('id', event.team_member_id)
      .single()

    if ((memberOverrides?.agent_overrides as Record<string, unknown>)?.auto_prep === false) continue

    // Check if we already staged an inbox brief for this event today —
    // belt-and-suspenders alongside generate-person-brief's own source_ref
    // dedup, so a failed-but-partial run doesn't retry indefinitely without
    // a record of having tried.
    const { count: alreadyStaged } = await supabase
      .from('cos_agent_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'inbox_brief_staged')
      .eq('event_id', event.id)
      .gte('created_at', todayDate + 'T00:00:00Z')

    if ((alreadyStaged ?? 0) > 0) continue

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-person-brief`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          member_id: event.team_member_id,
          event_id: event.id,
          meeting_time: event.start_time,
        }),
      })

      if (res.ok) {
        const resBody = await res.json() as { created?: boolean }
        if (resBody.created) {
          staged++

          const { data: member } = await supabase
            .from('cos_team_members')
            .select('name')
            .eq('id', event.team_member_id)
            .single()
          const memberName = member?.name ?? 'your team member'
          const dayLabel = meetingDayLabel(event.start_time, config.timezone)

          if (notifPrefs.prep_ready) {
            await sendSlackDM(supabase, userId, `Your 1:1 brief for ${memberName} is in your inbox (meeting ${dayLabel})`, [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `:brain: *1:1 Brief Ready*\n\nYour meeting with *${memberName}* is ${dayLabel}. Open items, what's changed, and talking points are waiting in your inbox.`,
                },
              },
              {
                type: 'actions',
                elements: [
                  { type: 'button', text: { type: 'plain_text', text: 'View brief' }, url: `${appOrigin()}/inbox/person/${event.team_member_id}`, style: 'primary' },
                ],
              },
            ])
          }
        }

        await supabase.from('cos_agent_log').insert({
          user_id: userId,
          event_type: 'inbox_brief_staged',
          event_id: event.id,
          member_id: event.team_member_id,
          payload: { meeting_time: event.start_time, created: resBody.created ?? false },
        })
      }
    } catch (err) {
      console.warn(`Inbox brief staging failed for event ${event.id}:`, (err as Error).message)
    }
  }

  return staged
}

// ── Agenda pre-staging (Idea #4, plan Section 4 — Option B) ─────────────────
//
// Appends an "Open inbox items" section to today's freshly generated
// cos_one_on_one_prep.content for this member, sourced from the same
// person-tag join used by the pre-1:1 nudge (cos_team_members ->
// inbox_tags(type=person) -> inbox_item_tags -> inbox_items). Read-modify-
// write with an idempotency marker so re-running prestagePreps for the same
// event/day never duplicates the section — mirrors the existing
// summaryBlock dedupe pattern in delegate-inbox-task's planPhase().
const AGENDA_SECTION_MARKER = '<!-- inbox-agenda-section -->'

async function appendInboxAgendaSection(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  teamMemberId: string,
  memberName: string,
  prepDate: string,
): Promise<void> {
  const { data: personTags } = await supabase
    .from('inbox_tags')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'person')
    .eq('member_id', teamMemberId)

  const tagIds = ((personTags ?? []) as Array<{ id: string }>).map((t) => t.id)
  if (tagIds.length === 0) return

  const { data: itemTagRows } = await supabase
    .from('inbox_item_tags')
    .select('inbox_items!inner(id, text, status, user_id)')
    .in('tag_id', tagIds)

  const openItems = ((itemTagRows ?? []) as Array<{ inbox_items: { id: string; text: string; status: string; user_id: string } }>)
    .map((r) => r.inbox_items)
    .filter((item) => item && item.user_id === userId && item.status === 'open')

  if (openItems.length === 0) return

  const { data: prep } = await supabase
    .from('cos_one_on_one_prep')
    .select('id, content')
    .eq('user_id', userId)
    .eq('team_member_id', teamMemberId)
    .eq('prep_date', prepDate)
    .eq('source', 'ai_generated')
    .maybeSingle()

  if (!prep) return

  const existingContent = (prep as { id: string; content: string }).content ?? ''
  if (existingContent.includes(AGENDA_SECTION_MARKER)) return // already staged — idempotent

  const agendaSection = [
    '',
    AGENDA_SECTION_MARKER,
    `## Open inbox items tagged to ${memberName}`,
    ...openItems.map((item) => `- [ ] ${item.text}`),
  ].join('\n')

  await supabase
    .from('cos_one_on_one_prep')
    .update({ content: `${existingContent}\n${agendaSection}` })
    .eq('id', (prep as { id: string }).id)

  await supabase.from('cos_agent_log').insert({
    user_id: userId,
    event_type: 'inbox_agenda_staged',
    member_id: teamMemberId,
    payload: { member_name: memberName, item_count: openItems.length },
  })
}

// ── Inbox item nudges (Idea #4 — PLAN_idea4_agentic_followthrough.md) ───────
//
// Scope: self-owned items only (plan Section 6.B). This never resolves or
// contacts a Slack identity other than the inbox owner's own — cross-user
// "ping the item owner" nudges are blocked on idea #8 (people delegation /
// account linking) and are NOT implemented here.
//
// Two triggers, both gated behind the same opt-in:
//   1. Pre-1:1 nudge  — open inbox items tagged to a person the user has a
//      confirmed 1:1 with in the next 12h (matches prestagePreps()'s window).
//   2. Due-date nudge — open inbox items with a *fixed* due date
//      (priority_fixed = true) approaching within nudge_timing_hours.
//
// Both trigger types are collapsed into a single Slack DM per tick (the
// "digest cap" from the plan's risk section) rather than one message per
// trigger, to avoid stacking multiple agent messages on a user in one tick.

const OPTIN_COOLDOWN_DAYS = 14

/** Loads the current opt-in state for a user: whether nudge_inbox_items is
 *  already on, whether a prompt is currently awaiting an answer, and when
 *  the user last declined (if ever). */
async function loadOptInState(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: AgentConfig,
): Promise<OptInState> {
  const { data: pendingPrompt } = await supabase
    .from('inbox_items')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'agent_question')
    .eq('status', 'open')
    .contains('agent_payload', { source: 'inbox_agent_optin_prompt' })
    .maybeSingle()

  const { data: lastDecline } = await supabase
    .from('cos_agent_log')
    .select('created_at')
    .eq('user_id', userId)
    .eq('event_type', 'inbox_optin_declined')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    nudgeInboxItemsEnabled: config.nudge_inbox_items === true,
    lastDeclinedAt: (lastDecline as { created_at: string } | null)?.created_at ?? null,
    promptCurrentlyPending: !!pendingPrompt,
  }
}

/** Creates the one-time in-app opt-in prompt (plan Section 5.1) as an
 *  agent_question inbox item. Reuses the existing agent_question type's CTA
 *  affordance (see InboxItemRow.tsx) rather than inventing new UI. */
async function createOptInPrompt(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  await supabase.from('inbox_items').insert({
    user_id: userId,
    type: 'agent_question',
    text: 'Want me to flag open items before your 1:1s and as due dates approach?',
    status: 'open',
    agent_payload: {
      source: 'inbox_agent_optin_prompt',
      rationale:
        "I noticed you have items tagged to people you meet with regularly. I can remind you about those before each 1:1, and ping you in Slack as due dates get close — so nothing slips through unnoticed. You can turn this off anytime in Settings → Agent.",
      action_required: true,
      cta_label: 'Turn on nudges',
      cta_action: 'enable_inbox_nudges',
    },
  })

  await logAgentEvent(supabase, userId, 'inbox_optin_prompted', {})
}

/** Sends the one-time "this is new" explainer that prepends the very first
 *  real inbox nudge DM a user receives (plan Section 5.2). Tracked via
 *  cos_agent_log so it never repeats. */
async function maybeSendFirstDmExplainer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const { count } = await supabase
    .from('cos_agent_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'inbox_nudge_explainer_shown')

  if ((count ?? 0) > 0) return ''

  await logAgentEvent(supabase, userId, 'inbox_nudge_explainer_shown', {})

  return (
    ':sparkles: *This is a new kind of message from your agent — a heads-up about inbox items ' +
    "tied to people or dates, sent automatically before they become a problem.*\n" +
    '_(You can turn this off anytime: Settings → Agent → Inbox item nudges. This explainer only shows once.)_'
  )
}

/** Fetches open, fixed-due-date inbox items and the nudge history needed to
 *  dedupe/cap them, then defers the actual decision to the pure, tested
 *  selectDueItemsToNudge() in _shared/agentInboxNudges.ts. */
interface DueNudgeItemWithText extends DueInboxItem {
  text: string
}

async function fetchDueNudgeCandidates(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: AgentConfig,
): Promise<{ toNudge: DueNudgeItemWithText[]; newlyCappedIds: string[] }> {
  const windowEnd = new Date(Date.now() + config.nudge_timing_hours * 3600 * 1000).toISOString()

  const { data: items } = await supabase
    .from('inbox_items')
    .select('id, text, priority_fixed, priority_due_at, status')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq('priority_fixed', true)
    .not('priority_due_at', 'is', null)
    .lte('priority_due_at', windowEnd)

  const dueItems = (items ?? []) as DueNudgeItemWithText[]
  if (dueItems.length === 0) return { toNudge: [], newlyCappedIds: [] }

  const itemIds = dueItems.map((i) => i.id)
  const { data: history } = await supabase
    .from('cos_agent_log')
    .select('item_id, event_type, created_at')
    .eq('user_id', userId)
    .in('event_type', ['inbox_due_nudge_sent', 'inbox_due_nudge_capped'])
    .in('item_id', itemIds)

  const decision = selectDueItemsToNudge(
    dueItems,
    (history ?? []) as NudgeHistoryEntry[],
    { nudge_timing_hours: config.nudge_timing_hours, nudge_max_count: config.nudge_max_count },
  )

  const byId = new Map(dueItems.map((i) => [i.id, i]))
  return {
    toNudge: decision.toNudge.map((id) => byId.get(id)!).filter(Boolean),
    newlyCappedIds: decision.newlyCapped,
  }
}

/** Fetches confirmed 1:1s in the next 12h, joins to inbox_tags(type=person)
 *  and their open inbox items, and returns per-meeting nudge payloads. */
async function fetchMeetingNudgeCandidates(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: AgentConfig,
): Promise<Array<{ eventId: string; memberId: string; memberName: string; startTime: string; items: Array<{ id: string; text: string }> }>> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 12 * 3600 * 1000)

  const { data: events } = await supabase
    .from('cos_one_on_one_events')
    .select('id, team_member_id, start_time, status')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .not('team_member_id', 'is', null)
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())

  const meetings = (events ?? []) as Array<{ id: string; team_member_id: string; start_time: string; status: string }>
  if (meetings.length === 0) return []

  const eventIds = meetings.map((e) => e.id)
  const { data: alreadyNudged } = await supabase
    .from('cos_agent_log')
    .select('event_id')
    .eq('user_id', userId)
    .eq('event_type', 'inbox_nudge_sent')
    .in('event_id', eventIds)

  const alreadyNudgedIds = ((alreadyNudged ?? []) as Array<{ event_id: string }>).map((r) => r.event_id)

  const eligible = selectMeetingsForInboxNudge(
    meetings.map((m): UpcomingMeeting => ({
      eventId: m.id,
      teamMemberId: m.team_member_id,
      startTime: m.start_time,
      status: m.status as UpcomingMeeting['status'],
    })),
    alreadyNudgedIds,
    now,
  )

  if (eligible.length === 0) return []

  const memberIds = [...new Set(eligible.map((m) => m.teamMemberId))]
  const [{ data: members }, { data: personTags }] = await Promise.all([
    supabase.from('cos_team_members').select('id, name').in('id', memberIds),
    supabase.from('inbox_tags').select('id, member_id').eq('user_id', userId).eq('type', 'person').in('member_id', memberIds),
  ])

  const memberNameById = new Map(((members ?? []) as Array<{ id: string; name: string }>).map((m) => [m.id, m.name]))
  const tagIdsByMember = new Map<string, string[]>()
  for (const tag of (personTags ?? []) as Array<{ id: string; member_id: string }>) {
    const list = tagIdsByMember.get(tag.member_id) ?? []
    list.push(tag.id)
    tagIdsByMember.set(tag.member_id, list)
  }

  const results: Array<{ eventId: string; memberId: string; memberName: string; startTime: string; items: Array<{ id: string; text: string }> }> = []

  for (const meeting of eligible) {
    const tagIds = tagIdsByMember.get(meeting.teamMemberId) ?? []
    if (tagIds.length === 0) continue // no person-tag for this member — nothing to surface

    const { data: itemTagRows } = await supabase
      .from('inbox_item_tags')
      .select('item_id, inbox_items!inner(id, text, status, user_id)')
      .in('tag_id', tagIds)

    const openItems = ((itemTagRows ?? []) as Array<{ item_id: string; inbox_items: { id: string; text: string; status: string; user_id: string } }>)
      .map((r) => r.inbox_items)
      .filter((item) => item && item.user_id === userId && item.status === 'open')

    // Silence is correct here (plan Section 2.2) — no open tagged items means
    // no nudge at all for this meeting, not an empty "nothing to report" DM.
    if (openItems.length === 0) continue

    results.push({
      eventId: meeting.eventId,
      memberId: meeting.teamMemberId,
      memberName: memberNameById.get(meeting.teamMemberId) ?? 'your team member',
      startTime: meeting.startTime,
      items: openItems.map((i) => ({ id: i.id, text: i.text })),
    })
  }

  return results
}

/**
 * Top-level entry point wired into the main tick loop. Handles opt-in gating
 * first, then — only once opted in — runs both nudge triggers and sends a
 * single combined Slack DM (the "digest cap") rather than one message per
 * trigger type.
 */
async function maybeNudgeInboxItems(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: AgentConfig,
  notifPrefs: NotificationPreferences,
): Promise<number> {
  const [dueResult, meetingResults] = await Promise.all([
    fetchDueNudgeCandidates(supabase, userId, config),
    fetchMeetingNudgeCandidates(supabase, userId, config),
  ])

  const hasAnythingToNudge = dueResult.toNudge.length > 0 || meetingResults.length > 0

  // Always record newly-capped items, opted in or not — capping is bookkeeping,
  // not a notification, so it doesn't need to wait on consent.
  for (const itemId of dueResult.newlyCappedIds) {
    await supabase.from('cos_agent_log').insert({
      user_id: userId,
      event_type: 'inbox_due_nudge_capped',
      item_id: itemId,
      payload: { reason: 'max_nudges_reached', nudge_count: config.nudge_max_count },
    })
  }

  if (!hasAnythingToNudge) return 0

  const optInState = await loadOptInState(supabase, userId, config)
  const action = decideOptInAction(optInState, new Date(), OPTIN_COOLDOWN_DAYS)

  if (action === 'suppress') return 0

  if (action === 'show_optin_prompt') {
    await createOptInPrompt(supabase, userId)
    return 0
  }

  // action === 'send_nudge' — user has opted in; build and send the digest.
  const blocks: unknown[] = []
  let nudgedCount = 0

  for (const meeting of meetingResults) {
    const dayLabel = meetingDayLabel(meeting.startTime, config.timezone)
    let meetingTime = meeting.startTime
    try {
      meetingTime = new Date(meeting.startTime).toLocaleTimeString('en-US', {
        timeZone: config.timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch { /* use raw if timezone fails */ }

    const rationale = buildMeetingNudgeRationale(meeting.memberName, dayLabel, meetingTime, meeting.items.length)

    const { data: insertedNudge } = await supabase
      .from('inbox_items')
      .insert({
        user_id: userId,
        type: 'agent_nudge',
        text: `${meeting.items.length} open item${meeting.items.length === 1 ? '' : 's'} tagged to ${meeting.memberName} — 1:1 ${dayLabel} at ${meetingTime}`,
        status: 'open',
        agent_payload: {
          source: 'agent_nudge_before_1on1',
          rationale,
          action_required: false,
        },
      })
      .select('id')
      .single()

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:zap: *1:1 with ${meeting.memberName} ${dayLabel} at ${meetingTime}*\n${meeting.items.map((i) => `• ${i.text}`).join('\n')}`,
      },
      // This digest summarizes multiple tagged items with no single "the
      // item" to mark done or snooze a due date on — so unlike the due-date
      // block below, the only overflow action offered is dismissing the
      // notification itself (inbox_mark_done against the agent_nudge row).
      // Acting on the individual tagged items still happens in-app.
      accessory: insertedNudge ? {
        type: 'overflow',
        action_id: `action_overflow:${(insertedNudge as { id: string }).id}`,
        options: [
          { text: { type: 'plain_text', text: ':white_check_mark: Dismiss' }, value: `inbox_mark_done:${(insertedNudge as { id: string }).id}` },
        ],
      } : undefined,
    })

    await supabase.from('cos_agent_log').insert({
      user_id: userId,
      event_type: 'inbox_nudge_sent',
      event_id: meeting.eventId,
      member_id: meeting.memberId,
      item_id: (insertedNudge as { id: string } | null)?.id ?? null,
      payload: { item_count: meeting.items.length, member_name: meeting.memberName },
    })

    nudgedCount++
  }

  if (dueResult.toNudge.length > 0) {
    for (const dueItem of dueResult.toNudge) {
      await supabase.from('inbox_items').insert({
        user_id: userId,
        type: 'agent_nudge',
        text: `${dueItem.text} — due date approaching`,
        status: 'open',
        agent_payload: {
          source: 'agent_nudge_due_date',
          rationale: buildDueDateNudgeRationale(),
          action_required: false,
        },
      })

      // Both overflow actions target the original item (dueItem.id), not the
      // agent_nudge notification row — unlike the pre-1:1 digest above,
      // there's exactly one real underlying item here, so "mark done" /
      // "snooze" should act on it directly rather than just dismissing the
      // notification.
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `:calendar: *Due date approaching*\n• ${dueItem.text}` },
        accessory: {
          type: 'overflow',
          action_id: `action_overflow:${dueItem.id}`,
          options: [
            { text: { type: 'plain_text', text: ':white_check_mark: Mark done' }, value: `inbox_mark_done:${dueItem.id}` },
            { text: { type: 'plain_text', text: ':clock3: Snooze 2 days' }, value: `inbox_due_snooze:${dueItem.id}:2` },
          ],
        },
      })

      await supabase.from('cos_agent_log').insert({
        user_id: userId,
        event_type: 'inbox_due_nudge_sent',
        item_id: dueItem.id,
        payload: { due_at: dueItem.priority_due_at },
      })

      nudgedCount++
    }
  }

  if (notifPrefs.inbox_item_nudges && blocks.length > 0) {
    const explainer = await maybeSendFirstDmExplainer(supabase, userId)
    const summaryParts: string[] = []
    if (meetingResults.length > 0) summaryParts.push('1:1 prep')
    if (dueResult.toNudge.length > 0) summaryParts.push('due-date items')
    const summaryText = `${summaryParts.join(' and ')} need your attention`

    const finalBlocks = explainer
      ? [{ type: 'section', text: { type: 'mrkdwn', text: explainer } }, { type: 'divider' }, ...blocks]
      : blocks

    await sendSlackDM(supabase, userId, summaryText, finalBlocks)
  }

  return nudgedCount
}

// ── Consolidated daily to-do digest ─────────────────────────────────────────
//
// One Slack DM per day, at most, unioning: overdue/aged meeting action items
// (previously their own separate "Action Items Need Attention" message),
// Do Now items, the informal due-now priority tier, items still needing the
// user's own input, and items where the user is the one blocking someone
// else. This is deliberately a *different* feature from
// maybeNudgeInboxItems() above (pre-1:1 tagged items + fixed-due-date items,
// its own opt-in) — that one is untouched; this digest only absorbs the
// action-item nudge that used to fire on its own.

/** Adds an overflow-menu section for a simple candidate list, reusing the
 *  existing inbox_mark_done / inbox_due_snooze Slack actions. `withSnooze`
 *  only makes sense for items that carry a real-ish due date (the due-now
 *  tier); Do Now / needs-input / blocking-others just offer Mark done. */
function buildInboxSectionBlocks(
  items: Array<{ id: string; text: string }>,
  withSnooze: boolean,
): unknown[] {
  return items.map((item) => ({
    type: 'section',
    text: { type: 'mrkdwn', text: `• ${item.text}` },
    accessory: {
      type: 'overflow',
      action_id: `action_overflow:${item.id}`,
      options: [
        { text: { type: 'plain_text', text: ':white_check_mark: Mark done' }, value: `inbox_mark_done:${item.id}` },
        ...(withSnooze
          ? [{ text: { type: 'plain_text', text: ':clock3: Snooze 2 days' }, value: `inbox_due_snooze:${item.id}:2` }]
          : []),
      ],
    },
  }))
}

async function sendDailyDigest(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: AgentConfig,
  notifPrefs: NotificationPreferences,
): Promise<{ actionsNudged: number; extrasNudged: number }> {
  const todayDate = new Date().toISOString().slice(0, 10)

  // Once-daily gate: if today's digest already went out, do nothing — even
  // re-running the candidate queries is pointless until tomorrow.
  const { count: alreadySentToday } = await supabase
    .from('cos_agent_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'daily_digest_sent')
    .gte('created_at', todayDate + 'T00:00:00Z')

  if ((alreadySentToday ?? 0) > 0) return { actionsNudged: 0, extrasNudged: 0 }

  const [actionResult, doNowItems, dueNowItems, needsInputItems, blockingOthersItems] = await Promise.all([
    config.nudge_actions
      ? fetchActionItemNudgeCandidates(supabase, userId, config)
      : Promise.resolve({ byMember: {}, toNudge: [] as ActionItemCandidate[] }),
    fetchDoNowItems(supabase, userId),
    fetchDueNowTierItems(supabase, userId),
    fetchNeedsInputItems(supabase, userId),
    fetchBlockingOthersItems(supabase, userId),
  ])

  const blocks: unknown[] = []
  let extrasNudged = 0
  const actionSectionIncluded = notifPrefs.overdue_action_nudges && actionResult.toNudge.length > 0

  if (actionSectionIncluded) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:bell: *Action items* — ${actionResult.toNudge.length} approaching or past their due date`,
      },
    })
    blocks.push(...buildActionItemBlocks(actionResult.byMember))
  }

  if (notifPrefs.inbox_item_nudges && doNowItems.length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ':red_circle: *Do Now*' } })
    blocks.push(...buildInboxSectionBlocks(doNowItems, false))
    extrasNudged += doNowItems.length
  }

  if (notifPrefs.inbox_item_nudges && dueNowItems.length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ':calendar: *Due now*' } })
    blocks.push(...buildInboxSectionBlocks(dueNowItems, true))
    extrasNudged += dueNowItems.length
  }

  if (notifPrefs.inbox_item_nudges && needsInputItems.length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ':inbox_tray: *Needs your input*' } })
    blocks.push(...buildInboxSectionBlocks(needsInputItems, false))
    extrasNudged += needsInputItems.length
  }

  if (notifPrefs.inbox_item_nudges && blockingOthersItems.length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ":hourglass_flowing_sand: *You're blocking these*" } })
    blocks.push(...buildInboxSectionBlocks(blockingOthersItems, false))
    extrasNudged += blockingOthersItems.length
  }

  // Nothing to say today — leave the once-daily gate unmarked so a later
  // tick (once something becomes due/Do Now/etc) can still send today.
  if (blocks.length === 0) return { actionsNudged: 0, extrasNudged: 0 }

  const actionsNudgedCount = actionSectionIncluded ? actionResult.toNudge.length : 0
  const totalCount = actionsNudgedCount + extrasNudged
  const headerBlocks: unknown[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `:clipboard: *Your to-do list* — ${totalCount} item${totalCount === 1 ? '' : 's'} need attention` },
    },
    { type: 'divider' },
  ]

  const footerBlocks: unknown[] = [
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: ':thumbsup: Helpful' }, action_id: 'feedback:nudge:helpful', style: 'primary' },
        { type: 'button', text: { type: 'plain_text', text: ':clock1: Too early' }, action_id: 'feedback:nudge:too_early' },
        { type: 'button', text: { type: 'plain_text', text: ':alarm_clock: Too late' }, action_id: 'feedback:nudge:too_late' },
        { type: 'button', text: { type: 'plain_text', text: ':thumbsdown: Not helpful' }, action_id: 'feedback:nudge:not_helpful' },
      ],
    },
  ]

  await sendSlackDM(supabase, userId, `You have ${totalCount} item(s) that need attention`, [
    ...headerBlocks,
    ...blocks,
    ...footerBlocks,
  ])

  if (actionSectionIncluded) {
    await logActionItemNudgesSent(supabase, userId, actionResult.toNudge)
  }
  // Error-checked (unlike most cos_agent_log inserts in this file): a failed
  // insert here means the once-daily gate above never sees this send, so the
  // digest would otherwise resend on every single tick (every 30 minutes)
  // instead of once a day — this exact silent-failure shape already happened
  // once for 'inbox_brief_staged' (see 20260729000001_fix_cos_agent_log_event_type_check_union.sql).
  const { error: digestLogError } = await supabase.from('cos_agent_log').insert({
    user_id: userId,
    event_type: 'daily_digest_sent',
    payload: {
      actions_nudged: actionsNudgedCount,
      do_now: doNowItems.length,
      due_now: dueNowItems.length,
      needs_input: needsInputItems.length,
      blocking_others: blockingOthersItems.length,
    },
  })
  if (digestLogError) {
    await logAgentEvent(supabase, userId, 'error', {
      handler: 'daily_digest_gate_log',
      error: digestLogError.message,
    })
  }

  return { actionsNudged: actionsNudgedCount, extrasNudged }
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
  notifPrefs: NotificationPreferences,
): Promise<void> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 3600 * 1000)
  const todayDate = now.toISOString().slice(0, 10)

  // Find meetings in the next 24 hours
  const { data: events } = await supabase
    .from('cos_one_on_one_events')
    .select('id, team_member_id, title, start_time, recurring_event_id, attendee_emails')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .not('team_member_id', 'is', null)
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())

  const { data: prepSchedule } = await supabase
    .from('cos_prep_schedule')
    .select('included_group_series')
    .eq('user_id', userId)
    .maybeSingle()

  const includedGroupSeries = (prepSchedule?.included_group_series as string[] | null) ?? []

  for (const event of (events ?? []) as Array<{
    id: string; team_member_id: string; title: string | null; start_time: string
    recurring_event_id: string | null; attendee_emails: string[] | null
  }>) {
    // Skip group meetings the user hasn't opted into daily prep for
    if (!meetingQualifiesForPrep(event.recurring_event_id, event.attendee_emails, includedGroupSeries)) continue

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
      if (notifPrefs.format_suggestions) {
        // Feedback row modeled on the daily digest's footer buttons — but
        // "too early"/"too late" (nudge-timing feedback) don't apply to a
        // one-off format recommendation, so "Wrong format" replaces them.
        // "Wrong format" only makes sense here, not on the generic
        // action-item digest, since it's feedback on this specific
        // recommendation rather than on nudge timing.
        await sendSlackDM(supabase, userId,
          `Meeting format suggestion for ${memberName}: ${format}`,
          [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${emoji} *Suggested format for ${memberName}:* ${format}\n\n${reasons.map(r => `• ${r}`).join('\n')}`,
              },
            },
            { type: 'divider' },
            {
              type: 'actions',
              elements: [
                { type: 'button', text: { type: 'plain_text', text: ':thumbsup: Helpful' }, action_id: 'feedback:format:helpful', style: 'primary' },
                { type: 'button', text: { type: 'plain_text', text: ':bar_chart: Wrong format' }, action_id: 'feedback:format:wrong_format' },
                { type: 'button', text: { type: 'plain_text', text: ':thumbsdown: Not helpful' }, action_id: 'feedback:format:not_helpful' },
              ],
            },
          ],
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
  notifPrefs: NotificationPreferences,
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

  // Ensure each 1:1 event has a dci_meeting_schedule row (insert-only; never
  // overwrite an existing row so transcript_checked state is preserved).
  // Group meetings (committees, team syncs) don't create cos_one_on_one_events,
  // so calEvents may be empty — that's fine; we still process their transcripts
  // below via the unprocessed-transcript path.
  for (const event of (calEvents ?? []) as Array<{
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

  // Group-meeting transcripts never appear in `pending` (no 1:1 calendar event),
  // so also check for any unprocessed transcripts. generate-meeting-suggestions
  // handles 1:1, recurring, and group meetings alike.
  const { count: unprocessedTranscripts } = await supabase
    .from('cos_zoom_transcripts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('suggestions_extracted_at', null)

  const pendingRows = (pending ?? []) as Array<{ id: string; title: string; zoom_meeting_id: string | null }>
  if (pendingRows.length === 0 && (unprocessedTranscripts ?? 0) === 0) return

  const pendingIds = pendingRows.map(r => r.id)

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
      body: JSON.stringify({ days: 3 }),
    })
    zoomSyncOk = res.ok
    if (!res.ok) console.warn(`post_meeting_check: zoom-recordings-sync returned ${res.status}`)
  } catch (err) {
    console.warn('post_meeting_check: zoom sync failed:', (err as Error).message)
  }

  // Step 1b: Fallback sync from Zoom's "Meeting assets ready" emails — catches
  // hosted meetings zoom-recordings-sync's API calls miss (e.g. cloud recording
  // disabled but an AI Companion summary still got emailed to the host).
  // Not fatal: users who haven't reconnected Google since gmail.readonly was
  // added, or who never connected Google at all, just get a warning here.
  let gmailSyncOk = false
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/gmail-meeting-assets-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'x-supabase-user-id': userId,
      },
      body: JSON.stringify({ days: 1 }),
    })
    gmailSyncOk = res.ok
    if (!res.ok) console.warn(`post_meeting_check: gmail-meeting-assets-sync returned ${res.status}`)
  } catch (err) {
    console.warn('post_meeting_check: gmail meeting-assets sync failed:', (err as Error).message)
  }

  // Step 2: Extract action item suggestions from any new transcripts.
  let suggestionsAdded = 0
  if (zoomSyncOk || gmailSyncOk) {
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

  // Step 3: Extract standout quotes and surface meeting_insight rows in the
  // inbox. Independent try/catch from Step 2 — a Gemini outage or malformed
  // response here must never block action-item suggestions or vice versa
  // (PLAN_idea3_meeting_insights.md §6.5). Gated behind enable_meeting_insights
  // (rollout flag, §7 Step 6) so this can be enabled per-user.
  let meetingInsightsAdded = 0
  if (zoomSyncOk && config.enable_meeting_insights) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/extract-zoom-quotes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'x-supabase-user-id': userId,
        },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json() as { insights_added?: number }
        meetingInsightsAdded = data.insights_added ?? 0
      } else {
        console.warn(`post_meeting_check: extract-zoom-quotes returned ${res.status}`)
      }
    } catch (err) {
      console.warn('post_meeting_check: meeting insight extraction failed:', (err as Error).message)
    }
  }

  // Only mark meetings whose Zoom transcript has actually arrived. Meetings
  // still awaiting a transcript stay pending and are retried on later ticks
  // until their transcript lands or they age out of the 24 h window — this is
  // what prevents slow Zoom transcripts from being permanently skipped.
  const pendingZoomIds = [...new Set(
    pendingRows
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

  const doneIds = pendingRows
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

  // Meeting insights are silent for v1 (PLAN_idea3_meeting_insights.md §9.4.1)
  // — no Slack ping, just surfaced in-app and tracked via cos_agent_log below
  // for the manual dismiss-rate monitoring described in plan §7 Step 6.

  // Notify via Slack if action items were surfaced (suppressed during quiet hours).
  if (suggestionsAdded > 0 && notifPrefs.meeting_followups && !suppressNotify) {
    const label = pendingRows[0]?.title ?? 'your recent meeting'
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
    meeting_insights_added: meetingInsightsAdded,
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
