/**
 * consolidate-relationship-doc
 *
 * Builds and maintains an auto-accumulating relationship brief per team member
 * or group meeting. Called fire-and-forget from generate-1on1-prep and
 * generate-group-brief after a new prep is saved.
 *
 * POST { user_id, team_member_id?, group_meeting_id? }
 * → { ok: true, version_count: number }
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!

    if (!anthropicApiKey) return json({ error: 'anthropic_api_key_not_configured' }, 500)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json() as {
      user_id: string
      team_member_id?: string
      group_meeting_id?: string
    }
    const { user_id, team_member_id, group_meeting_id } = body

    if (!user_id || (!team_member_id && !group_meeting_id)) {
      return json({ error: 'user_id and one of team_member_id or group_meeting_id required' }, 400)
    }

    const isGroupMode = !!group_meeting_id

    // ── Fetch existing document (empty string if first run) ───────────────
    const docQuery = isGroupMode
      ? supabase.from('cos_relationship_documents').select('id, content, version_count, last_updated_at')
          .eq('user_id', user_id).eq('group_meeting_id', group_meeting_id).maybeSingle()
      : supabase.from('cos_relationship_documents').select('id, content, version_count, last_updated_at')
          .eq('user_id', user_id).eq('team_member_id', team_member_id!).maybeSingle()

    const { data: existingDoc } = await docQuery
    const existingContent = existingDoc?.content ?? ''
    const lastUpdatedAt = existingDoc?.last_updated_at ?? new Date(0).toISOString()

    // ── Fetch name for the brief ──────────────────────────────────────────
    let subjectName = 'this contact'
    if (!isGroupMode) {
      const { data: memberRow } = await supabase
        .from('cos_team_members')
        .select('name')
        .eq('id', team_member_id!)
        .eq('user_id', user_id)
        .maybeSingle()
      if (memberRow) subjectName = memberRow.name
    } else {
      const { data: groupRow } = await supabase
        .from('cos_group_meetings')
        .select('title')
        .eq('id', group_meeting_id!)
        .eq('user_id', user_id)
        .maybeSingle()
      if (groupRow) subjectName = groupRow.title
    }

    // ── Fetch new signals since last_updated_at ───────────────────────────
    // Recent prep notes
    const prepsQuery = isGroupMode
      ? supabase.from('cos_one_on_one_prep').select('content, prep_date')
          .eq('user_id', user_id).eq('group_meeting_id', group_meeting_id!)
          .eq('status', 'ready').gte('generated_at', lastUpdatedAt)
          .order('prep_date', { ascending: false }).limit(3)
      : supabase.from('cos_one_on_one_prep').select('content, prep_date')
          .eq('user_id', user_id).eq('team_member_id', team_member_id!)
          .eq('status', 'ready').gte('generated_at', lastUpdatedAt)
          .order('prep_date', { ascending: false }).limit(3)

    // Recent Zoom recordings with summaries
    const zoomQuery = isGroupMode
      ? supabase.from('cos_zoom_recordings').select('topic, start_time, ai_summary, duration_minutes')
          .eq('user_id', user_id).eq('group_meeting_id', group_meeting_id!)
          .not('ai_summary', 'is', null).order('start_time', { ascending: false }).limit(5)
      : supabase.from('cos_zoom_recordings').select('topic, start_time, ai_summary, duration_minutes')
          .eq('user_id', user_id).eq('team_member_id', team_member_id!)
          .not('ai_summary', 'is', null).order('start_time', { ascending: false }).limit(5)

    // Action items
    const actionsQuery = isGroupMode
      ? supabase.from('cos_meeting_actions').select('text, status, created_at, due_date')
          .eq('user_id', user_id).eq('group_meeting_id', group_meeting_id!)
          .order('created_at', { ascending: false }).limit(30)
      : supabase.from('cos_meeting_actions').select('text, status, created_at, due_date')
          .eq('user_id', user_id).eq('member_id', team_member_id!)
          .order('created_at', { ascending: false }).limit(30)

    // Relationship topics
    const topicsQuery = isGroupMode
      ? supabase.from('cos_relationship_topics').select('topic, category, sentiment, mention_count, status')
          .eq('user_id', user_id).eq('group_meeting_id', group_meeting_id!)
          .order('mention_count', { ascending: false }).limit(20)
      : supabase.from('cos_relationship_topics').select('topic, category, sentiment, mention_count, status')
          .eq('user_id', user_id).eq('team_member_id', team_member_id!)
          .order('mention_count', { ascending: false }).limit(20)

    const [prepsRes, zoomRes, actionsRes, topicsRes] = await Promise.all([
      prepsQuery, zoomQuery, actionsQuery, topicsQuery,
    ])

    const preps = prepsRes.data ?? []
    const zoomRecs = zoomRes.data ?? []
    const actions = actionsRes.data ?? []
    const topics = topicsRes.data ?? []

    // If no new signals and existing doc is populated, skip (save tokens)
    if (preps.length === 0 && zoomRecs.length === 0 && existingContent.length > 0 && topics.length === 0) {
      return json({ ok: true, version_count: existingDoc?.version_count ?? 0, skipped: true })
    }

    // ── Build consolidation prompt ────────────────────────────────────────
    const sections: string[] = []

    if (preps.length > 0) {
      sections.push(`PREP NOTES:`)
      preps.forEach(p => {
        const preview = p.content.length > 600 ? p.content.slice(0, 600) + '...' : p.content
        sections.push(`[${p.prep_date}]\n${preview}`)
      })
    }

    if (zoomRecs.length > 0) {
      sections.push(`\nMEETING SUMMARIES & TRANSCRIPTS:`)
      zoomRecs.forEach(r => {
        const date = r.start_time.slice(0, 10)
        sections.push(`[${date}] ${r.topic ?? 'Meeting'} (${r.duration_minutes ?? '?'} min):\n${r.ai_summary}`)
      })
    }

    if (actions.length > 0) {
      const pending = actions.filter(a => a.status === 'pending')
      const done = actions.filter(a => a.status === 'done')
      if (pending.length > 0) {
        sections.push(`\nOPEN ACTION ITEMS / TO-DOS:`)
        pending.forEach(a => {
          const due = a.due_date ? ` (due ${a.due_date})` : ''
          sections.push(`- ${a.text}${due}`)
        })
      }
      if (done.length > 0) {
        sections.push(`\nCOMPLETED ACTION ITEMS:`)
        done.slice(0, 10).forEach(a => sections.push(`- ${a.text}`))
      }
    }

    if (topics.length > 0) {
      sections.push(`\nRECURRING TOPICS:`)
      topics.forEach(t => {
        const statusLabel = t.status === 'resolved' ? ' ✓' : t.status === 'stale' ? ' ⚠' : ''
        sections.push(`- ${t.topic} [${t.category}, ${t.sentiment}] mentioned ${t.mention_count}x${statusLabel}`)
      })
    }

    const newSignals = sections.join('\n')

    const existingSection = existingContent
      ? `EXISTING BRIEF (synthesize and update — do not repeat verbatim):\n${existingContent}\n\n`
      : ''

    const prompt = `${existingSection}NEW SIGNALS SINCE LAST UPDATE (${new Date().toISOString().slice(0, 10)}):
${newSignals || '(No new signals — refresh the existing brief if present)'}

Update the relationship brief for "${subjectName}". Keep it concise (max 800 words). Use markdown. Format:
## About ${subjectName}
## Current Priorities
## Open Commitments & To-Dos
## Decisions Made
## Open Questions
## Relationship Notes
## Recent Themes`

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const updatedContent = (message.content[0] as { type: string; text: string }).text.trim()
    const newVersionCount = (existingDoc?.version_count ?? 0) + 1

    // ── Upsert back ───────────────────────────────────────────────────────
    const upsertData = {
      user_id,
      team_member_id: team_member_id ?? null,
      group_meeting_id: group_meeting_id ?? null,
      content: updatedContent,
      version_count: newVersionCount,
      last_updated_at: new Date().toISOString(),
    }

    if (existingDoc?.id) {
      await supabase.from('cos_relationship_documents')
        .update({ content: updatedContent, version_count: newVersionCount, last_updated_at: new Date().toISOString() })
        .eq('id', existingDoc.id)
    } else {
      await supabase.from('cos_relationship_documents').insert(upsertData)
    }

    return json({ ok: true, version_count: newVersionCount })

  } catch (err) {
    console.error('consolidate-relationship-doc error:', err)
    return json({ error: String(err) }, 500)
  }
})
