import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { verifySlackSignature } from "../_shared/slack.ts"

/**
 * Slack → TacticalSync inbox capture.
 *
 * Registered as the Events API Request URL (for the one-time `url_verification`
 * handshake) and, primarily, as the Interactivity Request URL for the
 * "Add to TacticalSync inbox" message shortcut. Per PLAN_idea5_slack_surface.md
 * §2a/§8, the message shortcut is the default/primary capture mechanism —
 * emoji-reaction capture (opt-in, §2a/§2b of the plan) is NOT implemented by
 * this file yet; it depends on a new `capture_via_reaction` column that hasn't
 * shipped, and is intentionally deferred to keep this function's blast radius
 * (a public, unauthenticated Slack webhook) small and reviewable on its own.
 *
 * Public endpoint (verify_jwt = false) — Slack authenticates via the request
 * signature (X-Slack-Signature / X-Slack-Request-Timestamp), verified below
 * using SLACK_SIGNING_SECRET before anything in the payload is trusted, same
 * pattern as agent-slack-action and slack-add-suggestion.
 */
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const slackSigningSecret = Deno.env.get('SLACK_SIGNING_SECRET') ?? ''

    // Read the raw body ONCE, before any parsing, so the signature is
    // computed over exactly the bytes Slack sent.
    const rawBody = await req.text()

    // The Events API url_verification handshake is a JSON POST that Slack
    // sends exactly once when the Request URL is first configured, and it
    // IS signed like any other event — verify it the same way as everything
    // else rather than special-casing it as unauthenticated.
    const verified = await verifySlackSignature(
      slackSigningSecret,
      req.headers.get('X-Slack-Request-Timestamp'),
      req.headers.get('X-Slack-Signature'),
      rawBody,
    )
    if (!verified) {
      return new Response('Invalid signature', { status: 401 })
    }

    const contentType = req.headers.get('content-type') ?? ''

    // ── Events API (JSON body): url_verification handshake ────────────
    if (contentType.includes('application/json')) {
      const body = JSON.parse(rawBody) as { type?: string; challenge?: string }
      if (body.type === 'url_verification' && body.challenge) {
        return new Response(JSON.stringify({ challenge: body.challenge }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // No other Events API event types are handled by this function yet
      // (reaction_added is deferred — see file header). Acknowledge so
      // Slack doesn't retry.
      return new Response('', { status: 200 })
    }

    // ── Interactivity payload (form-encoded): message shortcut ────────
    const formData = new URLSearchParams(rawBody)
    const rawPayload = formData.get('payload')
    if (!rawPayload) {
      return new Response('Missing payload', { status: 400 })
    }

    const payload = JSON.parse(rawPayload) as {
      type: string
      user: { id: string }
      team?: { id: string }
      trigger_id?: string
      callback_id?: string
      message?: {
        text?: string
        ts?: string
        permalink?: string
      }
      channel?: { id: string }
      response_url?: string
    }

    if (payload.type !== 'message_action' || payload.callback_id !== 'add_to_tacticalsync_inbox') {
      // Acknowledge but do nothing for unsupported shortcut/payload types.
      return new Response('', { status: 200 })
    }

    const slackUserId = payload.user.id
    const slackTeamId = payload.team?.id ?? null
    const channelId = payload.channel?.id ?? null
    const messageTs = payload.message?.ts ?? null
    const messageText = payload.message?.text ?? ''

    if (!channelId || !messageTs) {
      return new Response('', { status: 200 })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Resolve Slack user to a TacticalSync account, scoped by slack_team_id
    // when present (avoids cross-workspace user-id collisions — PLAN §4 risk #3).
    let credsQuery = supabase
      .from('user_slack_credentials')
      .select('user_id, access_token')
      .eq('slack_user_id', slackUserId)
    if (slackTeamId) {
      credsQuery = credsQuery.eq('slack_team_id', slackTeamId)
    }
    const { data: creds } = await credsQuery.maybeSingle()

    if (!creds?.user_id) {
      // Can't create an item for an unmapped user; no-op without erroring
      // back to Slack (an error here would just cause pointless retries).
      return new Response('', { status: 200 })
    }

    const userId = creds.user_id

    // Dedupe: re-running the shortcut on the same message shouldn't create a
    // second inbox item (PLAN §6 duplicate-capture test requirement).
    const { data: existing } = await supabase
      .from('inbox_items')
      .select('id')
      .eq('user_id', userId)
      .contains('source_ref', { type: 'slack_message', channel_id: channelId, message_ts: messageTs })
      .maybeSingle()

    if (existing) {
      await postEphemeral(payload.response_url, ':inbox_tray: Already in your TacticalSync inbox.')
      return new Response('', { status: 200 })
    }

    // Fetch a permalink for the source_ref using the reacting/invoking user's
    // own token (not a bot token), matching this app's user-token-based model.
    let permalink: string | null = null
    if (creds.access_token) {
      permalink = await fetchPermalink(creds.access_token, channelId, messageTs)
    }

    const truncatedText = messageText.length > 120
      ? messageText.slice(0, 117) + '...'
      : messageText

    const { error: insertErr } = await supabase.from('inbox_items').insert({
      user_id: userId,
      type: 'task',
      text: truncatedText || '(Slack message)',
      body: messageText || null,
      status: 'open',
      source_ref: {
        type: 'slack_message',
        channel_id: channelId,
        message_ts: messageTs,
        permalink,
        team_id: slackTeamId,
      },
    })

    if (insertErr) {
      console.error('slack-inbox-capture insert failed:', insertErr)
      await postEphemeral(payload.response_url, "Something went wrong adding that — please try again.")
      return new Response('', { status: 200 })
    }

    await postEphemeral(
      payload.response_url,
      ':inbox_tray: Added to your TacticalSync inbox.\n<https://tacticalsync.com/workspace|Open inbox>',
    )

    return new Response('', { status: 200 })
  } catch (error) {
    console.error('slack-inbox-capture error:', error)
    return new Response('Internal error', { status: 500 })
  }
})

/** Fetches a permalink for a message using the given user token. Best-effort. */
async function fetchPermalink(accessToken: string, channelId: string, messageTs: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://slack.com/api/chat.getPermalink?channel=${encodeURIComponent(channelId)}&message_ts=${encodeURIComponent(messageTs)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const data = await res.json() as { ok: boolean; permalink?: string }
    return data.ok && data.permalink ? data.permalink : null
  } catch (err) {
    console.error('slack-inbox-capture: fetchPermalink failed', err)
    return null
  }
}

/**
 * Posts an ephemeral confirmation via the payload's response_url, per Slack's
 * interactivity contract (https://api.slack.com/interactivity/handling#message_responses).
 * Best-effort: failures here must not affect the item that was already
 * inserted, so errors are swallowed after logging.
 */
async function postEphemeral(responseUrl: string | undefined, text: string): Promise<void> {
  if (!responseUrl) return
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response_type: 'ephemeral', text }),
    })
  } catch (err) {
    console.error('slack-inbox-capture: postEphemeral failed', err)
  }
}
