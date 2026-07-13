import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { verifySlackSignature } from "../_shared/slack.ts"

/**
 * Slack interactive action handler.
 *
 * Receives payloads from Slack when a user clicks a button on an agent message.
 * Registered as the Slack Interactivity Request URL.
 *
 * Supported actions:
 * - mark_done:<action_id>       — mark a cos_meeting_actions item as done
 * - snooze:<action_id>:<days>   — push due_date forward by N days
 * - dismiss_escalation:<log_id> — suppress escalation for 30 days
 * - feedback:<log_id>:<type>    — record feedback on an agent action
 * - inbox_mark_done:<item_id>       — mark an inbox_items row as done
 *   (PLAN_idea4_agentic_followthrough.md — Idea #4). Prefixed separately
 *   from mark_done: even though UUIDs don't collide across tables, so the
 *   action_id is unambiguous in Slack payload logs.
 * - inbox_due_snooze:<item_id>:<days>   — push priority_due_at forward by N
 *   days for a fixed-due-date inbox item. Named distinctly from
 *   inbox_snooze (which sets status='snoozed' + snoozed_until on the item)
 *   since the two operate on entirely different fields for a different
 *   purpose — this pushes a hard due date, that suppresses the item
 *   temporarily without touching its due date.
 *
 * This endpoint is public (verify_jwt = false), so every request's Slack
 * signature (X-Slack-Signature / X-Slack-Request-Timestamp) is verified
 * against SLACK_SIGNING_SECRET before any action is processed — otherwise
 * anyone who discovers the URL could forge actions on behalf of any Slack
 * user whose id they can obtain.
 */
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const slackSigningSecret = Deno.env.get('SLACK_SIGNING_SECRET') ?? ''

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Read the raw body once — needed for both signature verification and
    // form-data parsing (parsing first would make the raw bytes unrecoverable).
    const rawBody = await req.text()

    const verified = await verifySlackSignature(
      slackSigningSecret,
      req.headers.get('X-Slack-Request-Timestamp'),
      req.headers.get('X-Slack-Signature'),
      rawBody,
    )
    if (!verified) {
      return new Response('Invalid signature', { status: 401 })
    }

    // Slack sends application/x-www-form-urlencoded with a "payload" field
    const formData = new URLSearchParams(rawBody)
    const rawPayload = formData.get('payload')
    if (!rawPayload || typeof rawPayload !== 'string') {
      return new Response('Missing payload', { status: 400 })
    }

    const payload = JSON.parse(rawPayload) as {
      type: string
      user: { id: string }
      actions?: Array<{ action_id: string; value?: string; selected_option?: { value?: string } }>
      trigger_id?: string
    }

    if (payload.type !== 'block_actions' || !payload.actions?.length) {
      // Acknowledge but do nothing for unsupported payload types
      return new Response('', { status: 200 })
    }

    const slackUserId = payload.user.id

    // Resolve Slack user to Supabase user
    const { data: creds } = await supabase
      .from('user_slack_credentials')
      .select('user_id')
      .eq('slack_user_id', slackUserId)
      .maybeSingle()

    if (!creds?.user_id) {
      return jsonResponse({ text: 'Could not identify your account.' })
    }

    const userId = creds.user_id

    for (const action of payload.actions) {
      const actionId = action.action_id
      // Overflow menus deliver the chosen option under `selected_option.value`
      // rather than a top-level `value` (that field only exists on plain
      // buttons), so both must be checked here.
      const value = action.value ?? action.selected_option?.value ?? ''

      // Overflow menus send the selected option's value, not the action_id
      const effectiveId = actionId.startsWith('action_overflow:')
        ? value
        : actionId

      // ── Mark done ─────────────────────────────────────────────────
      if (effectiveId.startsWith('mark_done:')) {
        const meetingActionId = effectiveId.replace('mark_done:', '')

        await supabase
          .from('cos_meeting_actions')
          .update({ status: 'done' })
          .eq('id', meetingActionId)
          .eq('user_id', userId)

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: ':white_check_mark: Marked as done.',
        })
      }

      // ── Snooze ────────────────────────────────────────────────────
      if (effectiveId.startsWith('snooze:')) {
        const parts = effectiveId.split(':')
        const meetingActionId = parts[1]
        const days = parseInt(parts[2] ?? '2', 10)

        const { data: existing } = await supabase
          .from('cos_meeting_actions')
          .select('due_date')
          .eq('id', meetingActionId)
          .eq('user_id', userId)
          .single()

        const baseDate = existing?.due_date
          ? new Date(existing.due_date + 'T00:00:00')
          : new Date()

        const newDate = new Date(baseDate.getTime() + days * 86_400_000)
        const newDateStr = newDate.toISOString().slice(0, 10)

        await supabase
          .from('cos_meeting_actions')
          .update({ due_date: newDateStr })
          .eq('id', meetingActionId)
          .eq('user_id', userId)

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: `:clock3: Snoozed to ${newDateStr}.`,
        })
      }

      // ── Inbox: mark done (Idea #4) ───────────────────────────────────
      if (effectiveId.startsWith('inbox_mark_done:')) {
        const itemId = effectiveId.replace('inbox_mark_done:', '')

        await supabase
          .from('inbox_items')
          .update({ status: 'done', done_at: new Date().toISOString() })
          .eq('id', itemId)
          .eq('user_id', userId)

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: ':white_check_mark: Marked as done.',
        })
      }

      // ── Inbox: push due date (Idea #4) ────────────────────────────────
      // Snoozing an inbox nudge pushes the underlying fixed due date forward
      // — unlike cos_meeting_actions' snooze (which sets a plain due_date),
      // this must keep priority_fixed = true so the item stays eligible for
      // future due-date nudges rather than reverting to a decaying tier.
      // Named inbox_due_snooze (not inbox_snooze) to avoid colliding with the
      // status='snoozed' action of the same name added for idea #5.
      if (effectiveId.startsWith('inbox_due_snooze:')) {
        const parts = effectiveId.split(':')
        const itemId = parts[1]
        const days = parseInt(parts[2] ?? '2', 10)

        const { data: existing } = await supabase
          .from('inbox_items')
          .select('priority_due_at')
          .eq('id', itemId)
          .eq('user_id', userId)
          .single()

        const baseDate = existing?.priority_due_at ? new Date(existing.priority_due_at) : new Date()
        const newDate = new Date(baseDate.getTime() + days * 86_400_000)

        await supabase
          .from('inbox_items')
          .update({ priority_due_at: newDate.toISOString(), priority_fixed: true })
          .eq('id', itemId)
          .eq('user_id', userId)

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: `:clock3: Snoozed to ${newDate.toISOString().slice(0, 10)}.`,
        })
      }

      // ── Dismiss escalation ────────────────────────────────────────
      if (effectiveId.startsWith('dismiss_escalation:')) {
        const logId = effectiveId.replace('dismiss_escalation:', '')

        // Get the original escalation payload to record what's being dismissed
        const { data: logEntry } = await supabase
          .from('cos_agent_log')
          .select('payload')
          .eq('id', logId)
          .eq('user_id', userId)
          .single()

        await supabase.from('cos_agent_log').insert({
          user_id: userId,
          event_type: 'escalation_dismissed',
          payload: logEntry?.payload ?? { log_id: logId },
        })

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: ':mute: Escalation dismissed for 30 days.',
        })
      }

      // ── Feedback ──────────────────────────────────────────────────
      if (effectiveId.startsWith('feedback:')) {
        const parts = effectiveId.split(':')
        const logId = parts[1]
        const feedbackType = parts[2] ?? 'helpful'

        await supabase.from('cos_agent_feedback').insert({
          user_id: userId,
          log_id: logId,
          feedback_type: feedbackType,
        })

        const labels: Record<string, string> = {
          helpful: ':thumbsup: Thanks for the feedback!',
          not_helpful: ':thumbsdown: Noted — will adjust.',
          too_early: ':clock1: Got it — will nudge later next time.',
          too_late: ':alarm_clock: Got it — will nudge earlier next time.',
          wrong_format: ':bar_chart: Noted — will recalibrate.',
        }

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: labels[feedbackType] ?? ':thumbsup: Feedback recorded.',
        })
      }
    }

    // Default: acknowledge
    return new Response('', { status: 200 })

  } catch (error) {
    console.error('Slack action handler error:', error)
    return new Response('Internal error', { status: 500 })
  }
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
