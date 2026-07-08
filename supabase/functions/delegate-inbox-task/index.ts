/**
 * Delegation Skill — v2
 *
 * Orchestrates a sub-agent that works through:
 *   ramping_up → clarifying? → planning → seeking_approval (per-step) → getting_it_done → done
 *
 * v1 stopped at "seeking_approval" approving a *summary* of work that was
 * never actually taken (see git history for the old planPhase). v2 replaces
 * the free-text plan with a structured `plan_steps` array — each step names a
 * tool + params, is approved individually, and approving it actually runs
 * the tool. See PLAN_idea6_delegation_v2.md for the full design.
 *
 * Called in these modes:
 *   { action: 'start',        item_id, user_id }                 — kick off a new delegation
 *   { action: 'answer',       delegation_id, answer }             — provide answer to clarifying question
 *   { action: 'approve_step', delegation_id, step_id }             — approve + execute one step (requires auth)
 *   { action: 'reject_step',  delegation_id, step_id }             — reject one step (requires auth)
 *   { action: 'approve_all',  delegation_id }                      — approve + execute every proposed step (requires auth)
 *   { action: 'retry_step',   delegation_id, step_id }             — re-attempt a failed step (requires auth)
 *   { action: 'cancel',       delegation_id }                      — abort the whole delegation (requires auth)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { TOOL_REGISTRY, TOOL_NAMES, getTool } from './tools/index.ts'
import { resolveNextInstance } from './tools/createMeetingTopic.ts'
import { buildPlanSteps, buildMarkdownFromSteps, computeAggregateStatus, type PlanStep, type ToolName } from './planSteps.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Request validation ─────────────────────────────────────────────────────────
// Mirrors delegationRequestSchema in src/lib/inboxValidation.ts (kept in sync by
// hand because this runs under Deno and can't import from the app bundle).

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

type ParsedRequest =
  | { action: 'start'; item_id: string; user_id: string }
  | { action: 'answer'; delegation_id: string; answer: string }
  | { action: 'approve_step'; delegation_id: string; step_id: string }
  | { action: 'reject_step'; delegation_id: string; step_id: string }
  | { action: 'approve_all'; delegation_id: string }
  | { action: 'retry_step'; delegation_id: string; step_id: string }
  | { action: 'cancel'; delegation_id: string }

/** Returns the parsed request or an error message. Never throws. */
function parseRequest(body: unknown): { ok: true; value: ParsedRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Request body must be a JSON object.' }
  const b = body as Record<string, unknown>

  if (b.action === 'start') {
    if (!isUuid(b.item_id)) return { ok: false, error: 'item_id must be a UUID.' }
    if (!isUuid(b.user_id)) return { ok: false, error: 'user_id must be a UUID.' }
    return { ok: true, value: { action: 'start', item_id: b.item_id, user_id: b.user_id } }
  }

  if (b.action === 'answer') {
    if (!isUuid(b.delegation_id)) return { ok: false, error: 'delegation_id must be a UUID.' }
    const answer = typeof b.answer === 'string' ? b.answer.trim() : ''
    if (!answer) return { ok: false, error: 'answer cannot be empty.' }
    if (answer.length > 2000) return { ok: false, error: 'answer is too long.' }
    return { ok: true, value: { action: 'answer', delegation_id: b.delegation_id, answer } }
  }

  if (b.action === 'approve_step' || b.action === 'reject_step' || b.action === 'retry_step') {
    if (!isUuid(b.delegation_id)) return { ok: false, error: 'delegation_id must be a UUID.' }
    if (typeof b.step_id !== 'string' || !b.step_id) return { ok: false, error: 'step_id is required.' }
    return { ok: true, value: { action: b.action, delegation_id: b.delegation_id, step_id: b.step_id } }
  }

  if (b.action === 'approve_all' || b.action === 'cancel') {
    if (!isUuid(b.delegation_id)) return { ok: false, error: 'delegation_id must be a UUID.' }
    return { ok: true, value: { action: b.action, delegation_id: b.delegation_id } }
  }

  return { ok: false, error: 'Unknown action.' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(entry: string): { timestamp: string; text: string } {
  return { timestamp: new Date().toISOString(), text: entry }
}

async function patch(
  db: ReturnType<typeof createClient>,
  id: string,
  fields: Record<string, unknown>,
) {
  await (db as any)
    .from('inbox_delegations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
}

async function writeAudit(
  db: ReturnType<typeof createClient>,
  params: { delegationId: string; userId: string; stepId: string; action: 'approved' | 'rejected' | 'executed' | 'failed'; actorUserId: string; metadata?: Record<string, unknown> },
) {
  await (db as any).from('inbox_delegation_audit_log').insert({
    delegation_id: params.delegationId,
    user_id: params.userId,
    step_id: params.stepId,
    action: params.action,
    actor_user_id: params.actorUserId,
    metadata: params.metadata ?? {},
  })
}

/** Verifies the caller's JWT and returns their user id, or null if missing/invalid. Used to gate the approval actions — 'start'/'answer' keep v1's existing (looser) trust model to avoid changing behavior outside this feature's scope. */
async function getAuthenticatedUserId(req: Request, db: ReturnType<typeof createClient>): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null
  const { data, error } = await (db as any).auth.getUser(jwt)
  if (error || !data?.user) return null
  return data.user.id as string
}

// ── Claude call ───────────────────────────────────────────────────────────────

const ai = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const msg = await ai.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  return (msg.content[0] as { text: string }).text
}

// ── Phase: Ramping up → decide clarity ───────────────────────────────────────

async function rampUp(db: ReturnType<typeof createClient>, delegation: Record<string, unknown>, item: Record<string, unknown>) {
  const id = delegation.id as string
  const agentLog = (delegation.agent_log as object[]) ?? []

  agentLog.push(log('Reading the task and gathering context…'))
  await patch(db, id, { agent_log: agentLog })

  const tagNames: string = ((item as any).tags ?? []).map((t: any) => t.name).join(', ') || 'none'
  const taskText = item.text as string

  const clarityCheck = await callClaude(
    `You are a delegation agent assessing a task. Respond ONLY with valid JSON.
Return: { "clear": true/false, "questions": [{ "question": "...", "choices": ["A","B","C","Other"] }] }
- "clear" = true when the task can be planned with zero additional info
- If not clear, list up to 3 clarifying questions, each with 3-4 specific choices plus "Other" as the last choice`,
    `Task: "${taskText}"\nTags/context: ${tagNames}`,
  )

  let parsed: { clear: boolean; questions: { question: string; choices: string[] }[] }
  try {
    parsed = JSON.parse(clarityCheck)
  } catch {
    // Default to clear if parsing fails
    parsed = { clear: true, questions: [] }
  }

  agentLog.push(log(parsed.clear ? 'Task is clear — moving to planning.' : `${parsed.questions.length} clarifying question(s) needed.`))

  if (parsed.clear || parsed.questions.length === 0) {
    await patch(db, id, { status: 'planning', agent_log: agentLog })
    await planPhase(db, id, delegation.user_id as string, item.id as string, taskText, tagNames, {}, agentLog)
  } else {
    await patch(db, id, {
      status: 'clarifying',
      agent_log: agentLog,
      current_question: { ...parsed.questions[0], _all: parsed.questions, _idx: 0 },
    })
  }
}

// ── Phase: Receive answer, advance clarifying questions ───────────────────────

async function receiveAnswer(
  db: ReturnType<typeof createClient>,
  delegation: Record<string, unknown>,
  item: Record<string, unknown>,
  answer: string,
) {
  const id = delegation.id as string
  const agentLog = (delegation.agent_log as object[]) ?? []
  const cq = delegation.current_question as Record<string, unknown>
  const answers = (delegation.answers as Record<string, string>) ?? {}

  answers[cq.question as string] = answer
  agentLog.push(log(`Question: "${cq.question}" → "${answer}"`))

  const all = (cq._all as { question: string; choices: string[] }[])
  const nextIdx = (cq._idx as number) + 1

  if (nextIdx < all.length) {
    await patch(db, id, {
      answers,
      agent_log: agentLog,
      current_question: { ...all[nextIdx], _all: all, _idx: nextIdx },
    })
  } else {
    agentLog.push(log('All questions answered — moving to planning.'))
    await patch(db, id, { status: 'planning', answers, agent_log: agentLog, current_question: null })
    const tagNames: string = ((item as any).tags ?? []).map((t: any) => t.name).join(', ') || 'none'
    await planPhase(db, id, delegation.user_id as string, delegation.item_id as string, item.text as string, tagNames, answers, agentLog)
  }
}

// ── Phase: Planning — produce a structured, per-step plan ────────────────────

async function planPhase(
  db: ReturnType<typeof createClient>,
  id: string,
  userId: string,
  itemId: string,
  taskText: string,
  tagNames: string,
  answers: Record<string, string>,
  agentLog: object[],
) {
  const answersBlock = Object.entries(answers).length
    ? '\n\nClarified context:\n' + Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`).join('\n')
    : ''

  // Ground the planning prompt in real targets the user actually has access
  // to — Claude can't invent valid meeting series ids, and shouldn't guess at
  // Slack targets either.
  const { data: teamRows } = await (db as any).from('team_members').select('team_id').eq('user_id', userId)
  const teamIds = ((teamRows ?? []) as { team_id: string }[]).map(r => r.team_id)
  const { data: seriesRows } = teamIds.length
    ? await (db as any).from('meeting_series').select('id, name').in('team_id', teamIds)
    : { data: [] }
  const seriesOptions = ((seriesRows ?? []) as { id: string; name: string }[])

  const seriesBlock = seriesOptions.length
    ? seriesOptions.map(s => `- ${s.id} (${s.name})`).join('\n')
    : 'none available'

  const toolDefs = `
- create_meeting_topic: params { series_id: one of the ids below, title: string, notes?: string }. Available series:\n${seriesBlock}
- post_slack_update: params { message: string, and EITHER channel: string (a Slack channel name without '#') OR dm_user_email: string }`

  const planningResponse = await callClaude(
    `You are a delegation agent. Given a task, decide which of the available tools (if any) would concretely move it forward, and produce a JSON array of steps: [{ "tool": "...", "params": {...} }]. Only use the tools listed below, with valid params. If nothing concrete can be done with these tools, return an empty array []. Respond with ONLY the JSON array, no other text.

Available tools:${toolDefs}`,
    `Task: "${taskText}"\nTags: ${tagNames}${answersBlock}`,
  )

  let rawSteps: unknown = []
  try {
    rawSteps = JSON.parse(planningResponse)
  } catch {
    rawSteps = []
  }

  const knownTools = TOOL_NAMES
  const { steps, dropped } = buildPlanSteps(
    rawSteps,
    knownTools,
    (tool, params) => getTool(tool)!.validateParams(params),
    () => crypto.randomUUID(),
  )

  if (dropped.length) {
    agentLog.push(log(`Discarded ${dropped.length} invalid step(s) from the plan.`))
  }

  // Regenerate descriptions from resolved, real targets rather than trusting
  // Claude's own wording — the approval UI's tooltip contract requires the
  // *actual* meeting name/date/channel, not a template (see plan §9.2).
  for (const step of steps) {
    if (step.tool === 'create_meeting_topic') {
      const seriesId = (step.params as any).series_id as string
      const resolved = await resolveNextInstance(db, seriesId).catch(() => null)
      if (resolved?.instance) {
        step.params.resolved_series_name = resolved.seriesName
        step.params.resolved_date = resolved.instance.start_date
      }
    }
    step.description = getTool(step.tool)!.describe(step.params)
  }

  const plan = buildMarkdownFromSteps(steps)

  if (steps.length === 0) {
    agentLog.push(log('No concrete actions identified for this task — nothing to approve.'))
    await patch(db, id, { status: 'done', plan: plan || null, plan_steps: [], agent_log: agentLog })
    return
  }

  agentLog.push(log(`Plan drafted — ${steps.length} step(s) awaiting your approval.`))
  await patch(db, id, {
    status: computeAggregateStatus(steps as PlanStep[]),
    plan,
    plan_steps: steps,
    agent_log: agentLog,
  })
}

// ── Step execution ────────────────────────────────────────────────────────────

async function executeStep(
  db: ReturnType<typeof createClient>,
  delegationId: string,
  userId: string,
  step: PlanStep,
) {
  const tool = getTool(step.tool)
  if (!tool) {
    await (db as any).rpc('try_transition_delegation_step', {
      p_delegation_id: delegationId, p_step_id: step.id, p_from_statuses: ['running'],
      p_to_status: 'failed', p_actor: null, p_extra: { error: 'Unknown tool.' },
    })
    return
  }

  // Idempotency: if this step already recorded an execution, don't run the
  // tool again — just make sure the step's status reflects that outcome.
  const { data: existing } = await (db as any)
    .from('inbox_delegation_step_executions')
    .select('result')
    .eq('delegation_id', delegationId)
    .eq('step_id', step.id)
    .maybeSingle()
  if (existing) return

  const ranTo = await (db as any).rpc('try_transition_delegation_step', {
    p_delegation_id: delegationId, p_step_id: step.id, p_from_statuses: ['approved'],
    p_to_status: 'running', p_actor: null, p_extra: {},
  })
  if (ranTo.error) return // already running/succeeded/failed elsewhere — no-op

  try {
    const outcome = await tool.execute({ db, userId, delegationId, stepId: step.id }, step.params)
    await (db as any).from('inbox_delegation_step_executions').insert({
      delegation_id: delegationId, user_id: userId, step_id: step.id,
      idempotency_key: step.idempotency_key, tool: step.tool,
      target_table: outcome.targetTable ?? null, target_id: outcome.targetId ?? null, result: outcome.result ?? null,
    })
    await (db as any).rpc('try_transition_delegation_step', {
      p_delegation_id: delegationId, p_step_id: step.id, p_from_statuses: ['running'],
      p_to_status: 'succeeded', p_actor: null, p_extra: { result: outcome.result ?? null, executed_at: new Date().toISOString() },
    })
    await writeAudit(db, { delegationId, userId, stepId: step.id, action: 'executed', actorUserId: userId, metadata: { tool: step.tool } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    await (db as any).rpc('try_transition_delegation_step', {
      p_delegation_id: delegationId, p_step_id: step.id, p_from_statuses: ['running'],
      p_to_status: 'failed', p_actor: null, p_extra: { error: message },
    })
    await writeAudit(db, { delegationId, userId, stepId: step.id, action: 'failed', actorUserId: userId, metadata: { tool: step.tool, error: message } })
  }

  const { data: after } = await (db as any).from('inbox_delegations').select('plan_steps').eq('id', delegationId).maybeSingle()
  const steps = ((after?.plan_steps ?? []) as PlanStep[])
  const aggregate = computeAggregateStatus(steps)
  if (aggregate) await patch(db, delegationId, { status: aggregate })
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }

  const parsed = parseRequest(rawBody)
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const request = parsed.value

  if (request.action === 'start') {
    const { item_id, user_id } = request

    // Fetch item with tags
    const { data: item } = await (db as any)
      .from('inbox_items')
      .select('id, text, type, tags:inbox_item_tags(tag:inbox_tags(name))')
      .eq('id', item_id)
      .single()

    if (!item) return json({ error: 'Item not found' }, 404)

    // Flatten tags
    item.tags = (item.tags ?? []).map((t: any) => t.tag)

    // Create delegation record
    const { data: delegation } = await (db as any)
      .from('inbox_delegations')
      .insert({ item_id, user_id, status: 'ramping_up', agent_log: [log('Delegation started.')] })
      .select()
      .single()

    if (!delegation) return json({ error: 'Failed to create delegation' }, 500)

    // Run async — don't block the response
    rampUp(db, delegation, item).catch(err =>
      patch(db, delegation.id, {
        agent_log: [...(delegation.agent_log ?? []), log(`Error: ${err.message}`)],
      })
    )

    return json({ delegation_id: delegation.id, status: 'ramping_up' })
  }

  if (request.action === 'answer') {
    const { delegation_id, answer } = request

    const { data: delegation } = await (db as any)
      .from('inbox_delegations')
      .select('*')
      .eq('id', delegation_id)
      .single()

    if (!delegation) return json({ error: 'Delegation not found' }, 404)

    const { data: item } = await (db as any)
      .from('inbox_items')
      .select('id, text, tags:inbox_item_tags(tag:inbox_tags(name))')
      .eq('id', delegation.item_id)
      .single()

    if (item) item.tags = (item.tags ?? []).map((t: any) => t.tag)

    receiveAnswer(db, delegation, item ?? {}, answer).catch(err =>
      patch(db, delegation_id, {
        agent_log: [...(delegation.agent_log ?? []), log(`Error: ${err.message}`)],
      })
    )

    return json({ status: 'ok' })
  }

  // ── Everything past this point mutates approval state — require a verified caller. ──
  const authedUserId = await getAuthenticatedUserId(req, db)
  if (!authedUserId) return json({ error: 'Missing or invalid authorization.' }, 401)

  if (request.action === 'approve_step' || request.action === 'reject_step' || request.action === 'retry_step') {
    const { delegation_id, step_id } = request
    const fromStatuses = request.action === 'retry_step' ? ['failed'] : ['proposed']
    const toStatus = request.action === 'reject_step' ? 'rejected' : 'approved'
    const extra = toStatus === 'approved'
      ? { approved_by: authedUserId, approved_at: new Date().toISOString() }
      : {}

    const { error } = await (db as any).rpc('try_transition_delegation_step', {
      p_delegation_id: delegation_id, p_step_id: step_id, p_from_statuses: fromStatuses,
      p_to_status: toStatus, p_actor: authedUserId, p_extra: extra,
    })
    if (error) {
      const code = error.message?.includes('not_authorized') ? 403
        : error.message?.includes('not_found') ? 404
        : 409 // step_not_in_expected_state — e.g. a double-click race, or already decided
      return json({ error: error.message }, code)
    }

    await writeAudit(db, {
      delegationId: delegation_id, userId: authedUserId, stepId: step_id,
      action: toStatus === 'approved' ? 'approved' : 'rejected', actorUserId: authedUserId,
    })

    const { data: after } = await (db as any).from('inbox_delegations').select('plan_steps').eq('id', delegation_id).maybeSingle()
    const steps = ((after?.plan_steps ?? []) as PlanStep[])
    const aggregate = computeAggregateStatus(steps)
    if (aggregate) await patch(db, delegation_id, { status: aggregate })

    if (toStatus === 'approved') {
      const step = steps.find(s => s.id === step_id)
      if (step) executeStep(db, delegation_id, authedUserId, step).catch(err =>
        patch(db, delegation_id, { agent_log: [log(`Error executing step: ${err.message}`)] }),
      )
    }

    return json({ status: 'ok' })
  }

  if (request.action === 'approve_all') {
    const { delegation_id } = request
    const { data: delegation } = await (db as any).from('inbox_delegations').select('plan_steps, user_id').eq('id', delegation_id).maybeSingle()
    if (!delegation) return json({ error: 'Delegation not found' }, 404)
    if (delegation.user_id !== authedUserId) return json({ error: 'not_authorized' }, 403)

    const proposed = ((delegation.plan_steps ?? []) as PlanStep[]).filter(s => s.status === 'proposed')
    for (const step of proposed) {
      const { error } = await (db as any).rpc('try_transition_delegation_step', {
        p_delegation_id: delegation_id, p_step_id: step.id, p_from_statuses: ['proposed'],
        p_to_status: 'approved', p_actor: authedUserId, p_extra: { approved_by: authedUserId, approved_at: new Date().toISOString() },
      })
      if (!error) {
        await writeAudit(db, { delegationId: delegation_id, userId: authedUserId, stepId: step.id, action: 'approved', actorUserId: authedUserId })
      }
    }

    const { data: after } = await (db as any).from('inbox_delegations').select('plan_steps').eq('id', delegation_id).maybeSingle()
    const steps = ((after?.plan_steps ?? []) as PlanStep[])
    const aggregate = computeAggregateStatus(steps)
    if (aggregate) await patch(db, delegation_id, { status: aggregate })

    for (const step of steps.filter(s => s.status === 'approved')) {
      executeStep(db, delegation_id, authedUserId, step).catch(err =>
        patch(db, delegation_id, { agent_log: [log(`Error executing step: ${err.message}`)] }),
      )
    }

    return json({ status: 'ok' })
  }

  if (request.action === 'cancel') {
    const { delegation_id } = request
    const { data: delegation } = await (db as any).from('inbox_delegations').select('user_id').eq('id', delegation_id).maybeSingle()
    if (!delegation) return json({ error: 'Delegation not found' }, 404)
    if (delegation.user_id !== authedUserId) return json({ error: 'not_authorized' }, 403)

    await patch(db, delegation_id, { status: 'cancelled' })
    return json({ status: 'ok' })
  }

  return json({ error: 'Unknown action' }, 400)
})
