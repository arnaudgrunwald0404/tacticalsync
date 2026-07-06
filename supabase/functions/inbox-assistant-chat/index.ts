/**
 * Conversational Inbox Assistant — v1
 *
 * Multi-turn, tool-using chat backing the Inbox "Assistant" panel. The client
 * owns and resends the full message history each call (stateless server, no
 * conversations table). The model decides which tools to call per question
 * rather than being handed a fixed bundle of context on every turn.
 */

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

const MAX_MESSAGES = 40
const MAX_TOOL_ROUNDS = 3

// ── Tool schemas ──────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_inbox_items',
    description: "Fetch the user's current open inbox items (tasks/notes/nudges), including their tags, workflow status, bucket, and priority due date. Use this to answer questions about what's outstanding, overdue, or waiting on someone. Pass project_tag_id or person_tag_id to scope to a specific project or person when one was mentioned.",
    input_schema: {
      type: 'object',
      properties: {
        project_tag_id: { type: 'string', description: 'UUID of a project tag to filter to, if the user mentioned a specific project (e.g. via #ProjectName).' },
        person_tag_id: { type: 'string', description: 'UUID of a person tag to filter to, if the user mentioned a specific person (e.g. via @Name).' },
      },
    },
  },
  {
    name: 'get_onboarding_status',
    description: "Check which initial TacticalSync setup steps this user has and hasn't completed yet: calendar connection, Zoom connection, whether a Rallying Cry/Defining Objective has been drafted, and whether any 1:1 meetings are scheduled. Use this before offering setup help so you only mention what's actually missing.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_daily_brief',
    description: "Generate today's daily brief (top priorities) and add it to the user's inbox. Use when the user asks to run/refresh their daily brief.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_weekly_priorities',
    description: "Generate this week's priorities and add them to the user's inbox. Use when the user asks to run/refresh their weekly priorities.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_one_on_one_prep',
    description: "Generate 1:1 meeting prep for a specific teammate. Requires the team member's id, resolved from an @mention.",
    input_schema: {
      type: 'object',
      properties: {
        team_member_id: { type: 'string', description: 'UUID of the team member (cos_team_members.id) to prep for.' },
      },
      required: ['team_member_id'],
    },
  },
]

// ── Tool implementations ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toolGetInboxItems(db: any, userId: string, input: { project_tag_id?: string; person_tag_id?: string }) {
  const tagId = input.project_tag_id ?? input.person_tag_id
  let itemIds: string[] = []
  let scopedToTag = false
  if (tagId) {
    scopedToTag = true
    const { data: linkRows } = await db.from('inbox_item_tags').select('item_id').eq('tag_id', tagId)
    itemIds = (linkRows ?? []).map((r: { item_id: string }) => r.item_id as string)
    if (itemIds.length === 0) return { items: [] as unknown[] }
  }

  let query = db.from('inbox_items')
    .select('id, text, type, bucket, workflow_status, priority_due_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(100)
  if (scopedToTag) query = query.in('id', itemIds)

  const { data: items } = await query
  const ids = (items ?? []).map((i: { id: string }) => i.id)

  let tagsByItem: Record<string, string[]> = {}
  if (ids.length > 0) {
    const { data: tagRows } = await db.from('inbox_item_tags')
      .select('item_id, inbox_tags(name)')
      .in('item_id', ids)
    tagsByItem = {}
    for (const row of tagRows ?? []) {
      const name = row.inbox_tags?.name
      if (!name) continue
      ;(tagsByItem[row.item_id] ??= []).push(name)
    }
  }

  const result: { items: unknown[]; projectContext?: string } = {
    items: (items ?? []).map((i: Record<string, unknown>) => ({
      text: i.text, type: i.type, bucket: i.bucket, workflow_status: i.workflow_status,
      priority_due_at: i.priority_due_at, created_at: i.created_at,
      tags: tagsByItem[i.id as string] ?? [],
    })),
  }

  if (input.project_tag_id) {
    const { data: tagRow } = await db.from('inbox_tags').select('settings').eq('id', input.project_tag_id).maybeSingle()
    const description = (tagRow?.settings as { description?: string } | null)?.description
    if (description) result.projectContext = description
  }

  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toolGetOnboardingStatus(db: any, userId: string) {
  const now = new Date().toISOString()
  const [calRes, zoomRes, cycleRes, oneOnOneRes] = await Promise.all([
    db.from('user_calendar_credentials_public').select('connected').maybeSingle(),
    db.from('cos_mcp_integrations').select('is_connected').eq('integration_key', 'zoom').maybeSingle(),
    // rc_cycles is company-wide/team-scoped, not per-user — multiple teams can
    // each have an active cycle, so take the most recent rather than assuming one.
    db.from('rc_cycles').select('id').eq('status', 'active').order('created_at', { ascending: false }).limit(1),
    db.from('cos_one_on_one_events').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('start_time', now).neq('status', 'cancelled'),
  ])
  const activeCycleId = cycleRes.data?.[0]?.id

  let hasRallyingCry = false
  let definingObjectiveCount = 0
  if (activeCycleId) {
    const { data: rc } = await db.from('rc_rallying_cries').select('id').eq('cycle_id', activeCycleId).maybeSingle()
    hasRallyingCry = !!rc?.id
    if (rc?.id) {
      const { count } = await db.from('rc_defining_objectives').select('id', { count: 'exact', head: true }).eq('rallying_cry_id', rc.id)
      definingObjectiveCount = count ?? 0
    }
  }

  return {
    calendarConnected: !!calRes.data?.connected,
    zoomConnected: !!zoomRes.data?.is_connected,
    hasRallyingCry,
    definingObjectiveCount,
    upcomingOneOnOneCount: oneOnOneRes.count ?? 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertBriefItem(db: any, userId: string, kind: 'daily' | 'weekly', priorities: string[], summaryText: string) {
  const sourceType = kind === 'weekly' ? 'dci_weekly_brief' : 'dci_brief'
  const date = new Date().toISOString().slice(0, 10)

  const payload = {
    rationale: kind === 'weekly' ? 'Generated via the assistant' : 'Generated via the assistant',
    brief_date: date,
    brief_priorities: priorities.map(text => ({ text, source: 'priorities', reasoning: 'Generated via inbox assistant', origin: 'brief' })),
    brief_kind: kind,
  }

  const { data: existing } = await db.from('inbox_items')
    .select('id')
    .eq('user_id', userId).eq('type', 'brief_item')
    .contains('source_ref', { type: sourceType, id: date })
    .maybeSingle()

  if (existing) {
    await db.from('inbox_items').update({ agent_payload: payload, updated_at: new Date().toISOString() }).eq('id', existing.id)
  } else {
    await db.from('inbox_items').insert({
      user_id: userId, type: 'brief_item', text: summaryText, status: 'open', bucket: 'now',
      agent_payload: payload, source_ref: { type: sourceType, id: date },
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runDciBrief(db: any, userId: string, supabaseUrl: string, serviceRoleKey: string, kind: 'daily' | 'weekly') {
  const res = await fetch(`${supabaseUrl}/functions/v1/generate-dci-brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ _batch_user_id: userId }),
  })
  if (!res.ok) return { mutated: false, error: 'brief_generation_failed' }

  const today = new Date().toISOString().slice(0, 10)
  const { data: log } = await db.from('cos_dci_logs').select('*').eq('user_id', userId).eq('date', today).maybeSingle()

  const priorities = kind === 'weekly'
    ? [log?.weekly_obj_1, log?.weekly_obj_2, log?.weekly_obj_3].filter(Boolean)
    : [log?.priority_1, log?.priority_2, log?.priority_3].filter(Boolean)

  if (priorities.length === 0) return { mutated: false, error: 'no_priorities_generated' }

  const summaryText = kind === 'weekly'
    ? `Weekly priorities: ${priorities.join('; ')}`
    : `Daily brief: ${priorities.join('; ')}`

  await upsertBriefItem(db, userId, kind, priorities, summaryText)
  return { mutated: true, priorities }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runOneOnOnePrep(userId: string, supabaseUrl: string, serviceRoleKey: string, teamMemberId: string) {
  const res = await fetch(`${supabaseUrl}/functions/v1/generate-1on1-prep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ _batch_user_id: userId, team_member_id: teamMemberId }),
  })
  if (!res.ok) return { generated: false, error: 'prep_generation_failed' }
  const data = await res.json().catch(() => ({}))
  return { generated: true, ...data }
}

// ── Structured "proposed items" extraction ────────────────────────────────────

function extractProposedItems(text: string): { reply: string; proposedItems?: { text: string }[] } {
  const match = text.match(/```json\s*([\s\S]*?)```\s*$/)
  if (!match) return { reply: text.trim() }
  try {
    const parsed = JSON.parse(match[1])
    const items = Array.isArray(parsed?.proposedItems)
      ? parsed.proposedItems.filter((i: unknown): i is { text: string } => !!i && typeof (i as { text?: unknown }).text === 'string')
      : undefined
    const reply = text.slice(0, match.index).trim()
    return items && items.length > 0 ? { reply, proposedItems: items } : { reply: text.trim() }
  } catch {
    return { reply: text.trim() }
  }
}

const SYSTEM_PROMPT = `You are the TacticalSync inbox assistant. You help the user manage their inbox, get set up, and stay on top of their team.

RULES:
- Answer only using data returned by your tools. Never fabricate items, statuses, or setup state.
- Before offering setup help, call get_onboarding_status and only discuss whichever steps are NOT yet done (calendar connection, Zoom connection, Rallying Cry, Defining Objectives). Don't mention steps that are already complete.
- If calendar and/or Zoom aren't connected, do NOT tell the user to go to Settings or Integrations — the app already renders "Connect Calendar"/"Connect Zoom" buttons directly under your reply whenever those are missing, so just say something like "I've added a button below to connect it" rather than giving navigation instructions.
- Never propose "schedule your 1:1s" as a manual to-do. Once the calendar is connected and synced, 1:1s appear on their own — if it's relevant, mention that instead of asking the user to schedule anything themselves.
- If the user's message includes a "[Mentioned: ...]" hint, use the id(s) it provides to scope get_inbox_items (project_tag_id / person_tag_id) or run_one_on_one_prep (team_member_id) — don't guess ids from names.
- When get_inbox_items returns a projectContext, treat it as the authoritative background for that project. If a project is mentioned but projectContext is empty, say so and suggest the user add a description via that project's settings.
- When you're proposing concrete next-step items the user could add to their inbox (e.g. after a setup conversation), end your reply with a fenced json block as the LAST thing in your message, shaped exactly like:
\`\`\`json
{"proposedItems":[{"text":"..."}]}
\`\`\`
Only include this block when you actually have concrete items to propose — omit it for plain answers.
- Be warm and concise. This is a conversation, not a report.`

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    if (!anthropicApiKey) return jsonResponse({ error: 'anthropic_api_key_not_configured' }, 500)

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)

    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: userData, error: userErr } = await db.auth.getUser(jwt)
    if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
    const userId = userData.user.id

    const body = await req.json() as {
      messages?: { role: 'user' | 'assistant'; content: string }[]
      mentions?: { id: string; name: string; type: 'project' | 'person'; memberId?: string }[]
    }

    const messages = body.messages ?? []
    if (messages.length === 0) return jsonResponse({ error: 'messages is required' }, 400)
    if (messages.length > MAX_MESSAGES) {
      return jsonResponse({ error: 'conversation_too_long', message: 'Let\'s start a fresh conversation.' }, 400)
    }

    // Build the Anthropic-shaped message list, appending a mention hint to the
    // newest turn only — the client's own stored history stays hint-free, so
    // this doesn't accumulate across turns.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anthropicMessages: any[] = messages.map(m => ({ role: m.role, content: m.content }))
    if (body.mentions?.length) {
      const hints = body.mentions.map(m => m.type === 'person'
        ? `[Mentioned: @${m.name} (person, tag_id=${m.id}, team_member_id=${m.memberId ?? 'unknown'})]`
        : `[Mentioned: #${m.name} (project, id=${m.id})]`)
      const last = anthropicMessages[anthropicMessages.length - 1]
      if (last?.role === 'user') last.content = `${last.content}\n\n${hints.join(' ')}`
    }

    let mutated = false
    let finalText = ''
    let lastOnboardingStatus: { calendarConnected: boolean; zoomConnected: boolean } | null = null

    for (let round = 0; round < MAX_TOOL_ROUNDS + 1; round++) {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey })
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages: anthropicMessages,
      })

      const textBlocks = response.content.filter((b: { type: string }) => b.type === 'text') as { type: string; text: string }[]
      finalText = textBlocks.map(b => b.text).join('\n')

      if (response.stop_reason !== 'tool_use' || round === MAX_TOOL_ROUNDS) break

      const toolUseBlocks = response.content.filter((b: { type: string }) => b.type === 'tool_use') as
        { type: string; id: string; name: string; input: Record<string, unknown> }[]

      anthropicMessages.push({ role: 'assistant', content: response.content })

      const toolResults = await Promise.all(toolUseBlocks.map(async block => {
        let result: unknown
        try {
          switch (block.name) {
            case 'get_inbox_items':
              result = await toolGetInboxItems(db, userId, block.input as { project_tag_id?: string; person_tag_id?: string })
              break
            case 'get_onboarding_status':
              result = await toolGetOnboardingStatus(db, userId)
              lastOnboardingStatus = result as { calendarConnected: boolean; zoomConnected: boolean }
              break
            case 'run_daily_brief': {
              const r = await runDciBrief(db, userId, supabaseUrl, serviceRoleKey, 'daily')
              if (r.mutated) mutated = true
              result = r
              break
            }
            case 'run_weekly_priorities': {
              const r = await runDciBrief(db, userId, supabaseUrl, serviceRoleKey, 'weekly')
              if (r.mutated) mutated = true
              result = r
              break
            }
            case 'run_one_on_one_prep':
              result = await runOneOnOnePrep(userId, supabaseUrl, serviceRoleKey, (block.input as { team_member_id: string }).team_member_id)
              break
            default:
              result = { error: 'unknown_tool' }
          }
        } catch (err) {
          result = { error: (err as Error).message }
        }
        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
      }))

      anthropicMessages.push({ role: 'user', content: toolResults })
    }

    const { reply, proposedItems } = extractProposedItems(finalText)

    // Deterministic, not model-decided — same reasoning as the client-appended
    // "Delete onboarding project" item: don't rely on the model to reliably
    // request connect buttons, compute it directly from the tool result.
    const actions: ('connect_calendar' | 'connect_zoom')[] = []
    type OnboardingStatus = { calendarConnected: boolean; zoomConnected: boolean }
    const onboardingStatus = lastOnboardingStatus as OnboardingStatus | null
    if (onboardingStatus) {
      if (!onboardingStatus.calendarConnected) actions.push('connect_calendar')
      if (!onboardingStatus.zoomConnected) actions.push('connect_zoom')
    }

    return jsonResponse({ reply, proposedItems, mutated, actions: actions.length > 0 ? actions : undefined }, 200)

  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
