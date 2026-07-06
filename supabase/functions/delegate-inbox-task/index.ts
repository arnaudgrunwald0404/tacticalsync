/**
 * Delegation Skill — v1
 *
 * Orchestrates a sub-agent that works through:
 *   ramping_up → clarifying? → planning → getting_it_done → seeking_approval
 *
 * Called in two modes:
 *   { action: 'start',  item_id, user_id }           — kick off a new delegation
 *   { action: 'answer', delegation_id, answer }       — provide answer to clarifying question
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Anthropic from 'npm:@anthropic-ai/sdk'

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
    await planPhase(db, id, item.id as string, taskText, tagNames, {}, agentLog)
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
    await planPhase(db, id, delegation.item_id as string, item.text as string, tagNames, answers, agentLog)
  }
}

// ── Phase: Planning ───────────────────────────────────────────────────────────

async function planPhase(
  db: ReturnType<typeof createClient>,
  id: string,
  itemId: string,
  taskText: string,
  tagNames: string,
  answers: Record<string, string>,
  agentLog: object[],
) {
  const answersBlock = Object.entries(answers).length
    ? '\n\nClarified context:\n' + Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`).join('\n')
    : ''

  const plan = await callClaude(
    `You are a delegation agent producing a concise action plan. Format as a numbered markdown list. Be specific and actionable. 3-6 steps max.`,
    `Task: "${taskText}"\nTags: ${tagNames}${answersBlock}`,
  )

  agentLog.push(log('Plan drafted — executing.'))
  await patch(db, id, { status: 'getting_it_done', plan, agent_log: agentLog })

  // For v1, move directly to seeking approval with a summary
  const approvalSummary = await callClaude(
    `You are a delegation agent summarising completed work for human approval. Be brief (2-3 sentences).`,
    `Task: "${taskText}"\nPlan executed:\n${plan}`,
  )

  agentLog.push(log('Work complete — awaiting approval.'))
  await patch(db, id, { status: 'seeking_approval', approval_summary: approvalSummary, agent_log: agentLog })

  // Document the outcome durably on the item itself, not just the transient
  // delegation row — append (don't overwrite) so any notes the user already
  // wrote in the item's body are preserved.
  const summaryBlock = `**Assistant summary:** ${approvalSummary}`
  const { data: itemRow } = await (db as any).from('inbox_items').select('body').eq('id', itemId).maybeSingle()
  const existingBody: string = itemRow?.body ?? ''
  if (!existingBody.includes(summaryBlock)) {
    const newBody = existingBody ? `${existingBody}\n\n${summaryBlock}` : summaryBlock
    await (db as any).from('inbox_items').update({ body: newBody, updated_at: new Date().toISOString() }).eq('id', itemId)
  }
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

  return json({ error: 'Unknown action' }, 400)
})
