// Tool: post_slack_update
//
// Reuses the outbound chat.postMessage pattern already proven in
// agent-command/index.ts — this does NOT depend on idea #5's Slack surface
// work (that's inbound webhooks); outbound posting already works today.

import type { Tool, ToolContext, ToolExecutionResult } from './types.ts'

interface PostSlackUpdateParams {
  message: string
  channel?: string
  dm_user_email?: string
}

function isParams(v: Record<string, unknown>): v is PostSlackUpdateParams & Record<string, unknown> {
  return typeof v.message === 'string' && (typeof v.channel === 'string' || typeof v.dm_user_email === 'string')
}

export const postSlackUpdateTool: Tool = {
  name: 'post_slack_update',

  validateParams(params) {
    if (typeof params.message !== 'string' || !params.message.trim()) return 'message cannot be empty.'
    if (params.message.length > 3000) return 'message is too long (max 3000 characters).'
    const hasChannel = typeof params.channel === 'string' && params.channel.trim().length > 0
    const hasDm = typeof params.dm_user_email === 'string' && params.dm_user_email.trim().length > 0
    if (hasChannel === hasDm) return 'exactly one of channel or dm_user_email must be provided.'
    return null
  },

  describe(params) {
    const p = params as unknown as PostSlackUpdateParams
    const preview = p.message.length > 140 ? `${p.message.slice(0, 140)}…` : p.message
    const target = p.channel ? `#${p.channel.replace(/^#/, '')}` : p.dm_user_email
    return `Post to ${target}: "${preview}"`
  },

  async execute(ctx: ToolContext, params): Promise<ToolExecutionResult> {
    const db = ctx.db as any
    if (!isParams(params)) throw new Error('Invalid params.')

    const { data: cred } = await db
      .from('user_slack_credentials')
      .select('access_token')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    const slackToken = (cred as { access_token: string } | null)?.access_token
    if (!slackToken) {
      throw new Error('Slack is not connected. Connect it in Settings, then retry this step.')
    }

    let channelId: string
    if (params.channel) {
      channelId = params.channel.replace(/^#/, '')
    } else {
      const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(params.dm_user_email!)}`, {
        headers: { Authorization: `Bearer ${slackToken}` },
      })
      const lookupData = await lookupRes.json() as { ok: boolean; user?: { id: string }; error?: string }
      if (!lookupData.ok || !lookupData.user?.id) {
        throw new Error(`Couldn't find ${params.dm_user_email} on Slack (${lookupData.error ?? 'unknown error'}).`)
      }

      const openRes = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${slackToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: lookupData.user.id }),
      })
      const openData = await openRes.json() as { ok: boolean; channel?: { id: string }; error?: string }
      if (!openData.ok || !openData.channel?.id) {
        throw new Error(`Couldn't open a DM with ${params.dm_user_email} (${openData.error ?? 'unknown error'}).`)
      }
      channelId = openData.channel.id
    }

    const sendRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${slackToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelId, text: params.message }),
    })
    const sendData = await sendRes.json() as { ok: boolean; ts?: string; error?: string }
    if (!sendData.ok) {
      throw new Error(`Slack rejected the message: ${sendData.error ?? 'unknown error'}.`)
    }

    return {
      result: { channel: channelId, ts: sendData.ts },
    }
  },
}
