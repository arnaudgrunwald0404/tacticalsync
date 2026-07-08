/**
 * generate-person-brief
 *
 * Idea #7 (Relationship memory) — pre-1:1 brief generation.
 * See PLAN_idea7_relationship_memory.md §3.2, §3.3.
 *
 * Called from agent-tick's prestageInboxBriefs() branch (service-role auth,
 * same pattern as agent-tick → generate-1on1-prep). Not called directly by
 * the client.
 *
 * Assembles: open inbox_items tagged to the person (both directions, via a
 * simple heuristic — see below), what changed since the last 1:1
 * (cos_relationship_topics mentioned since last_1on1_date), and forgotten
 * commitments (cos_forgotten_commitments). Asks Claude for 3 suggested
 * talking points grounded in that data, then idempotently upserts a
 * `brief_item` inbox row, mirroring useInboxItems.syncBriefItem's
 * source_ref-keyed upsert but done server-side since this has no client
 * session.
 *
 * POST { user_id, member_id, event_id, meeting_time }
 * → { ok: true, created: boolean, inbox_item_id: string }
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

interface PersonBriefOpenItem {
  inbox_item_id: string
  text: string
  owed_by: 'me' | 'them'
}

interface PersonBriefTalkingPoint {
  text: string
  from?: string
}

// Minimum signal required before generating a brief at all — below this,
// per PLAN §6/§7a.1's cold-start guidance, a brief would be near-empty and
// train users to ignore brief_item rows. Tunable; kept low deliberately
// since even one open item + one topic is a meaningful brief.
const MIN_SIGNAL_THRESHOLD = 1

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json() as {
      user_id: string
      member_id: string
      event_id?: string
      meeting_time: string
    }
    const { user_id, member_id, event_id, meeting_time } = body

    if (!user_id || !member_id || !meeting_time) {
      return json({ error: 'user_id, member_id, and meeting_time are required' }, 400)
    }

    // ── Idempotency: one brief per (user, member, meeting) ──────────────────
    // Mirrors useInboxItems.syncBriefItem's source_ref-keyed dedup, done
    // server-side. Keying on event_id when present (stable per calendar
    // occurrence) and falling back to a date+member key otherwise.
    const dedupeId = event_id ?? `${member_id}:${meeting_time.slice(0, 10)}`
    const { data: existingItem } = await supabase
      .from('inbox_items')
      .select('id')
      .eq('user_id', user_id)
      .eq('type', 'brief_item')
      .contains('source_ref', { type: 'pre_1on1_brief', id: dedupeId })
      .maybeSingle()

    if (existingItem) {
      return json({ ok: true, created: false, inbox_item_id: existingItem.id, skipped: 'already_exists' })
    }

    // ── Fetch member + person tag (needed to attach the brief to the person tag) ──
    const [memberRes, personTagRes] = await Promise.all([
      supabase.from('cos_team_members')
        .select('name, last_1on1_date')
        .eq('id', member_id)
        .eq('user_id', user_id)
        .single(),
      supabase.from('inbox_tags')
        .select('id')
        .eq('user_id', user_id)
        .eq('type', 'person')
        .eq('member_id', member_id)
        .maybeSingle(),
    ])

    if (memberRes.error || !memberRes.data) {
      return json({ error: 'member_not_found' }, 404)
    }
    const memberName = memberRes.data.name as string
    const lastOneOnOneDate = memberRes.data.last_1on1_date as string | null
    const personTagId = personTagRes.data?.id as string | undefined

    // ── Gather signal ────────────────────────────────────────────────────────
    const [openItemsRes, topicsRes, commitmentsRes] = await Promise.all([
      // Open inbox items tagged to this person. "Both directions" is
      // approximated by inbox_item_tags membership (this repo's inbox_items
      // has no owner/counterparty field yet) — every open item tagged to the
      // person is treated as "mine" since the user is the one who tagged it;
      // see the PersonBriefOpenItem.owed_by note below.
      personTagId
        ? supabase
            .from('inbox_item_tags')
            .select('inbox_items(id, text, status)')
            .eq('tag_id', personTagId)
        : Promise.resolve({ data: [] as Array<{ inbox_items: { id: string; text: string; status: string } | null }> }),
      supabase
        .from('cos_relationship_topics')
        .select('topic, category, sentiment, mention_count, status, last_mentioned_at')
        .eq('user_id', user_id)
        .eq('team_member_id', member_id)
        .order('last_mentioned_at', { ascending: false })
        .limit(20),
      supabase
        .from('cos_forgotten_commitments')
        .select('text, due_date, days_pending, urgency')
        .eq('user_id', user_id)
        .eq('member_id', member_id),
    ])

    const openItemRows = ((openItemsRes.data ?? []) as Array<{ inbox_items: { id: string; text: string; status: string } | null }>)
      .map(r => r.inbox_items)
      .filter((i): i is { id: string; text: string; status: string } => !!i && i.status === 'open')

    const topics = (topicsRes.data ?? []) as Array<{
      topic: string; category: string; sentiment: string; mention_count: number
      status: string; last_mentioned_at: string
    }>
    const commitments = (commitmentsRes.data ?? []) as Array<{
      text: string; due_date: string | null; days_pending: number; urgency: string
    }>

    // "What changed since last time": topics mentioned after the last 1:1.
    const changesSinceLast = lastOneOnOneDate
      ? topics.filter(t => t.last_mentioned_at > lastOneOnOneDate)
      : topics.slice(0, 5)

    const totalSignal = openItemRows.length + topics.length + commitments.length
    if (totalSignal < MIN_SIGNAL_THRESHOLD) {
      return json({ ok: true, created: false, skipped: 'below_signal_threshold' })
    }

    // ── Open items both directions ──────────────────────────────────────────
    // See note above: without a stored owed_by field on inbox_items, every
    // tagged open item is attributed to "me" (the user tracking it) and
    // forgotten commitments (which already represent things owed *to* this
    // person, per cos_meeting_actions) are attributed to "them" as a proxy
    // for the other direction. This is a known approximation, not a full
    // bidirectional model — flagged in the PLAN as a §5c follow-up
    // (an explicit owed_by convention) once real usage shows it's needed.
    const openItemsMine: PersonBriefOpenItem[] = openItemRows.map(i => ({
      inbox_item_id: i.id, text: i.text, owed_by: 'me',
    }))
    const openItemsTheirs: PersonBriefOpenItem[] = commitments.map(c => ({
      inbox_item_id: '', text: c.text, owed_by: 'them',
    }))

    // ── Ask Claude for 3 talking points grounded in the above ───────────────
    let talkingPoints: PersonBriefTalkingPoint[] = []
    if (anthropicApiKey) {
      try {
        const contextLines: string[] = []
        if (openItemsMine.length > 0) {
          contextLines.push('OPEN ITEMS (tracked by the user, tagged to this person):')
          openItemsMine.forEach(i => contextLines.push(`- ${i.text}`))
        }
        if (openItemsTheirs.length > 0) {
          contextLines.push('\nOVERDUE / FORGOTTEN COMMITMENTS:')
          openItemsTheirs.forEach(i => contextLines.push(`- ${i.text}`))
        }
        if (changesSinceLast.length > 0) {
          contextLines.push('\nTOPICS MENTIONED SINCE LAST 1:1:')
          changesSinceLast.forEach(t => contextLines.push(`- ${t.topic} [${t.category}, ${t.sentiment}]`))
        }

        const prompt = `You are helping a manager prepare for a 1:1 with ${memberName}. Based ONLY on the data below, suggest exactly 3 concise talking points (max 20 words each) grounded in specific items — do not invent anything not in the data. Respond as a JSON array of objects: [{"text": "...", "from": "short pointer to the source item"}].

${contextLines.join('\n') || '(No prior history — this may be an early 1:1.)'}`

        const anthropic = new Anthropic({ apiKey: anthropicApiKey })
        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        })

        const raw = (message.content[0] as { type: string; text: string }).text.trim()
        const jsonMatch = raw.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{ text: string; from?: string }>
          talkingPoints = parsed.slice(0, 3).map(p => ({ text: p.text, from: p.from }))
        }
      } catch (err) {
        console.warn('generate-person-brief: talking point generation failed:', (err as Error).message)
        // Non-fatal — a brief with no talking points (but real open items /
        // changes) is still more useful than skipping entirely.
      }
    }

    // ── Compose the inbox item text + payload ───────────────────────────────
    const summaryText = `1:1 brief: ${memberName}`
    const payload = {
      rationale: `Auto-generated ahead of your 1:1 with ${memberName}`,
      person_brief: {
        member_id,
        member_name: memberName,
        meeting_time,
        open_items_mine: openItemsMine,
        open_items_theirs: openItemsTheirs,
        changes_since_last: changesSinceLast.map(t => t.topic),
        talking_points: talkingPoints,
      },
    }
    const sourceRef = { type: 'pre_1on1_brief', id: dedupeId }

    const { data: inserted, error: insertErr } = await supabase
      .from('inbox_items')
      .insert({
        user_id,
        type: 'brief_item',
        text: summaryText,
        status: 'open',
        bucket: 'now',
        agent_payload: payload,
        source_ref: sourceRef,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      return json({ error: 'insert_failed', detail: insertErr?.message }, 500)
    }

    if (personTagId) {
      await supabase.from('inbox_item_tags').insert({ item_id: inserted.id, tag_id: personTagId })
    }

    return json({ ok: true, created: true, inbox_item_id: inserted.id })
  } catch (err) {
    console.error('generate-person-brief error:', err)
    return json({ error: String(err) }, 500)
  }
})
