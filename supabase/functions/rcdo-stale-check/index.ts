import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { retryWithBackoff } from '../_shared/retryWithBackoff.ts'
import { isCheckinStale, isMetricStale, isNudgeThrottled } from '../_shared/rcdoStaleness.ts'

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

function appOrigin(): string {
  return Deno.env.get('APP_ORIGIN') || 'https://app.tacticalsync.com'
}

// Same shape as agent-tick's NotificationPreferences — RCDO staleness alerts
// are a new, independent notification type, so this only needs the one key
// this function actually reads (all others default true and are ignored
// here). See src/hooks/useNotificationPreferences.ts for the full blob.
interface RcdoNotificationPrefs {
  rcdo_stale_alerts?: boolean
}

/**
 * Sends a Slack DM using the user's stored Slack credentials. Deliberately
 * mirrors sendSlackDM() in supabase/functions/agent-tick/index.ts rather than
 * importing it — agent-tick doesn't export it, and duplicating ~40 lines here
 * is a smaller, safer footprint than refactoring that 2000+ line function's
 * internals to share it. Keep the two in sync if Slack delivery logic changes.
 */
async function sendSlackDM(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  text: string,
  blocks?: unknown[],
): Promise<boolean> {
  const { data: slackCreds } = await supabase
    .from('user_slack_credentials')
    .select('access_token, slack_user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!slackCreds?.access_token || !slackCreds?.slack_user_id) {
    return false
  }

  const openRes = await retryWithBackoff(
    () => fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackCreds.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackCreds.slack_user_id }),
    }),
    { integration: 'slack', label: 'conversations.open' },
  )

  const openData = await openRes.json() as { ok: boolean; channel?: { id: string } }
  if (!openData.ok || !openData.channel?.id) {
    return false
  }

  const msgBody: Record<string, unknown> = { channel: openData.channel.id, text }
  if (blocks) msgBody.blocks = blocks

  const msgRes = await retryWithBackoff(
    () => fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackCreds.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(msgBody),
    }),
    { integration: 'slack', label: 'chat.postMessage' },
  )

  const msgData = await msgRes.json() as { ok: boolean }
  return msgData.ok
}

type StaleKind = 'do' | 'si' | 'metric'

interface StaleItem {
  kind: StaleKind
  id: string
  table: 'rc_defining_objectives' | 'rc_strategic_initiatives' | 'rc_do_metrics'
  title: string
  ownerId: string
  daysStale: number
  /** DO id, for building a link — SIs/metrics don't have their own detail
   *  route for metrics, so metric nudges link to the parent DO page. */
  linkDoId: string
}

function itemUrl(item: StaleItem): string {
  if (item.kind === 'si') return `${appOrigin()}/rcdo/detail/si/${item.id}`
  return `${appOrigin()}/rcdo/detail/do/${item.linkDoId}`
}

function kindEmoji(kind: StaleKind): string {
  if (kind === 'do') return ':dart:'
  if (kind === 'si') return ':compass:'
  return ':bar_chart:'
}

function kindLabel(kind: StaleKind): string {
  if (kind === 'do') return 'Defining Objective'
  if (kind === 'si') return 'Strategic Initiative'
  return 'Metric'
}

/**
 * RCDO stale-item check: Slack-DMs the owner of any Defining Objective,
 * Strategic Initiative, or DO metric that has gone quiet for too long inside
 * the currently active cycle.
 *
 * This is deliberately its own scheduled function rather than a new check
 * folded into agent-tick's per-user loop: agent-tick only iterates over
 * `cos_settings` rows where `agent_config.enabled === true` (the Chief-of-
 * Staff automation opt-in), which has nothing to do with RCDO ownership — an
 * objective's owner may never have turned on the CoS agent at all. Gating a
 * standalone strategy-planning feature behind an unrelated opt-in would
 * silently drop most owners. This instead follows the simpler, already-
 * established "global sweep" shape used by inbox-unsnooze-sweep/index.ts:
 * one top-to-bottom pass, no per-user config loop, called on its own cron.
 *
 * Notification delivery (Slack DM via sendSlackDM, gated on the owner's own
 * `cos_settings.notification_preferences.rcdo_stale_alerts`) reuses the exact
 * pattern agent-tick already established, per the task's own direction —
 * only the outer loop shape differs.
 *
 * Staleness definitions and the re-nudge cooldown live in
 * ../_shared/rcdoStaleness.ts; see that file's header comment for the
 * reasoning behind the specific thresholds.
 *
 * Scheduled daily (see 20260729000009_rcdo_stale_check_cron.sql) — staleness
 * is measured in weeks, so unlike agent-tick's 30-minute tick there's no
 * value in checking more often than once a day.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Same auth convention as agent-tick: pg_cron posts with no Authorization
    // header, so only reject a present-but-wrong token. verify_jwt = false.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token && token !== serviceRoleKey) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const now = Date.now()

    // ── Scope: only the currently active cycle(s) ───────────────────────────
    const { data: activeCycles, error: cyclesErr } = await supabase
      .from('rc_cycles')
      .select('id')
      .eq('status', 'active')

    if (cyclesErr) throw cyclesErr
    if (!activeCycles || activeCycles.length === 0) {
      return jsonResponse({ message: 'no_active_cycle', processed: 0 }, 200)
    }

    const cycleIds = activeCycles.map((c: { id: string }) => c.id)

    const { data: rallyingCries, error: rcErr } = await supabase
      .from('rc_rallying_cries')
      .select('id')
      .in('cycle_id', cycleIds)

    if (rcErr) throw rcErr
    const rcIds = (rallyingCries ?? []).map((r: { id: string }) => r.id)
    if (rcIds.length === 0) {
      return jsonResponse({ message: 'no_rallying_cries', processed: 0 }, 200)
    }

    // ── Defining Objectives in scope ─────────────────────────────────────────
    // Exclude 'draft' (not yet committed — nothing to check in on yet) and
    // 'done' (finished). Deliberately does NOT exclude 'locked' DOs: per this
    // codebase's as-built lifecycle (Draft -> Lock -> Link execution ->
    // Check-ins), most of the check-in activity this feature cares about
    // happens *after* a DO is locked, so excluding locked DOs would make the
    // feature flag almost nothing.
    const { data: dos, error: doErr } = await supabase
      .from('rc_defining_objectives')
      .select('id, title, owner_user_id, status, created_at, last_stale_nudge_at')
      .in('rallying_cry_id', rcIds)
      .not('status', 'in', '(draft,done)')

    if (doErr) throw doErr
    const doList = (dos ?? []) as Array<{
      id: string; title: string; owner_user_id: string; status: string
      created_at: string; last_stale_nudge_at: string | null
    }>
    const doIds = doList.map((d) => d.id)
    const doOwnerById = new Map(doList.map((d) => [d.id, d.owner_user_id]))
    const doTitleById = new Map(doList.map((d) => [d.id, d.title]))

    // ── Strategic Initiatives in scope ───────────────────────────────────────
    // rc_strategic_initiatives.status values were migrated in
    // 20251122062000_update_si_status_values.sql to
    // ('not_started','on_track','at_risk','off_track','completed') — 'draft'/
    // 'done' (the *original* enum) no longer exist for this table. Exclude
    // 'not_started' (SI's equivalent of a DO's 'draft' — nothing has begun
    // yet) and 'completed'.
    let siList: Array<{
      id: string; title: string; owner_user_id: string; defining_objective_id: string
      status: string; created_at: string; last_stale_nudge_at: string | null
    }> = []
    if (doIds.length > 0) {
      const { data: sis, error: siErr } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, owner_user_id, defining_objective_id, status, created_at, last_stale_nudge_at')
        .in('defining_objective_id', doIds)
        .not('status', 'in', '(not_started,completed)')

      if (siErr) throw siErr
      siList = (sis ?? []) as typeof siList
    }

    // ── DO Metrics in scope (only for in-scope DOs, so already excludes
    //    metrics under draft/done objectives) ────────────────────────────────
    let metricList: Array<{
      id: string; name: string; defining_objective_id: string
      last_updated_at: string | null; created_at: string; last_stale_nudge_at: string | null
    }> = []
    if (doIds.length > 0) {
      const { data: metrics, error: metricErr } = await supabase
        .from('rc_do_metrics')
        .select('id, name, defining_objective_id, last_updated_at, created_at, last_stale_nudge_at')
        .in('defining_objective_id', doIds)

      if (metricErr) throw metricErr
      metricList = (metrics ?? []) as typeof metricList
    }

    // ── Latest check-in per DO / SI ──────────────────────────────────────────
    const siIds = siList.map((s) => s.id)
    const latestCheckinByParent = new Map<string, string>()

    if (doIds.length > 0) {
      const { data: doCheckins } = await supabase
        .from('rc_checkins')
        .select('parent_id, date')
        .eq('parent_type', 'do')
        .in('parent_id', doIds)
        .order('date', { ascending: false })
      for (const c of (doCheckins ?? []) as Array<{ parent_id: string; date: string }>) {
        if (!latestCheckinByParent.has(c.parent_id)) latestCheckinByParent.set(c.parent_id, c.date)
      }
    }
    if (siIds.length > 0) {
      const { data: siCheckins } = await supabase
        .from('rc_checkins')
        .select('parent_id, date')
        .eq('parent_type', 'initiative')
        .in('parent_id', siIds)
        .order('date', { ascending: false })
      for (const c of (siCheckins ?? []) as Array<{ parent_id: string; date: string }>) {
        if (!latestCheckinByParent.has(c.parent_id)) latestCheckinByParent.set(c.parent_id, c.date)
      }
    }

    // ── Determine staleness ───────────────────────────────────────────────
    const staleItems: StaleItem[] = []

    for (const d of doList) {
      if (isCheckinStale({ latestCheckinDate: latestCheckinByParent.get(d.id) ?? null, createdAt: d.created_at }, now)) {
        staleItems.push({
          kind: 'do', id: d.id, table: 'rc_defining_objectives', title: d.title,
          ownerId: d.owner_user_id, linkDoId: d.id,
          daysStale: Math.floor((now - new Date(latestCheckinByParent.get(d.id) ?? d.created_at).getTime()) / 86_400_000),
        })
      }
    }

    for (const s of siList) {
      if (isCheckinStale({ latestCheckinDate: latestCheckinByParent.get(s.id) ?? null, createdAt: s.created_at }, now)) {
        staleItems.push({
          kind: 'si', id: s.id, table: 'rc_strategic_initiatives', title: s.title,
          ownerId: s.owner_user_id, linkDoId: s.defining_objective_id,
          daysStale: Math.floor((now - new Date(latestCheckinByParent.get(s.id) ?? s.created_at).getTime()) / 86_400_000),
        })
      }
    }

    for (const m of metricList) {
      if (isMetricStale({ lastUpdatedAt: m.last_updated_at, createdAt: m.created_at }, now)) {
        const ownerId = doOwnerById.get(m.defining_objective_id)
        if (!ownerId) continue // orphaned metric row — shouldn't happen, skip defensively
        staleItems.push({
          kind: 'metric', id: m.id, table: 'rc_do_metrics',
          title: `${m.name} (${doTitleById.get(m.defining_objective_id) ?? 'DO'})`,
          ownerId, linkDoId: m.defining_objective_id,
          daysStale: Math.floor((now - new Date(m.last_updated_at ?? m.created_at).getTime()) / 86_400_000),
        })
      }
    }

    // ── Throttle: skip items nudged within the cooldown window ───────────────
    const lastNudgedById = new Map<string, string | null>([
      ...doList.map((d): [string, string | null] => [d.id, d.last_stale_nudge_at]),
      ...siList.map((s): [string, string | null] => [s.id, s.last_stale_nudge_at]),
      ...metricList.map((m): [string, string | null] => [m.id, m.last_stale_nudge_at]),
    ])

    const toNotify = staleItems.filter((item) => !isNudgeThrottled(lastNudgedById.get(item.id) ?? null, now))

    if (toNotify.length === 0) {
      return jsonResponse({ processed: 0, stale_found: staleItems.length, throttled: staleItems.length }, 200)
    }

    // ── Group by owner and respect notification_preferences ─────────────────
    const byOwner = new Map<string, StaleItem[]>()
    for (const item of toNotify) {
      const list = byOwner.get(item.ownerId) ?? []
      list.push(item)
      byOwner.set(item.ownerId, list)
    }

    const ownerIds = [...byOwner.keys()]
    const { data: settingsRows } = await supabase
      .from('cos_settings')
      .select('user_id, notification_preferences')
      .in('user_id', ownerIds)

    const prefsByOwner = new Map(
      (settingsRows ?? []).map((r: { user_id: string; notification_preferences: unknown }) => [
        r.user_id,
        (r.notification_preferences as RcdoNotificationPrefs | null) ?? {},
      ]),
    )

    let nudgedCount = 0
    const nudgedIdsByTable: Record<StaleItem['table'], string[]> = {
      rc_defining_objectives: [], rc_strategic_initiatives: [], rc_do_metrics: [],
    }

    for (const [ownerId, items] of byOwner) {
      const prefs = prefsByOwner.get(ownerId) ?? {}
      // Default true, same as every other notification_preferences key
      // (see 20260721000002_notification_preferences.sql) — off only if the
      // owner explicitly turned it off.
      if (prefs.rcdo_stale_alerts === false) continue

      const blocks: unknown[] = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:hourglass_flowing_sand: *RCDO staleness check* — ${items.length} item${items.length === 1 ? '' : 's'} without a recent update`,
          },
        },
        { type: 'divider' },
        ...items.map((item) => ({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${kindEmoji(item.kind)} *${kindLabel(item.kind)}: ${item.title}*\nNo update in ${item.daysStale} days`,
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'View' },
            url: itemUrl(item),
          },
        })),
      ]

      // Mirrors agent-tick's own daily-digest precedent: mark as nudged once
      // the send is attempted, regardless of sendSlackDM's return value (e.g.
      // Slack not connected). The throttle exists to avoid repeat Slack spam,
      // not to guarantee delivery — a still-unconnected owner will simply
      // keep missing every digest until they connect Slack, same as today.
      await sendSlackDM(
        supabase,
        ownerId,
        `${items.length} RCDO item(s) need a check-in or metric update`,
        blocks,
      )

      for (const item of items) {
        nudgedIdsByTable[item.table].push(item.id)
        nudgedCount++
      }

      await supabase.from('cos_agent_log').insert({
        user_id: ownerId,
        event_type: 'rcdo_stale_nudge_sent',
        payload: {
          items: items.map((i) => ({ kind: i.kind, id: i.id, title: i.title, days_stale: i.daysStale })),
        },
      })
    }

    // ── Persist the throttle marker for everything actually nudged ───────────
    const nowIso = new Date(now).toISOString()
    for (const [table, ids] of Object.entries(nudgedIdsByTable) as Array<[StaleItem['table'], string[]]>) {
      if (ids.length === 0) continue
      await supabase.from(table).update({ last_stale_nudge_at: nowIso }).in('id', ids)
    }

    return jsonResponse({
      processed: nudgedCount,
      owners_notified: byOwner.size,
      stale_found: staleItems.length,
      throttled: staleItems.length - toNotify.length,
    }, 200)
  } catch (error) {
    console.error('rcdo-stale-check failed', error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
