import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { verifySlackSignature } from "../_shared/slack.ts"

/**
 * Slack interactive action handler.
 *
 * Receives payloads from Slack when a user clicks a button on an agent message.
 * Registered as the Slack Interactivity Request URL. Public endpoint
 * (verify_jwt = false) — Slack authenticates via the request signature
 * (X-Slack-Signature / X-Slack-Request-Timestamp), verified below using
 * SLACK_SIGNING_SECRET before anything in the payload is trusted. This was
 * previously MISSING on this endpoint (see PLAN_idea5_slack_surface.md §0/§4
 * risk #1) — any client could forge a block_actions payload with an arbitrary
 * slack_user_id and mutate that user's data. Do not remove this check.
 *
 * Supported actions:
 * - mark_done:<action_id>       — mark a cos_meeting_actions item as done
 * - snooze:<action_id>:<days>   — push due_date forward by N days
 * - dismiss_escalation:<log_id> — suppress escalation for 30 days
 * - feedback:<log_id>:<type>    — record feedback on an agent action
 * - inbox_done:<item_id>            — mark an inbox_items row done
 * - inbox_snooze:<item_id>:<hours>  — snooze an inbox_items row for N hours
 * - inbox_delegate:<item_id>        — kick off an inbox_delegations run (fire-and-forget)
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
    if (!rawPayload) {
      return new Response('Missing payload', { status: 400 })
    }

    const payload = JSON.parse(rawPayload) as {
      type: string
      user: { id: string }
      team?: { id: string }
      actions?: Array<{ action_id: string; value?: string }>
      trigger_id?: string
    }

    if (payload.type !== 'block_actions' || !payload.actions?.length) {
      // Acknowledge but do nothing for unsupported payload types
      return new Response('', { status: 200 })
    }

    const slackUserId = payload.user.id
    const slackTeamId = payload.team?.id ?? null

    // Resolve Slack user to Supabase user. Scope by slack_team_id too (when
    // present) so a slack_user_id can't resolve to the wrong account if two
    // different Slack workspaces both connect to this app (PLAN §4 risk #3).
    let credsQuery = supabase
      .from('user_slack_credentials')
      .select('user_id')
      .eq('slack_user_id', slackUserId)
    if (slackTeamId) {
      credsQuery = credsQuery.eq('slack_team_id', slackTeamId)
    }
    const { data: creds } = await credsQuery.maybeSingle()

    if (!creds?.user_id) {
      return jsonResponse({ text: 'Could not identify your account.' })
    }

    const userId = creds.user_id

    for (const action of payload.actions) {
      const actionId = action.action_id
      const value = action.value ?? ''

      // Overflow menus send the selected option's value, not the action_id
      const effectiveId = actionId.startsWith('action_overflow:')
        ? value
        : actionId

      // ── Mark done (cos_meeting_actions) ──────────────────────────────
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

      // ── Snooze (cos_meeting_actions) ─────────────────────────────────
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

      // ── Inbox: mark done ──────────────────────────────────────────
      if (effectiveId.startsWith('inbox_done:')) {
        const itemId = effectiveId.replace('inbox_done:', '')

        const { data: updated } = await supabase
          .from('inbox_items')
          .update({ status: 'done', done_at: new Date().toISOString() })
          .eq('id', itemId)
          .eq('user_id', userId)
          .select('id')
          .maybeSingle()

        if (!updated) {
          return jsonResponse({
            response_type: 'ephemeral',
            replace_original: false,
            text: "Couldn't find that item in your inbox.",
          })
        }

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: ':white_check_mark: Marked as done in your TacticalSync inbox.',
        })
      }

      // ── Inbox: snooze ─────────────────────────────────────────────
      if (effectiveId.startsWith('inbox_snooze:')) {
        const parts = effectiveId.split(':')
        const itemId = parts[1]
        const hours = parseInt(parts[2] ?? '4', 10)
        const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 4

        const snoozedUntil = new Date(Date.now() + safeHours * 3_600_000).toISOString()

        const { data: updated } = await supabase
          .from('inbox_items')
          .update({ status: 'snoozed', snoozed_until: snoozedUntil })
          .eq('id', itemId)
          .eq('user_id', userId)
          .select('id')
          .maybeSingle()

        if (!updated) {
          return jsonResponse({
            response_type: 'ephemeral',
            replace_original: false,
            text: "Couldn't find that item in your inbox.",
          })
        }

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: `:clock3: Snoozed until ${new Date(snoozedUntil).toLocaleString()}.`,
        })
      }

      // ── Inbox: delegate ───────────────────────────────────────────
      if (effectiveId.startsWith('inbox_delegate:')) {
        const itemId = effectiveId.replace('inbox_delegate:', '')

        // Confirm the item exists and belongs to this user before firing the
        // delegation call, but don't await the delegation itself — it can run
        // multi-step LLM reasoning that would blow past Slack's 3-second ack
        // window (PLAN §4 risk #6).
        const { data: item } = await supabase
          .from('inbox_items')
          .select('id')
          .eq('id', itemId)
          .eq('user_id', userId)
          .maybeSingle()

        if (!item) {
          return jsonResponse({
            response_type: 'ephemeral',
            replace_original: false,
            text: "Couldn't find that item in your inbox.",
          })
        }

        // Fire-and-forget: don't block the Slack ack on this.
        fetch(`${supabaseUrl}/functions/v1/delegate-inbox-task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ action: 'start', item_id: itemId, user_id: userId }),
        }).catch((err) => {
          console.error('inbox_delegate: failed to start delegation', err)
        })

        return jsonResponse({
          response_type: 'ephemeral',
          replace_original: false,
          text: ':rocket: Delegated — check the app for the plan once it\'s ready.',
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
