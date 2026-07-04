import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface GenerateGroupBriefRequest {
  group_meeting_id: string
  force_regenerate?: boolean
  _batch_user_id?: string
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

    // Auth — same two modes as generate-1on1-prep:
    // 1. User JWT (client calls); 2. Service-role key + _batch_user_id (batch).
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'missing_authorization' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let body: GenerateGroupBriefRequest
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body' }, 400)
    }

    let userId: string
    if (jwt === serviceRoleKey && body._batch_user_id) {
      userId = body._batch_user_id
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'invalid_token' }, 401)
      }
      userId = userData.user.id
    }

    const { group_meeting_id, force_regenerate } = body
    if (!group_meeting_id) {
      return jsonResponse({ error: 'group_meeting_id_required' }, 400)
    }

    // Rate limit: shared with 1:1 prep — 20 generations per user per day.
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

    const todayDate = new Date().toISOString().slice(0, 10)

    // Cache: reuse a brief generated in the last 4 hours unless forced.
    if (!force_regenerate) {
      const { data: cached } = await supabase
        .from('cos_one_on_one_prep')
        .select('id, content, source, generated_at, data_sources_used, status')
        .eq('user_id', userId)
        .eq('group_meeting_id', group_meeting_id)
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

    // ── Load the meeting, its roster, and its enabled context sources ───────

    const [meetingRes, participantsRes, sourcesRes, actionsRes, quarterRes] = await Promise.all([
      supabase
        .from('cos_group_meetings')
        .select('id, title, subject, cadence, next_start_at')
        .eq('id', group_meeting_id)
        .eq('user_id', userId)
        .single(),
      supabase
        .from('cos_group_meeting_participants')
        .select('id, name, email, team_member_id')
        .eq('group_meeting_id', group_meeting_id),
      supabase
        .from('cos_group_meeting_sources')
        .select('source_type, ref, label, enabled')
        .eq('group_meeting_id', group_meeting_id)
        .eq('enabled', true),
      supabase
        .from('cos_meeting_actions')
        .select('text, status, created_at, due_date, owner, member_id')
        .eq('user_id', userId)
        .eq('group_meeting_id', group_meeting_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('commitment_quarters')
        .select('id, label, start_date, end_date')
        .lte('start_date', todayDate)
        .gte('end_date', todayDate)
        .limit(1)
        .maybeSingle(),
    ])

    if (meetingRes.error || !meetingRes.data) {
      return jsonResponse({ error: 'group_meeting_not_found' }, 404)
    }

    const meeting = meetingRes.data as {
      id: string; title: string; subject: string | null;
      cadence: string | null; next_start_at: string | null;
    }
    const subject = meeting.subject?.trim() || meeting.title
    const participants = (participantsRes.data ?? []) as Array<{
      id: string; name: string | null; email: string | null; team_member_id: string | null;
    }>
    const sources = (sourcesRes.data ?? []) as Array<{
      source_type: string; ref: string; label: string | null; enabled: boolean;
    }>
    const pendingActions = (actionsRes.data ?? []) as Array<{
      text: string; created_at: string; due_date: string | null; owner: string; member_id: string | null;
    }>

    const dataSources: string[] = ['group_roster']

    // ── Tracked-member enrichment (names, roles, context, accountabilities) ──
    const trackedMemberIds = participants
      .map(p => p.team_member_id)
      .filter((id): id is string => !!id)

    let trackedMembers: Array<{ id: string; name: string; role: string | null; context_notes: string | null }> = []
    let accountabilitiesByMember = new Map<string, string[]>()
    if (trackedMemberIds.length > 0) {
      const [memRes, accRes] = await Promise.all([
        supabase
          .from('cos_team_members')
          .select('id, name, role, context_notes')
          .eq('user_id', userId)
          .in('id', trackedMemberIds),
        supabase
          .from('cos_person_accountabilities')
          .select('member_id, text')
          .in('member_id', trackedMemberIds),
      ])
      trackedMembers = (memRes.data ?? []) as typeof trackedMembers
      for (const a of (accRes.data ?? []) as Array<{ member_id: string; text: string }>) {
        const list = accountabilitiesByMember.get(a.member_id) ?? []
        list.push(a.text)
        accountabilitiesByMember.set(a.member_id, list)
      }
    }
    const memberById = new Map(trackedMembers.map(m => [m.id, m]))

    // ── Quarter context (team work — shared across the group) ───────────────
    let quarterlyPriorities: Array<{ title: string; description: string | null; status: string }> = []
    let monthlyCommitments: Array<{ title: string; description: string | null; status: string }> = []
    if (quarterRes.data) {
      const q = quarterRes.data as { id: string; start_date: string }
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

    // ── Context from bound sources (Slack channels + Zoom recordings) ───────
    const slackRefs = sources.filter(s => s.source_type === 'slack_channel').map(s => s.ref.replace(/^#/, ''))
    const zoomRefs = sources.filter(s => s.source_type === 'zoom').map(s => s.ref)

    let slackMessages: Array<{ content: string; sender_name: string | null; channel_name: string | null; message_date: string }> = []
    if (slackRefs.length > 0) {
      const { data } = await supabase
        .from('cos_slack_messages')
        .select('content, sender_name, channel_name, message_date')
        .eq('user_id', userId)
        .in('channel_name', slackRefs)
        .gte('message_date', new Date(Date.now() - 14 * 86_400_000).toISOString())
        .order('message_date', { ascending: false })
        .limit(25)
      slackMessages = (data ?? []) as typeof slackMessages
      if (slackMessages.length > 0) dataSources.push('slack_messages')
    }

    let zoomRecordings: Array<{ id: string; topic: string | null; start_time: string; has_transcript: boolean; ai_summary: string | null }> = []
    if (zoomRefs.length > 0) {
      // Match recordings whose topic contains any bound zoom reference keyword.
      const orFilter = zoomRefs.map(ref => `topic.ilike.%${ref.replace(/[%,]/g, '')}%`).join(',')
      const { data } = await supabase
        .from('cos_zoom_recordings')
        .select('id, topic, start_time, has_transcript, ai_summary')
        .eq('user_id', userId)
        .or(orFilter)
        .gte('start_time', new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order('start_time', { ascending: false })
        .limit(5)
      zoomRecordings = (data ?? []) as typeof zoomRecordings
      if (zoomRecordings.length > 0) dataSources.push('zoom_recordings')
    }

    // ── Build prompt ────────────────────────────────────────────────────────

    const contextParts: string[] = []

    const rosterLabels = participants.map(p => {
      const m = p.team_member_id ? memberById.get(p.team_member_id) : null
      const name = m?.name ?? p.name ?? p.email ?? 'Unknown'
      const role = m?.role ? ` (${m.role})` : ''
      const tracked = p.team_member_id ? '' : ' [not tracked]'
      return `${name}${role}${tracked}`
    })
    contextParts.push(`Meeting subject: ${subject}`)
    if (meeting.subject && meeting.subject !== meeting.title) {
      contextParts.push(`Calendar title: ${meeting.title}`)
    }
    if (meeting.cadence) contextParts.push(`Cadence: ${meeting.cadence}`)
    contextParts.push(`Participants (${participants.length}): ${rosterLabels.join(', ')}`)

    // Per-participant context the user has recorded.
    const memberNotes: string[] = []
    for (const m of trackedMembers) {
      const accs = accountabilitiesByMember.get(m.id) ?? []
      const bits: string[] = []
      if (m.context_notes) bits.push(`context: ${m.context_notes}`)
      if (accs.length > 0) bits.push(`accountable for: ${accs.join('; ')}`)
      if (bits.length > 0) memberNotes.push(`  - ${m.name} — ${bits.join('. ')}`)
    }
    if (memberNotes.length > 0) {
      contextParts.push(`\nWhat I know about the participants:`)
      contextParts.push(...memberNotes)
    }

    // Primary signal: Zoom recordings of this meeting series.
    if (zoomRecordings.length > 0) {
      contextParts.push(`\n=== RECENT RECORDINGS RELATED TO "${subject.toUpperCase()}" ===`)
      let transcriptsIncluded = 0
      for (const rec of zoomRecordings) {
        const date = new Date(rec.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        contextParts.push(`  - "${rec.topic ?? 'Untitled'}" (${date})`)
        if (rec.ai_summary) {
          const preview = rec.ai_summary.length > 600 ? rec.ai_summary.slice(0, 600) + '...' : rec.ai_summary
          contextParts.push(`    Summary: ${preview}`)
        }
        if (rec.has_transcript && transcriptsIncluded < 2) {
          const { data: transcript } = await supabase
            .from('cos_zoom_transcripts')
            .select('content')
            .eq('recording_id', rec.id)
            .maybeSingle()
          if (transcript?.content) {
            contextParts.push(`    Transcript excerpt: "${(transcript.content as string).slice(0, 1000)}..."`)
            transcriptsIncluded++
          }
        }
      }
    }

    // Primary signal: Slack channel chatter bound to this meeting.
    if (slackMessages.length > 0) {
      contextParts.push(`\n=== RECENT SLACK MESSAGES IN BOUND CHANNELS ===`)
      for (const msg of slackMessages.slice(0, 18)) {
        const date = new Date(msg.message_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const channel = msg.channel_name ? `#${msg.channel_name}` : 'channel'
        const sender = msg.sender_name ?? 'unknown'
        const preview = msg.content.length > 280 ? msg.content.slice(0, 280) + '...' : msg.content
        contextParts.push(`  - [${date}] ${sender} in ${channel}: "${preview}"`)
      }
    }

    // Open action items carried into this meeting.
    if (pendingActions.length > 0) {
      contextParts.push(`\nOpen action items from previous "${subject}" meetings:`)
      pendingActions.forEach(a => {
        const who = a.owner === 'me'
          ? 'me'
          : (a.member_id ? (memberById.get(a.member_id)?.name ?? 'a participant') : 'a participant')
        const dueLabel = a.due_date ? ` [due ${a.due_date}]` : ''
        contextParts.push(`  - (${who}) ${a.text}${dueLabel}`)
      })
      dataSources.push('actions')
    }

    // Team work context (shared deliverables).
    if (quarterlyPriorities.length > 0) {
      contextParts.push(`\n=== THIS QUARTER'S PRIORITIES (team work — reference where this meeting's subject connects) ===`)
      quarterlyPriorities.forEach((p, i) =>
        contextParts.push(`  ${i + 1}. ${p.title}${p.description ? ` — ${p.description}` : ''} [${p.status}]`)
      )
      dataSources.push('commitments')
    }
    if (monthlyCommitments.length > 0) {
      contextParts.push(`\n=== THIS MONTH'S COMMITMENTS (team work) ===`)
      monthlyCommitments.forEach((c, i) =>
        contextParts.push(`  ${i + 1}. ${c.title}${c.description ? ` — ${c.description}` : ''} [${c.status}]`)
      )
    }

    const systemPrompt = `You are a chief of staff assistant preparing a brief for a recurring GROUP meeting centered on a shared subject. Generate a concise, actionable shared agenda in Markdown.

This is NOT a 1:1 — it is a multi-person meeting about "${subject}". The brief should serve the whole room: a shared agenda, decisions to make, blockers to resolve, and follow-ups. Reference specific participants by name when an item is theirs, but frame topics around the subject and the group's collective work.

SOURCE DISCIPLINE:
- Sections marked "=== RECENT ... ===" are primary signal (recordings, Slack in bound channels). Every talking point should be traceable to something concrete here, to an open action item, or to a participant's stated accountabilities. Quote directly where useful.
- Team-work sections (priorities/commitments) are shared deliverables — use them to frame progress and blockers, but don't assert a specific person owns something without evidence.
- If there is little primary signal, restrict the brief to open action items, participants' accountabilities, and the relevant team-work items. Do not invent content.

Output structure:
- Use ## headings for each topic section (NOT # — skip H1)
- Under each heading, use bullet points (- ) for specific items
- 3-6 topic sections, each with 2-4 bullets
- Order: blockers and decisions needed first, then status/alignment, then follow-ups
- If there are open action items, include a "Follow up on open items" section noting who owns each
- Be direct and specific — no filler or generic facilitation advice`

    const userPrompt = `Prepare a group meeting brief for "${subject}".

${contextParts.join('\n')}`

    // ── Call Claude ──────────────────────────────────────────────────────────

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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

    // ── Store result ──────────────────────────────────────────────────────────

    const { data: upserted, error: upsertErr } = await supabase
      .from('cos_one_on_one_prep')
      .upsert({
        user_id: userId,
        group_meeting_id: group_meeting_id,
        prep_date: todayDate,
        content: generatedContent,
        source: 'ai_generated',
        generated_at: new Date().toISOString(),
        data_sources_used: dataSources,
        status: 'ready',
      }, {
        onConflict: 'user_id,group_meeting_id,prep_date,source',
      })
      .select('id')
      .single()

    if (upsertErr) {
      return jsonResponse({ error: 'storage_failed', detail: upsertErr.message }, 500)
    }

    await supabase.from('prep_generation_log').insert({
      user_id: userId,
      group_meeting_id: group_meeting_id,
      prep_id: upserted?.id ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: 'claude-sonnet-4-6',
      duration_ms: Date.now() - startMs,
      data_sources_used: dataSources,
    })

    // Mark the surfaced group actions so they're not re-flagged as forgotten.
    if (pendingActions.length > 0) {
      await supabase
        .from('cos_meeting_actions')
        .update({ last_surfaced_at: todayDate })
        .eq('user_id', userId)
        .eq('group_meeting_id', group_meeting_id)
        .eq('status', 'pending')
    }

    // Fire-and-forget: update living relationship document for this group meeting
    fetch(`${supabaseUrl}/functions/v1/consolidate-relationship-doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ user_id: userId, group_meeting_id }),
    }).catch(() => {})

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
    const errMsg = (error as Error).message ?? String(error)
    return jsonResponse({ error: 'generation_failed', detail: errMsg }, 500)
  }
})
