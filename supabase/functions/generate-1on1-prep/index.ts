import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0"
import { getStackOneConfig, fetchStackOneEnrichment } from "../_shared/stackone.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface GeneratePrepRequest {
  team_member_id: string
  event_id?: string
  force_regenerate?: boolean
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const startMs = Date.now()

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
    let body: GeneratePrepRequest
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body' }, 400)
    }

    const { team_member_id, event_id, force_regenerate } = body
    if (!team_member_id) {
      return jsonResponse({ error: 'team_member_id_required' }, 400)
    }

    // Rate limit: 20 generations per user per day
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const { count: todayCount } = await supabase
      .from('prep_generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', dayStart.toISOString())

    if ((todayCount ?? 0) >= 20) {
      return jsonResponse({ error: 'rate_limit_exceeded', message: 'Max 20 AI preps per day' }, 429)
    }

    // Check for cached prep (within 4 hours) unless force
    const todayDate = new Date().toISOString().slice(0, 10)
    if (!force_regenerate) {
      const { data: cached } = await supabase
        .from('cos_one_on_one_prep')
        .select('id, content, source, generated_at, data_sources_used, status')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .eq('prep_date', todayDate)
        .eq('source', 'ai_generated')
        .eq('status', 'ready')
        .maybeSingle()

      if (cached) {
        const age = Date.now() - new Date(cached.generated_at).getTime()
        if (age < 4 * 60 * 60 * 1000) {
          return jsonResponse({
            prep_id: cached.id,
            content: cached.content,
            source: 'ai_generated',
            generated_at: cached.generated_at,
            data_sources_used: cached.data_sources_used,
            cached: true,
          }, 200)
        }
      }
    }

    // ── Gather internal data ───────────────────────────────────────────────

    const [
      memberRes,
      prioritiesRes,
      actionsRes,
      accountabilitiesRes,
      topicsRes,
      pastPrepsRes,
      prepSettingsRes,
      quarterRes,
      zoomRecordingsRes,
      slackMessagesRes,
    ] = await Promise.all([
      supabase
        .from('cos_team_members')
        .select('id, name, role, relationship_type, context_notes, email, last_1on1_date')
        .eq('id', team_member_id)
        .eq('user_id', userId)
        .single(),
      supabase
        .from('cos_priorities')
        .select('text, category, notes')
        .eq('user_id', userId)
        .is('done_at', null)
        .is('archived_at', null)
        .order('tier_order'),
      supabase
        .from('cos_meeting_actions')
        .select('text, status, created_at')
        .eq('user_id', userId)
        .eq('member_id', team_member_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('cos_person_accountabilities')
        .select('text')
        .eq('member_id', team_member_id),
      supabase
        .from('cos_person_topics')
        .select('text')
        .eq('member_id', team_member_id),
      supabase
        .from('cos_one_on_one_prep')
        .select('content, source, generated_at, prep_date')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .eq('status', 'ready')
        .order('prep_date', { ascending: false })
        .limit(3),
      supabase
        .from('cos_prep_settings')
        .select('prep_instructions')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('commitment_quarters')
        .select('id, label, start_date, end_date')
        .lte('start_date', todayDate)
        .gte('end_date', todayDate)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('cos_zoom_recordings')
        .select('id, topic, start_time, duration_minutes, has_transcript, ai_summary')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .gte('start_time', new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order('start_time', { ascending: false })
        .limit(5),
      supabase
        .from('cos_slack_messages')
        .select('content, sender_name, channel_name, is_dm, message_date')
        .eq('user_id', userId)
        .eq('team_member_id', team_member_id)
        .gte('message_date', new Date(Date.now() - 14 * 86_400_000).toISOString())
        .order('message_date', { ascending: false })
        .limit(15),
    ])

    if (memberRes.error || !memberRes.data) {
      return jsonResponse({ error: 'member_not_found' }, 404)
    }

    const member = memberRes.data as {
      id: string; name: string; role: string; relationship_type: string;
      context_notes: string | null; email: string | null; last_1on1_date: string | null;
    }

    // Load quarterly priorities + monthly commitments if quarter exists
    let quarterlyPriorities: Array<{ title: string; description: string | null; status: string }> = []
    let monthlyCommitments: Array<{ title: string; description: string | null; status: string }> = []

    if (quarterRes.data) {
      const q = quarterRes.data as { id: string; label: string; start_date: string }
      const qStart = new Date(q.start_date + 'T00:00:00')
      const monthNum = Math.min(3, Math.max(1, new Date().getMonth() - qStart.getMonth() + 1))

      const [priRes, comRes] = await Promise.all([
        supabase
          .from('quarterly_priorities')
          .select('title, description, status')
          .eq('quarter_id', q.id)
          .eq('user_id', userId)
          .order('display_order'),
        supabase
          .from('monthly_commitments')
          .select('title, description, status')
          .eq('quarter_id', q.id)
          .eq('user_id', userId)
          .eq('month_number', monthNum)
          .order('display_order'),
      ])
      quarterlyPriorities = (priRes.data ?? []) as typeof quarterlyPriorities
      monthlyCommitments = (comRes.data ?? []) as typeof monthlyCommitments
    }

    const priorities = (prioritiesRes.data ?? []) as Array<{ text: string; category: string; notes: string | null }>
    const pendingActions = (actionsRes.data ?? []) as Array<{ text: string; created_at: string }>
    const accountabilities = (accountabilitiesRes.data ?? []) as Array<{ text: string }>
    const topics = (topicsRes.data ?? []) as Array<{ text: string }>
    const pastPreps = (pastPrepsRes.data ?? []) as Array<{ content: string; source: string; generated_at: string; prep_date: string }>
    const prepInstructions = (prepSettingsRes.data as { prep_instructions: string } | null)?.prep_instructions ?? ''

    const dataSources = ['priorities', 'commitments', 'actions', 'context']

    // ── Build prompt ───────────────────────────────────────────────────────

    const contextParts: string[] = []

    contextParts.push(`Person: ${member.name} (${member.role}, ${member.relationship_type.replace('_', ' ')})`)
    if (member.last_1on1_date) {
      contextParts.push(`Last 1:1: ${member.last_1on1_date}`)
    }
    if (member.context_notes) {
      contextParts.push(`Context about ${member.name}: ${member.context_notes}`)
    }

    if (accountabilities.length > 0) {
      contextParts.push(`\n${member.name}'s accountabilities:`)
      accountabilities.forEach(a => contextParts.push(`  - ${a.text}`))
    }

    if (topics.length > 0) {
      contextParts.push(`\nStanding discussion topics for ${member.name}:`)
      topics.forEach(t => contextParts.push(`  - ${t.text}`))
    }

    if (pendingActions.length > 0) {
      contextParts.push(`\nPending action items from previous 1:1s:`)
      pendingActions.forEach(a => contextParts.push(`  - ${a.text}`))
    }

    const categoryBuckets: Record<string, string[]> = {}
    for (const p of priorities) {
      const cat = p.category ?? 'other'
      if (!categoryBuckets[cat]) categoryBuckets[cat] = []
      categoryBuckets[cat].push(p.text + (p.notes ? ` (${p.notes})` : ''))
    }
    if (Object.keys(categoryBuckets).length > 0) {
      contextParts.push(`\nMy current priorities:`)
      for (const [cat, items] of Object.entries(categoryBuckets)) {
        contextParts.push(`  ${cat.replace('_', ' ')}:`)
        items.forEach(i => contextParts.push(`    - ${i}`))
      }
    }

    if (quarterlyPriorities.length > 0) {
      contextParts.push(`\nQuarterly priorities:`)
      quarterlyPriorities.forEach((p, i) =>
        contextParts.push(`  ${i + 1}. ${p.title}${p.description ? ` — ${p.description}` : ''} [${p.status}]`)
      )
    }

    if (monthlyCommitments.length > 0) {
      contextParts.push(`\nMonthly commitments:`)
      monthlyCommitments.forEach((c, i) =>
        contextParts.push(`  ${i + 1}. ${c.title}${c.description ? ` — ${c.description}` : ''} [${c.status}]`)
      )
    }

    if (pastPreps.length > 0) {
      contextParts.push(`\nRecent past prep briefs for ${member.name} (for continuity):`)
      for (const pp of pastPreps) {
        const preview = pp.content.length > 500 ? pp.content.slice(0, 500) + '...' : pp.content
        contextParts.push(`--- Prep from ${pp.prep_date} (${pp.source}) ---`)
        contextParts.push(preview)
      }
    }

    // Zoom recordings context
    const zoomRecordings = (zoomRecordingsRes.data ?? []) as Array<{
      id: string; topic: string | null; start_time: string;
      duration_minutes: number | null; has_transcript: boolean; ai_summary: string | null;
    }>
    if (zoomRecordings.length > 0) {
      contextParts.push(`\nRecent Zoom meetings with ${member.name}:`)
      let transcriptsIncluded = 0
      for (const rec of zoomRecordings) {
        const date = new Date(rec.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const dur = rec.duration_minutes ? `${rec.duration_minutes}min` : 'unknown duration'
        contextParts.push(`  - "${rec.topic ?? 'Untitled'}" (${date}, ${dur})`)
        if (rec.ai_summary) {
          const preview = rec.ai_summary.length > 500 ? rec.ai_summary.slice(0, 500) + '...' : rec.ai_summary
          contextParts.push(`    Summary: ${preview}`)
        }
        if (rec.has_transcript && transcriptsIncluded < 3) {
          const { data: transcript } = await supabase
            .from('cos_zoom_transcripts')
            .select('content')
            .eq('recording_id', rec.id)
            .maybeSingle()
          if (transcript?.content) {
            const excerpt = (transcript.content as string).slice(0, 500)
            contextParts.push(`    Transcript excerpt: "${excerpt}..."`)
            transcriptsIncluded++
          }
        }
      }
      dataSources.push('zoom_recordings')
    }

    // Slack messages context
    const slackMessages = (slackMessagesRes.data ?? []) as Array<{
      content: string; sender_name: string | null; channel_name: string | null;
      is_dm: boolean; message_date: string;
    }>
    if (slackMessages.length > 0) {
      const dmMessages = slackMessages.filter(m => m.is_dm)
      const channelMessages = slackMessages.filter(m => !m.is_dm)

      if (dmMessages.length > 0) {
        contextParts.push(`\nRecent Slack DMs with ${member.name}:`)
        for (const msg of dmMessages.slice(0, 8)) {
          const date = new Date(msg.message_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const sender = msg.sender_name ?? 'unknown'
          const preview = msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content
          contextParts.push(`  - [${date}] ${sender}: "${preview}"`)
        }
      }

      if (channelMessages.length > 0) {
        contextParts.push(`\nRecent Slack channel messages from ${member.name}:`)
        for (const msg of channelMessages.slice(0, 5)) {
          const date = new Date(msg.message_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const channel = msg.channel_name ? `#${msg.channel_name}` : 'channel'
          const preview = msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content
          contextParts.push(`  - [${date}] in ${channel}: "${preview}"`)
        }
      }

      dataSources.push('slack_messages')
    }

    // ── StackOne enrichment (HRIS, ticketing, CRM) ────────────────────────
    if (member.email) {
      try {
        const s1Config = await getStackOneConfig(supabase, userId)
        if (s1Config) {
          const enrichment = await fetchStackOneEnrichment(
            s1Config.apiKey,
            s1Config.accounts,
            member.email,
            member.name,
          )
          if (enrichment.sections.length > 0) {
            contextParts.push(`\nExternal system data for ${member.name}:`)
            contextParts.push(...enrichment.sections)
            dataSources.push(...enrichment.sourcesUsed)
          }
        }
      } catch (err) {
        console.warn('StackOne enrichment failed (non-fatal):', err)
      }
    }

    const systemPrompt = `You are a chief of staff assistant preparing a 1:1 meeting brief. Generate a concise, actionable prep document in Markdown format.

Output structure:
- Use ## headings for each topic section (NOT # — skip H1)
- Under each heading, use bullet points (- ) for specific items
- Keep it focused: 3-6 topic sections, each with 2-4 bullets
- Prioritize: blockers and escalations first, then alignment items, then check-ins
- Reference specific priorities, commitments, or actions by name
- Be direct and specific — no filler or generic advice
- If there are pending action items, include a "Follow up on open items" section
- If Zoom meeting transcript excerpts are provided, reference key discussion points or decisions from those meetings
- If Slack messages are provided, note any recent topics, requests, or decisions from those conversations
- If external system data is provided (HRIS, tickets, CRM), weave relevant context naturally — mention upcoming PTO, blocked tickets, or deal activity where it helps prepare talking points

${prepInstructions ? `Standing instructions from the user:\n${prepInstructions}\n` : ''}`

    const userPrompt = `Prepare a 1:1 brief for my upcoming meeting with ${member.name}.

${contextParts.join('\n')}`

    // ── Call Claude API ────────────────────────────────────────────────────

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const generatedContent = message.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { type: string; text: string }) => b.text)
      .join('\n')

    const inputTokens = message.usage?.input_tokens ?? 0
    const outputTokens = message.usage?.output_tokens ?? 0

    // ── Store result ───────────────────────────────────────────────────────

    const { data: upserted, error: upsertErr } = await supabase
      .from('cos_one_on_one_prep')
      .upsert({
        user_id: userId,
        team_member_id: team_member_id,
        prep_date: todayDate,
        content: generatedContent,
        source: 'ai_generated',
        generated_at: new Date().toISOString(),
        data_sources_used: dataSources,
        status: 'ready',
        event_id: event_id ?? null,
      }, {
        onConflict: 'user_id,team_member_id,prep_date,source',
      })
      .select('id')
      .single()

    if (upsertErr) {
      return jsonResponse({ error: 'storage_failed', detail: upsertErr.message }, 500)
    }

    // Log generation for cost tracking
    await supabase.from('prep_generation_log').insert({
      user_id: userId,
      team_member_id: team_member_id,
      prep_id: upserted?.id ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: 'claude-sonnet-4-20250514',
      duration_ms: Date.now() - startMs,
      data_sources_used: dataSources,
    })

    return jsonResponse({
      prep_id: upserted?.id,
      content: generatedContent,
      source: 'ai_generated',
      generated_at: new Date().toISOString(),
      data_sources_used: dataSources,
      token_usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      cached: false,
    }, 200)

  } catch (error) {
    // Log the error for debugging
    const errMsg = (error as Error).message ?? String(error)
    return jsonResponse({ error: 'generation_failed', detail: errMsg }, 500)
  }
})
