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
    const body = await req.json() as { team_member_id: string; question: string }
    const { team_member_id, question } = body

    if (!team_member_id || !question?.trim()) {
      return jsonResponse({ error: 'team_member_id and question are required' }, 400)
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

    // ── Build system prompt with full relationship context ────────────────
    // This is the cacheable part — it changes slowly between queries.

    const contextParts: string[] = []

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
