/**
 * Shared helper for sending a Slack DM to a user via their stored Slack
 * credentials. Used by agent-tick and rcdo-stale-check (and any future
 * function that needs to DM a user directly). Originally duplicated between
 * those two functions — see git history — because agent-tick's file was
 * 2000+ lines and touching its internals felt riskier than copying ~40
 * lines. Extracted here once both copies needed to stay in sync.
 *
 * Callers are responsible for any gating (quiet hours, per-notification-type
 * preferences, re-nudge throttling, etc.) — this helper only does delivery:
 * look up the user's Slack token, open a DM channel, and post the message.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { retryWithBackoff } from './retryWithBackoff.ts'

/**
 * Send a Slack DM to a user using their stored Slack credentials.
 * Returns true if the message was sent successfully.
 */
export async function sendSlackDM(
  supabase: SupabaseClient,
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
