import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0"

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

interface TeamMember {
  id: string
  name: string
  email: string | null
}

interface ParsedAction {
  action: 'send_slack_message' | 'clarify' | 'unknown'
  target_name?: string
  target_email?: string
  message?: string
  question?: string
  reply?: string
}

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
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    if (!anthropicApiKey) {
      return jsonResponse({ error: 'anthropic_api_key_not_configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'missing_authorization' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return jsonResponse({ error: 'invalid_token' }, 401)
    }
    const userId = userData.user.id

    let body: {
      mode?: 'draft' | 'send'
      command?: string
      item_text?: string
      item_notes?: string
      // legacy field names from old frontend
      priority_text?: string
      priority_notes?: string
      // send mode
      target_name?: string
      target_email?: string
      message?: string
    }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body' }, 400)
    }

    const mode = body.mode ?? 'draft'

    // ── SEND MODE: skip AI, just deliver the approved message ──────────────
    if (mode === 'send') {
      const { target_name, target_email, message } = body
      if (!target_email || !message) {
        return jsonResponse({ error: 'target_email and message required for send mode' }, 400)
      }

      const slackRes = await supabase
        .from('user_slack_credentials')
        .select('access_token')
        .eq('user_id', userId)
        .maybeSingle()

      const slackToken: string | null = (slackRes.data as { access_token: string } | null)?.access_token ?? null
      if (!slackToken) {
        return jsonResponse({ reply: 'Slack is not connected. Please connect it in Settings first.' }, 200)
      }

      const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(target_email)}`, {
        headers: { 'Authorization': `Bearer ${slackToken}` },
      })
      const lookupData = await lookupRes.json() as { ok: boolean; user?: { id: string } }

      if (!lookupData.ok || !lookupData.user?.id) {
        return jsonResponse({
          reply: `I couldn't find ${target_name ?? target_email} on Slack. Make sure their email matches their Slack account.`,
        }, 200)
      }

      const openRes = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${slackToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: lookupData.user.id }),
      })
      const openData = await openRes.json() as { ok: boolean; error?: string; channel?: { id: string } }

      if (!openData.ok || !openData.channel?.id) {
        return jsonResponse({ reply: `Couldn't open a DM with ${target_name} on Slack. (Slack error: ${openData.error ?? 'unknown'})` }, 200)
      }

      const sendRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${slackToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: openData.channel.id, text: message }),
      })
      const sendData = await sendRes.json() as { ok: boolean; error?: string }

      if (sendData.ok) {
        return jsonResponse({ reply: `Sent to ${target_name}.` }, 200)
      } else {
        return jsonResponse({ reply: `Couldn't send the message to ${target_name} on Slack. (Slack error: ${sendData.error ?? 'unknown'})` }, 200)
      }
    }

    // ── DRAFT MODE: use AI to parse intent and draft the message ───────────
    const { command } = body
    const item_text = body.item_text ?? body.priority_text ?? ''
    const item_notes = body.item_notes ?? body.priority_notes
    if (!command?.trim()) {
      return jsonResponse({ error: 'command_required' }, 400)
    }

    const [teamRes, slackRes, profileRes] = await Promise.all([
      supabase.from('cos_team_members').select('id, name, email').eq('user_id', userId).order('name'),
      supabase.from('user_slack_credentials').select('access_token').eq('user_id', userId).maybeSingle(),
      supabase.from('profiles').select('first_name, full_name').eq('id', userId).maybeSingle(),
    ])

    const members = (teamRes.data ?? []) as TeamMember[]
    const hasSlack = !!(slackRes.data as { access_token: string } | null)?.access_token
    const profileData = profileRes.data as { first_name?: string; full_name?: string } | null
    const senderName = profileData?.first_name ?? profileData?.full_name?.split(' ')[0] ?? 'your manager'

    const membersList = members.length > 0
      ? members.map(m => `- ${m.name}${m.email ? ` (${m.email})` : ' (no email)'}`).join('\n')
      : '(no team members configured)'

    const itemContext = `Item: "${item_text}"${item_notes ? `\nNotes: ${item_notes}` : ''}`

    const systemPrompt = `You are an AI assistant embedded in a team management tool. The user (${senderName}) manages a team and wants to take action on an item from their list.

Team members:
${membersList}

Slack connected: ${hasSlack}

Supported actions:
- send_slack_message: Draft a Slack DM to a team member on behalf of ${senderName}
- clarify: Ask the user a clarifying question (when intent or target is ambiguous)
- unknown: When the request cannot be fulfilled

Respond ONLY with valid JSON. No prose, no explanation.

For drafting a message:
{"action":"send_slack_message","target_name":"<exact name from list>","target_email":"<email from list>","message":"<the message to send>"}

For clarifying:
{"action":"clarify","question":"<one concise question>"}

For unknown:
{"action":"unknown","reply":"<brief explanation of what you cannot do>"}`

    const userPrompt = `${itemContext}

User command: "${command}"

Draft a short, direct Slack message sent by the TacticalSync bot on behalf of ${senderName}. Rules:
- Open with "${senderName} asked me to reach out."
- State what needs to happen directly and specifically, informed by the item above
- No hedging, no offering of times, no "let me know what works" — just tell them what to do
- 2–3 sentences max`

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })
    const aiResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : ''

    let parsed: ParsedAction
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: 'unknown', reply: rawText }
    } catch {
      parsed = { action: 'unknown', reply: 'I had trouble interpreting that request.' }
    }

    if (parsed.action === 'send_slack_message') {
      if (!hasSlack) {
        return jsonResponse({ reply: 'Slack is not connected. Please connect it in Settings first.' }, 200)
      }
      if (!parsed.target_email) {
        return jsonResponse({
          reply: `I couldn't find ${parsed.target_name ?? 'that person'}'s email. Add their email in Team Members settings.`,
        }, 200)
      }
      // Return draft for user approval — don't send yet
      return jsonResponse({
        draft: true,
        message: parsed.message,
        target_name: parsed.target_name,
        target_email: parsed.target_email,
      }, 200)
    }

    if (parsed.action === 'clarify') {
      return jsonResponse({ reply: parsed.question ?? 'Can you clarify what you need?' }, 200)
    }

    return jsonResponse({ reply: parsed.reply ?? "I'm not sure how to handle that yet." }, 200)

  } catch (error) {
    console.error('agent-command error:', error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
