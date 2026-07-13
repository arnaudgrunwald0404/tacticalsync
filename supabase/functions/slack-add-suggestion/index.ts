import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { verifySlackSignature } from "../_shared/slack.ts"
import { matchMemberByTitle, type MinimalMember } from "../_shared/matchEventToMember.ts"

/**
 * Slack slash-command handler — "add a suggestion from Slack".
 *
 * Registered as the Request URL for two distinct Slack slash commands:
 *   - `/add-to-my-lists` — generic capture, no person-targeting. Inserts a
 *     pending row into dci_suggested_tasks for the matching TacticalSync user.
 *   - `/add-to-1on1 @name topic` — targets a specific tracked colleague's 1:1
 *     prep brief. The text must start with an "@name" mention (e.g.
 *     `/add-to-1on1 @Dan follow up on pricing`), which is resolved against the
 *     requesting user's `cos_team_members` using the same name-matching rules
 *     the Zoom/Gmail meeting pipelines use (see `matchMemberByTitle` in
 *     `_shared/matchEventToMember.ts`). On a resolved match, the inserted row
 *     also gets `member_id` + `source_type = 'one_on_one'` set — the same
 *     convention `generate-meeting-suggestions` uses for 1:1-derived
 *     suggestions — so it surfaces attributed to that person (e.g. "From 1:1
 *     with Dan Pope") instead of as a generic item.
 *
 * Either way, the item then appears in the "Suggested from your meetings"
 * panel, where the user picks a destination list and accepts it into
 * cos_priorities.
 *
 * Slack sends an application/x-www-form-urlencoded body. We verify the request
 * signature (X-Slack-Signature / X-Slack-Request-Timestamp) using
 * SLACK_SIGNING_SECRET before trusting it, since this endpoint is public
 * (verify_jwt = false).
 */

function ephemeral(text: string): Response {
  return new Response(
    JSON.stringify({ response_type: 'ephemeral', text }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Remove a resolved member's name from the free text once, so whatever is left
// reads as the topic. Mirrors the same "full name, or first+last, or first
// name alone" shapes matchMemberByTitle used to find the mention in the first
// place — this is just cleanup for display, not new matching logic.
function stripMemberMention(text: string, memberName: string): string {
  const parts = memberName.trim().split(/\s+/).filter(Boolean)
  let result = text
  if (parts.length >= 2) {
    const fullRe = new RegExp(`\\b${escapeRegex(parts.join(' '))}\\b`, 'i')
    if (fullRe.test(result)) {
      result = result.replace(fullRe, '')
    } else {
      result = result.replace(new RegExp(`\\b${escapeRegex(parts[0])}\\b`, 'i'), '')
      result = result.replace(new RegExp(`\\b${escapeRegex(parts[parts.length - 1])}\\b`, 'i'), '')
    }
  } else if (parts.length === 1) {
    result = result.replace(new RegExp(`\\b${escapeRegex(parts[0])}\\b`, 'i'), '')
  }
  return result.replace(/\s+/g, ' ').trim()
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
    const command = params.get('command') ?? ''
    const rawText = params.get('text') ?? ''
    const isOneOnOne = command === '/add-to-1on1'

    if (!slackUserId) {
      return ephemeral('Could not read your Slack user — please try again.')
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

    if (isOneOnOne) {
      // `/add-to-1on1` requires a leading "@name" mention so we know whose 1:1
      // prep brief to route the topic into — unlike `/add-to-my-lists`, this
      // command promises person-specific routing, so we don't silently fall
      // back to a generic add when that mention is missing or unresolvable.
      const trimmedText = rawText.trim()
      if (!trimmedText.startsWith('@')) {
        return ephemeral(
          "Mention who it's for so I know whose 1:1 to add this to, e.g. `/add-to-1on1 @Dan follow up on pricing`.",
        )
      }

      const afterAt = trimmedText.slice(1).trim()
      if (!afterAt) {
        return ephemeral(
          'Add a name and a topic, e.g. `/add-to-1on1 @Dan follow up on pricing`.',
        )
      }

      const { data: membersRows } = await supabase
        .from('cos_team_members')
        .select('id, name, email, relationship_type')
        .eq('user_id', creds.user_id)
      const members = (membersRows ?? []) as MinimalMember[]

      const matchedMember = matchMemberByTitle(afterAt, members)
      if (!matchedMember) {
        const hint = afterAt.split(/\s+/)[0] ?? ''
        return ephemeral(
          `I couldn't match "${hint}" to one of your tracked 1:1s. Check the spelling, or add them from Settings → People, then try again.`,
        )
      }

      const topicText = stripMemberMention(afterAt, matchedMember.name)
      const items = topicText.split(';').map((s) => s.trim()).filter(Boolean)

      if (items.length === 0) {
        return ephemeral(
          `Add a topic after ${matchedMember.name}'s name, e.g. \`/add-to-1on1 @${matchedMember.name.split(' ')[0]} follow up on pricing\`.`,
        )
      }

      const { error: insertErr } = await supabase
        .from('dci_suggested_tasks')
        .insert(
          items.map((title) => ({
            user_id: creds.user_id,
            title,
            member_id: matchedMember.id,
            source: `1:1 with ${matchedMember.name}`,
            source_type: 'one_on_one',
            status: 'pending',
            raw_context: 'Added from Slack via /add-to-1on1',
          })),
        )

      if (insertErr) {
        console.error('slack-add-suggestion (1on1) insert failed:', insertErr)
        return ephemeral('Something went wrong saving that — please try again.')
      }

      const itemList = items.length === 1
        ? `*${items[0]}*`
        : items.map((t) => `• ${t}`).join('\n')
      return ephemeral(
        `:sparkles: Added ${items.length === 1 ? 'to' : `${items.length} items to`} ${matchedMember.name}'s 1:1 prep:\n${itemList}\nOpen <https://tacticalsync.com/check-ins|the TacticalSync app> to review it before your next 1:1.`,
      )
    }

    // Generic `/add-to-my-lists` path — no person-targeting, unchanged.
    const items = rawText.split(';').map((s) => s.trim()).filter(Boolean)

    if (items.length === 0) {
      return ephemeral(
        'Add something to your TacticalSync suggestions, e.g. `/add-to-my-lists follow up with Dan on pricing`.',
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
