// Tool: create_meeting_topic
//
// Easiest of the plan's candidate tools (PLAN_idea6_delegation_v2.md §3) —
// meeting_instance_topics already exists and already has realtime
// subscriptions wired up elsewhere, so a plain insert is enough for the topic
// to show up live in the meeting UI.

import type { Tool, ToolContext, ToolExecutionResult } from './types.ts'

interface CreateMeetingTopicParams {
  series_id: string
  title: string
  notes?: string
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function isParams(v: Record<string, unknown>): v is CreateMeetingTopicParams & Record<string, unknown> {
  return typeof v.series_id === 'string' && typeof v.title === 'string'
}

/** Read-only lookup of the series name and its nearest upcoming instance — used both to enrich the approval-UI description and, again, at execution time in case things changed in between. */
async function resolveNextInstance(db: any, seriesId: string) {
  const { data: series } = await db
    .from('meeting_series')
    .select('id, name, team_id')
    .eq('id', seriesId)
    .maybeSingle()

  if (!series) return null

  const today = new Date().toISOString().slice(0, 10)
  const { data: instance } = await db
    .from('meeting_instances')
    .select('id, start_date')
    .eq('series_id', seriesId)
    .gte('start_date', today)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  return { seriesName: series.name as string, teamId: series.team_id as string, instance: instance as { id: string; start_date: string } | null }
}

export const createMeetingTopicTool: Tool = {
  name: 'create_meeting_topic',

  validateParams(params) {
    if (!isParams(params)) return 'series_id and title are required.'
    if (!UUID_RE.test(params.series_id)) return 'series_id must be a UUID.'
    if (!params.title.trim()) return 'title cannot be empty.'
    if (params.title.length > 200) return 'title is too long (max 200 characters).'
    if (params.notes !== undefined && typeof params.notes !== 'string') return 'notes must be a string.'
    return null
  },

  describe(params) {
    const p = params as unknown as CreateMeetingTopicParams & { resolved_series_name?: string; resolved_date?: string }
    if (p.resolved_series_name && p.resolved_date) {
      return `Add "${p.title}" as a topic to your next ${p.resolved_series_name} meeting on ${p.resolved_date}`
    }
    return `Add "${p.title}" as a topic to your next meeting`
  },

  async execute(ctx: ToolContext, params): Promise<ToolExecutionResult> {
    const db = ctx.db as any
    const p = params as unknown as CreateMeetingTopicParams

    const resolved = await resolveNextInstance(db, p.series_id)
    if (!resolved) {
      throw new Error('That meeting series no longer exists.')
    }
    if (!resolved.instance) {
      throw new Error(`No upcoming instance found for ${resolved.seriesName} — schedule the next occurrence first, then retry this step.`)
    }

    // Confirm the acting user actually belongs to this series' team — the
    // planning prompt is only ever given series the user has access to, but
    // this is re-checked at execution time since approval can happen well
    // after planning.
    const { data: membership } = await db
      .from('team_members')
      .select('id')
      .eq('team_id', resolved.teamId)
      .eq('user_id', ctx.userId)
      .maybeSingle()
    if (!membership) {
      throw new Error('You no longer have access to that meeting series.')
    }

    const { data: maxOrder } = await db
      .from('meeting_instance_topics')
      .select('order_index')
      .eq('instance_id', resolved.instance.id)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextOrder = ((maxOrder?.order_index as number | undefined) ?? -1) + 1

    const { data: topic, error } = await db
      .from('meeting_instance_topics')
      .insert({
        instance_id: resolved.instance.id,
        title: p.title,
        notes: p.notes ?? null,
        order_index: nextOrder,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !topic) {
      throw new Error(`Failed to create the meeting topic: ${error?.message ?? 'unknown error'}`)
    }

    return {
      result: { topic_id: topic.id, instance_id: resolved.instance.id, meeting_name: resolved.seriesName, date: resolved.instance.start_date },
      targetTable: 'meeting_instance_topics',
      targetId: topic.id as string,
    }
  },
}

export { resolveNextInstance }
