import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0"

// ── Group meeting query handler ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGroupQuery({ supabase, userId, group_meeting_id, question, startMs, anthropicApiKey }: {
  supabase: any; userId: string; group_meeting_id: string; question: string; startMs: number; anthropicApiKey: string;
}): Promise<Response> {
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

  const [meetingRes, participantsRes, prepsRes, actionsRes, topicsRes, relDocRes] = await Promise.all([
    supabase.from('cos_group_meetings').select('id, title, subject, cadence, next_start_at')
      .eq('id', group_meeting_id).eq('user_id', userId).single(),
    supabase.from('cos_group_meeting_participants').select('name, email, team_member_id')
      .eq('group_meeting_id', group_meeting_id),
    supabase.from('cos_one_on_one_prep').select('content, prep_date')
      .eq('user_id', userId).eq('group_meeting_id', group_meeting_id).eq('status', 'ready')
      .order('prep_date', { ascending: false }).limit(10),
    supabase.from('cos_meeting_actions').select('text, status, created_at, due_date, owner')
      .eq('user_id', userId).eq('group_meeting_id', group_meeting_id)
      .order('created_at', { ascending: false }).limit(30),
    supabase.from('cos_relationship_topics').select('topic, category, sentiment, mention_count, status')
      .eq('user_id', userId).eq('group_meeting_id', group_meeting_id)
      .order('mention_count', { ascending: false }),
    supabase.from('cos_relationship_documents').select('content')
      .eq('user_id', userId).eq('group_meeting_id', group_meeting_id).maybeSingle(),
  ])

  if (meetingRes.error || !meetingRes.data) return jsonResponse({ error: 'group_meeting_not_found' }, 404)

  const meeting = meetingRes.data as { id: string; title: string; subject: string | null; cadence: string | null; next_start_at: string | null }
  const participants = (participantsRes.data ?? []) as Array<{ name: string | null; email: string | null; team_member_id: string | null }>
  const preps = (prepsRes.data ?? []) as Array<{ content: string; prep_date: string }>
  const actions = (actionsRes.data ?? []) as Array<{ text: string; status: string; created_at: string; due_date: string | null; owner: string | null }>
  const topics = (topicsRes.data ?? []) as Array<{ topic: string; category: string; sentiment: string; mention_count: number; status: string }>
  const relDocContent: string = relDocRes.data?.content ?? ''

  const contextParts: string[] = []
  contextParts.push(`# Group Meeting: ${meeting.title}`)
  if (meeting.subject) contextParts.push(`Purpose: ${meeting.subject}`)
  if (meeting.cadence) contextParts.push(`Cadence: ${meeting.cadence}`)
  if (meeting.next_start_at) contextParts.push(`Next: ${meeting.next_start_at.slice(0, 10)}`)

  if (relDocContent) {
    contextParts.push(`\n## Living Meeting Brief\n${relDocContent}`)
  }

  if (participants.length > 0) {
    contextParts.push(`\n## Participants`)
    participants.forEach(p => contextParts.push(`- ${p.name ?? p.email ?? 'Unknown'}`))
  }

  if (topics.length > 0) {
    contextParts.push(`\n## Recurring Topics`)
    topics.forEach(t => {
      const statusLabel = t.status === 'resolved' ? ' ✓' : t.status === 'stale' ? ' ⚠' : ''
      contextParts.push(`- "${t.topic}" [${t.category}] — mentioned ${t.mention_count}x${statusLabel}`)
    })
  }

  if (actions.length > 0) {
    const pending = actions.filter(a => a.status === 'pending')
    const completed = actions.filter(a => a.status === 'done')
    if (pending.length > 0) {
      contextParts.push(`\n## Pending Action Items`)
      pending.forEach(a => {
        const due = a.due_date ? ` — due ${a.due_date}` : ''
        const owner = a.owner ? ` (${a.owner})` : ''
        contextParts.push(`- ${a.text}${owner}${due}`)
      })
    }
    if (completed.length > 0) {
      contextParts.push(`\n## Completed Action Items`)
      completed.slice(0, 10).forEach(a => contextParts.push(`- ${a.text}`))
    }
  }

  if (preps.length > 0) {
    contextParts.push(`\n## Meeting Prep History`)
    preps.forEach(p => {
      const preview = p.content.length > 600 ? p.content.slice(0, 600) + '...' : p.content
      contextParts.push(`\n### ${p.prep_date}\n${preview}`)
    })
  }

  const systemPrompt = `You are a meeting intelligence assistant. The user is asking about the group meeting "${meeting.title}".

RULES:
- Answer based ONLY on the provided data below. Do not speculate beyond what is documented.
- Cite specific dates and prep notes when relevant.
- If the information isn't in the data, say so clearly.
- Be concise but thorough. Use bullet points for multiple items.

${contextParts.join('\n')}`

  const anthropic = new Anthropic({ apiKey: anthropicApiKey })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: question.trim() }],
  })

  const answer = response.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text: string }) => b.text)
    .join('\n')

  await supabase.from('prep_generation_log').insert({
    user_id: userId,
    group_meeting_id,
    prep_id: null,
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    model: 'claude-sonnet-4-6',
    duration_ms: Date.now() - startMs,
    data_sources_used: ['group_relationship_query'],
  })

  return jsonResponse({
    answer,
    member_name: meeting.title,
    context_size: { preps: preps.length, topics: topics.length, actions: actions.length },
    token_usage: { input_tokens: response.usage?.input_tokens ?? 0, output_tokens: response.usage?.output_tokens ?? 0 },
  }, 200)
}

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

/**
 * Query relationship history with a team member.
 *
 * Accepts a natural language question and returns an answer grounded in
 * the user's full history of prep notes, topics, action items, and context
 * with a specific team member.
 *
 * Uses prompt caching: the relationship context (system prompt) stays
 * stable across questions, so repeated queries against the same
 * relationship hit the cache.
 */
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

    // Auth
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

    // Parse request
    const body = await req.json() as { team_member_id?: string; group_meeting_id?: string; question: string }
    const { team_member_id, group_meeting_id, question } = body

    if ((!team_member_id && !group_meeting_id) || !question?.trim()) {
      return jsonResponse({ error: 'team_member_id or group_meeting_id, and question are required' }, 400)
    }

    // Route to group meeting path if group_meeting_id provided
    if (group_meeting_id) {
      return handleGroupQuery({ supabase, userId, group_meeting_id, question, startMs: Date.now(), anthropicApiKey })
    }

    // Rate limit: 10 queries per user per day
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const { count: todayCount } = await supabase
      .from('prep_generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .contains('data_sources_used', ['relationship_query'])
      .gte('created_at', dayStart.toISOString())

    if ((todayCount ?? 0) >= 10) {
      return jsonResponse({ error: 'rate_limit_exceeded', message: 'Max 10 relationship queries per day' }, 429)
    }

    // ── Gather full relationship context ──────────────────────────────────

    const startMs = Date.now()

    const [
      memberRes,
      prepsRes,
      relTopicsRes,
      allActionsRes,
      accountabilitiesRes,
      personTopicsRes,
      relDocRes,
    ] = await Promise.all([
      supabase
        .from('cos_team_members')
        .select('name, role, relationship_type, context_notes, last_1on1_date')
        .eq('id', team_member_id)
        .eq('user_id', userId)
        .single(),
      // All prep notes for this member (not just last 3)
      supabase
        .from('cos_one_on_one_prep')
        .select('content, source, prep_date')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .eq('status', 'ready')
        .order('prep_date', { ascending: false })
        .limit(20),
      // All relationship topics
      supabase
        .from('cos_relationship_topics')
        .select('topic, category, sentiment, mention_count, first_mentioned_at, last_mentioned_at, status, context_snippet')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .order('mention_count', { ascending: false }),
      // All actions (including completed)
      supabase
        .from('cos_meeting_actions')
        .select('text, status, created_at, due_date, completed_at')
        .eq('user_id', userId)
        .eq('member_id', team_member_id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('cos_person_accountabilities')
        .select('text')
        .eq('member_id', team_member_id),
      supabase
        .from('cos_person_topics')
        .select('text')
        .eq('member_id', team_member_id),
      supabase
        .from('cos_relationship_documents')
        .select('content')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .maybeSingle(),
    ])

    if (memberRes.error || !memberRes.data) {
      return jsonResponse({ error: 'member_not_found' }, 404)
    }

    const member = memberRes.data as {
      name: string; role: string; relationship_type: string;
      context_notes: string | null; last_1on1_date: string | null;
    }
    const preps = (prepsRes.data ?? []) as Array<{ content: string; source: string; prep_date: string }>
    const relTopics = (relTopicsRes.data ?? []) as Array<{
      topic: string; category: string; sentiment: string; mention_count: number;
      first_mentioned_at: string; last_mentioned_at: string; status: string;
      context_snippet: string | null;
    }>
    const allActions = (allActionsRes.data ?? []) as Array<{
      text: string; status: string; created_at: string;
      due_date: string | null; completed_at: string | null;
    }>
    const accountabilities = (accountabilitiesRes.data ?? []) as Array<{ text: string }>
    const personTopics = (personTopicsRes.data ?? []) as Array<{ text: string }>
    const relDocContent: string = relDocRes?.data?.content ?? ''

    // ── Build system prompt with full relationship context ────────────────
    // This is the cacheable part — it changes slowly between queries.

    const contextParts: string[] = []

    if (relDocContent) {
      contextParts.push(`## Relationship Brief (auto-generated, most up-to-date summary)\n${relDocContent}`)
    }

    contextParts.push(`# Relationship History: ${member.name}`)
    contextParts.push(`Role: ${member.role}`)
    contextParts.push(`Relationship: ${member.relationship_type.replace('_', ' ')}`)
    if (member.last_1on1_date) contextParts.push(`Last 1:1: ${member.last_1on1_date}`)
    if (member.context_notes) contextParts.push(`Context: ${member.context_notes}`)

    if (accountabilities.length > 0) {
      contextParts.push(`\n## Accountabilities`)
      accountabilities.forEach(a => contextParts.push(`- ${a.text}`))
    }

    if (personTopics.length > 0) {
      contextParts.push(`\n## Standing Discussion Topics`)
      personTopics.forEach(t => contextParts.push(`- ${t.text}`))
    }

    if (relTopics.length > 0) {
      contextParts.push(`\n## Relationship Topic Map`)
      contextParts.push(`These are topics extracted from past meetings, ordered by frequency:`)
      for (const t of relTopics) {
        const statusLabel = t.status === 'resolved' ? ' ✓ RESOLVED' : t.status === 'stale' ? ' ⚠ STALE' : ''
        contextParts.push(`- "${t.topic}" [${t.category}] — mentioned ${t.mention_count}x, first ${t.first_mentioned_at}, last ${t.last_mentioned_at}${statusLabel}`)
        if (t.context_snippet) contextParts.push(`  Context: "${t.context_snippet}"`)
      }
    }

    if (allActions.length > 0) {
      const pending = allActions.filter(a => a.status === 'pending')
      const completed = allActions.filter(a => a.status === 'done')
      const cancelled = allActions.filter(a => a.status === 'cancelled')

      if (pending.length > 0) {
        contextParts.push(`\n## Pending Action Items (${pending.length})`)
        pending.forEach(a => {
          const due = a.due_date ? ` — due ${a.due_date}` : ''
          contextParts.push(`- ${a.text} (created ${a.created_at.slice(0, 10)}${due})`)
        })
      }
      if (completed.length > 0) {
        contextParts.push(`\n## Completed Action Items (${completed.length})`)
        completed.forEach(a => {
          const done = a.completed_at ? ` — completed ${a.completed_at.slice(0, 10)}` : ''
          contextParts.push(`- ${a.text} (created ${a.created_at.slice(0, 10)}${done})`)
        })
      }
      if (cancelled.length > 0) {
        contextParts.push(`\n## Cancelled Action Items (${cancelled.length})`)
        cancelled.forEach(a => contextParts.push(`- ${a.text} (created ${a.created_at.slice(0, 10)})`))
      }
    }

    if (preps.length > 0) {
      contextParts.push(`\n## Meeting Prep History (${preps.length} meetings)`)
      for (const prep of preps) {
        const preview = prep.content.length > 800 ? prep.content.slice(0, 800) + '...' : prep.content
        contextParts.push(`\n### ${prep.prep_date} (${prep.source})`)
        contextParts.push(preview)
      }
    }

    const systemPrompt = `You are a relationship memory assistant. The user is asking about their history with ${member.name}.

RULES:
- Answer based ONLY on the provided data below. Do not speculate or infer beyond what's documented.
- Cite specific dates and prep notes when relevant (e.g., "In your May 15 prep...").
- If the information isn't in the data, say so clearly.
- Be concise but thorough. Use bullet points for multiple items.
- If the question involves a timeline, present events chronologically.
- If the question is about commitments or promises, distinguish between pending, completed, and cancelled items.

${contextParts.join('\n')}`

    // ── Call Claude ───────────────────────────────────────────────────────

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: question.trim() }],
    })

    const answer = response.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { type: string; text: string }) => b.text)
      .join('\n')

    const inputTokens = response.usage?.input_tokens ?? 0
    const outputTokens = response.usage?.output_tokens ?? 0

    // Log for cost tracking + rate limiting
    await supabase.from('prep_generation_log').insert({
      user_id: userId,
      team_member_id: team_member_id,
      prep_id: null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: 'claude-sonnet-4-6',
      duration_ms: Date.now() - startMs,
      data_sources_used: ['relationship_query'],
    })

    return jsonResponse({
      answer,
      member_name: member.name,
      context_size: {
        preps: preps.length,
        topics: relTopics.length,
        actions: allActions.length,
      },
      token_usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }, 200)

  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
