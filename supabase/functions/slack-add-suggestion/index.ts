import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

/**
 * Slack slash-command handler — "add a suggestion from Slack".
 *
 * Registered as the Request URL for a Slack slash command (e.g. /add-to-my-lists).
 * When a user types `/add-to-my-lists follow up with Dan on pricing`, this inserts
 * a pending row into dci_suggested_tasks for the matching TacticalSync user.
 * The item then appears in the "Suggested from your meetings" panel, where the
 * user picks a destination list and accepts it into cos_priorities.
 *
 * Slack sends an application/x-www-form-urlencoded body. We verify the request
 * signature (X-Slack-Signature / X-Slack-Request-Timestamp) using
 * SLACK_SIGNING_SECRET before trusting it, since this endpoint is public
 * (verify_jwt = false).
 */

const SLACK_SIGNATURE_VERSION = 'v0'
// Reject requests whose timestamp is more than 5 minutes off (replay defence).
const MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5

function ephemeral(text: string): Response {
  return new Response(
    JSON.stringify({ response_type: 'ephemeral', text }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

/** Constant-time-ish comparison of two hex signatures. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

async function verifySlackSignature(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signingSecret || !timestamp || !signature) return false

  const ts = parseInt(timestamp, 10)
  if (!Number.isFinite(ts)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SECONDS) return false

  const basestring = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(basestring))
  const hex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return safeEqual(`${SLACK_SIGNATURE_VERSION}=${hex}`, signature)
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const signingSecret = Deno.env.get('SLACK_SIGNING_SECRET') ?? ''

    // Read the raw body once — needed for both signature verification and parsing.
    const rawBody = await req.text()

    const verified = await verifySlackSignature(
      signingSecret,
      req.headers.get('X-Slack-Request-Timestamp'),
      req.headers.get('X-Slack-Signature'),
      rawBody,
    )
    if (!verified) {
      return new Response('Invalid signature', { status: 401 })
    }

    const params = new URLSearchParams(rawBody)
    const slackUserId = params.get('user_id') ?? ''
    const rawText = params.get('text') ?? ''
    const items = rawText.split(';').map((s) => s.trim()).filter(Boolean)

    if (!slackUserId) {
      return ephemeral('Could not read your Slack user — please try again.')
    }

    if (items.length === 0) {
      return ephemeral(
        'Add something to your TacticalSync suggestions, e.g. `/add-to-my-lists follow up with Dan on pricing`.',
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Resolve the Slack user to a TacticalSync account.
    const { data: creds } = await supabase
      .from('user_slack_credentials')
      .select('user_id')
      .eq('slack_user_id', slackUserId)
      .maybeSingle()

    if (!creds?.user_id) {
      return ephemeral(
        "I couldn't find a TacticalSync account linked to your Slack. Connect Slack from Settings → Slack first.",
      )
    }

    const { error: insertErr } = await supabase
      .from('dci_suggested_tasks')
      .insert(
        items.map((title) => ({
          user_id: creds.user_id,
          title,
          source: 'Slack',
          source_type: 'slack',
          status: 'pending',
          raw_context: `Added from Slack via /add-to-my-lists`,
        })),
      )

    if (insertErr) {
      console.error('slack-add-suggestion insert failed:', insertErr)
      return ephemeral('Something went wrong saving that — please try again.')
    }

    const itemList = items.length === 1
      ? `*${items[0]}*`
      : items.map((t) => `• ${t}`).join('\n')
    return ephemeral(
      `:sparkles: Added ${items.length === 1 ? 'to' : `${items.length} items to`} your TacticalSync suggestions:\n${itemList}\nOpen <https://tacticalsync.com/check-ins|the TacticalSync app> to route them to a list.`,
    )
  } catch (error) {
    console.error('slack-add-suggestion error:', error)
    return new Response('Internal error', { status: 500 })
  }
})
