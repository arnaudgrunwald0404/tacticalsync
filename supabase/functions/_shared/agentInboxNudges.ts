// Pure decision logic for inbox agentic follow-through (PLAN_idea4_agentic_followthrough.md).
//
// Mirrored at src/lib/agentInboxNudges.ts, which is what the Vitest suite
// (src/test/lib/agentInboxNudges.test.ts) actually imports and exercises —
// this edge function can't import from src/, so the two copies are hand-kept
// in sync, matching the existing convention for
// supabase/functions/_shared/matchEventToMember.ts /
// src/lib/calendar/matchEventToMember.ts. Keep both files' logic identical;
// only comments are allowed to drift.
//
// Scope (per the plan, Section 6.B): self-owned items only. Nothing here ever
// resolves or contacts a Slack identity other than the inbox owner's own —
// that requires idea #8 (people delegation / cross-user account linking) and
// is out of scope until that lands.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InboxNudgeAgentConfig {
  enabled: boolean
  /** Master toggle for this feature. Off by default for pre-existing users
   *  — nudges never fire until a user has explicitly turned this on, either
   *  via Settings or the one-time opt-in prompt. */
  nudge_inbox_items: boolean
  nudge_timing_hours: number
  nudge_max_count: number
}

export interface DueInboxItem {
  id: string
  /** Only rows with priority_fixed = true are eligible — priority_due_at set
   *  via a tier pill is a decaying "gut feel" date, not a real deadline (see
   *  plan Section 3.1). Passing a non-fixed row is a caller bug, but the
   *  filter also defends against it directly. */
  priority_fixed: boolean
  priority_due_at: string | null // ISO timestamp
  status: 'open' | 'done' | 'archived' | 'snoozed'
}

export interface NudgeHistoryEntry {
  item_id: string
  event_type: 'inbox_due_nudge_sent' | 'inbox_due_nudge_capped' | 'inbox_nudge_sent' | 'inbox_nudge_capped'
  created_at: string // ISO timestamp
}

export interface DueNudgeDecision {
  toNudge: string[]
  newlyCapped: string[]
}

// ── Due-date nudge filtering (plan Section 3) ───────────────────────────────────

/**
 * Selects open, fixed-due-date items whose due date falls within the nudge
 * window, excluding anything already nudged today or already capped, and
 * separately reports items that just crossed the nudge_max_count ceiling
 * (analogous to nudgeActionItems()'s "newlyCapped" step in agent-tick).
 */
export function selectDueItemsToNudge(
  items: DueInboxItem[],
  history: NudgeHistoryEntry[],
  config: Pick<InboxNudgeAgentConfig, 'nudge_timing_hours' | 'nudge_max_count'>,
  now: Date = new Date(),
): DueNudgeDecision {
  const windowEndMs = now.getTime() + config.nudge_timing_hours * 3600 * 1000
  const todayKey = now.toISOString().slice(0, 10)

  const eligible = items.filter((item) => {
    if (item.status !== 'open') return false
    if (!item.priority_fixed) return false
    if (!item.priority_due_at) return false
    const dueMs = new Date(item.priority_due_at).getTime()
    if (Number.isNaN(dueMs)) return false
    return dueMs <= windowEndMs
  })

  const dueHistory = history.filter(
    (h) => h.event_type === 'inbox_due_nudge_sent' || h.event_type === 'inbox_due_nudge_capped',
  )

  const countByItem = new Map<string, number>()
  const cappedItems = new Set<string>()
  const nudgedToday = new Set<string>()

  for (const h of dueHistory) {
    if (h.event_type === 'inbox_due_nudge_capped') {
      cappedItems.add(h.item_id)
      continue
    }
    countByItem.set(h.item_id, (countByItem.get(h.item_id) ?? 0) + 1)
    if (h.created_at.slice(0, 10) === todayKey) nudgedToday.add(h.item_id)
  }

  const newlyCapped = eligible
    .filter((i) => !cappedItems.has(i.id) && (countByItem.get(i.id) ?? 0) >= config.nudge_max_count)
    .map((i) => i.id)

  const newlyCappedSet = new Set(newlyCapped)

  const toNudge = eligible
    .filter(
      (i) =>
        !nudgedToday.has(i.id) &&
        !cappedItems.has(i.id) &&
        !newlyCappedSet.has(i.id) &&
        (countByItem.get(i.id) ?? 0) < config.nudge_max_count,
    )
    .map((i) => i.id)

  return { toNudge, newlyCapped }
}

// ── Pre-1:1 nudge windowing (plan Section 2) ────────────────────────────────────

export interface UpcomingMeeting {
  eventId: string
  teamMemberId: string
  startTime: string // ISO timestamp
  status: 'confirmed' | 'cancelled' | 'tentative'
}

/**
 * Meetings eligible for a pre-1:1 inbox nudge: confirmed, starting within the
 * lookahead window (default 12h, matching prestagePreps()'s existing prep
 * window so the two features share one mental model — see plan Section 2.2),
 * and not already nudged today for this exact event.
 */
export function selectMeetingsForInboxNudge(
  meetings: UpcomingMeeting[],
  alreadyNudgedEventIds: string[],
  now: Date = new Date(),
  lookaheadHours = 12,
): UpcomingMeeting[] {
  const windowEndMs = now.getTime() + lookaheadHours * 3600 * 1000
  const alreadyNudged = new Set(alreadyNudgedEventIds)

  return meetings.filter((m) => {
    if (m.status !== 'confirmed') return false
    if (alreadyNudged.has(m.eventId)) return false
    const startMs = new Date(m.startTime).getTime()
    if (Number.isNaN(startMs)) return false
    return startMs >= now.getTime() && startMs <= windowEndMs
  })
}

// ── Opt-in gating (plan Section 5.1) ────────────────────────────────────────────

export interface OptInState {
  /** True once the user has explicitly flipped agent_config.nudge_inbox_items
   *  to true — via the one-time prompt's CTA or the Settings toggle. */
  nudgeInboxItemsEnabled: boolean
  /** Timestamp of the most recent 'inbox_agent_optin_prompt' log/item, if any
   *  was ever shown and dismissed without opting in. */
  lastDeclinedAt: string | null
  /** True if a not-yet-answered opt-in prompt item already exists (avoid
   *  creating a second one on every tick while the first is unanswered). */
  promptCurrentlyPending: boolean
}

/**
 * Decides what agent-tick should do this tick, given a real nudge is about to
 * fire for the first time (or the Nth time) for this user:
 *  - 'send_nudge'          — user has opted in; send the real nudge.
 *  - 'show_optin_prompt'   — no real nudge yet; create the one-time consent
 *                            item instead (plan Section 5.1). Suppresses the
 *                            nudge that would have triggered this.
 *  - 'suppress'            — a prompt is already pending, or the user declined
 *                            within the cooldown window; do nothing this tick.
 */
export function decideOptInAction(
  state: OptInState,
  now: Date = new Date(),
  cooldownDays = 14,
): 'send_nudge' | 'show_optin_prompt' | 'suppress' {
  if (state.nudgeInboxItemsEnabled) return 'send_nudge'
  if (state.promptCurrentlyPending) return 'suppress'

  if (state.lastDeclinedAt) {
    const cooldownEndMs = new Date(state.lastDeclinedAt).getTime() + cooldownDays * 86_400_000
    if (now.getTime() < cooldownEndMs) return 'suppress'
  }

  return 'show_optin_prompt'
}

// ── Provenance copy (plan Section 5.2/5.3) ──────────────────────────────────────

/** Builds the always-visible rationale string for a pre-1:1 inbox nudge, used
 *  both as the persistent in-app caption and the tooltip's longer form. Kept
 *  as a pure function so copy changes are covered by a test, not just eyeballed
 *  in the running app. */
export function buildMeetingNudgeRationale(memberName: string, dayLabel: string, meetingTime: string, itemCount: number): string {
  return `Suggested by your agent · based on your 1:1 with ${memberName} ${dayLabel} at ${meetingTime} — ${itemCount} open item${itemCount === 1 ? '' : 's'} tagged to them`
}

/** Builds the always-visible rationale string for a due-date inbox nudge. */
export function buildDueDateNudgeRationale(): string {
  return 'Suggested by your agent · due date approaching'
}

// ── Consolidated daily digest — additional nudge-candidate fetchers ────────────
//
// Four more inbox segments for the daily Slack digest, alongside the
// meeting-action/due-date nudge candidates above. Unlike the pure select*()
// functions above (which operate on data the caller already fetched), each
// fetch*() function here owns its own Supabase query — the caller just passes
// its own client + userId, matching agent-tick/index.ts's existing internal
// fetchDueNudgeCandidates()/fetchMeetingNudgeCandidates() shape. Slack Block
// Kit generation from these candidates is wired up separately in agent-tick;
// this file only produces the (small, capped, deduped) candidate lists.

/** Minimal shape shared by the digest sections below — just enough for a
 *  caller to render a line item and deep-link back to the source row. */
export interface InboxNudgeCandidateItem {
  id: string
  text: string
  workflow_status: string | null
  priority_due_at: string | null
}

/** Default cap per digest section, matching the "top 5-10" guidance — keeps
 *  a single noisy inbox from producing a wall-of-text Slack message. */
const DEFAULT_SECTION_CAP = 10

/** Safety-valve scan size for sections that can't express their condition as
 *  a single clean PostgREST filter (see fetchNeedsInputItems) and instead
 *  filter in JS after a broad fetch. A real user's open inbox realistically
 *  never approaches this; it just bounds the worst case. */
const SCAN_LIMIT = 200

/** workflow_status values that mean "the ball is in the user's court, and it
 *  isn't already flagged Do Now" — see fetchNeedsInputItems. */
const NEEDS_INPUT_STATUSES = ['Not started', 'Work in progress']

/**
 * Reimplements currentPriorityTier()'s "now" tier check
 * (src/lib/inboxValidation.ts, ~line 586) using plain calendar-day math
 * instead of date-fns, since this edge function can't import from src/.
 * `remainingDays <= 0` there corresponds to `true` here: a due date whose
 * calendar day has already arrived or passed. A null due date is *not* the
 * "now" tier (mirrors currentPriorityTier returning null, not 'now', for a
 * null dueAt).
 *
 * Calendar days are computed in UTC — there's no per-user timezone available
 * in this pipeline, so this is an approximation of the client-side "local
 * day" comparison currentPriorityTier makes. Good enough for a candidate
 * fetch feeding a once-daily digest; not used for anything display-precise.
 */
export function isDueNowTier(priorityDueAt: string | null, now: Date = new Date()): boolean {
  if (!priorityDueAt) return false
  const due = new Date(priorityDueAt)
  if (Number.isNaN(due.getTime())) return false
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return dueDay <= nowDay
}

/** Open inbox_items with workflow_status = 'Do Now' for this user, oldest
 *  first (the longest-standing "Do Now" items surface at the top). */
export async function fetchDoNowItems(
  supabase: SupabaseClient,
  userId: string,
  cap: number = DEFAULT_SECTION_CAP,
): Promise<InboxNudgeCandidateItem[]> {
  const { data } = await supabase
    .from('inbox_items')
    .select('id, text, workflow_status, priority_due_at')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq('workflow_status', 'Do Now')
    .order('created_at', { ascending: true })
    .limit(cap)

  return (data ?? []) as InboxNudgeCandidateItem[]
}

/**
 * Open inbox_items whose informal "gut feel" priority tier (see
 * PRIORITY_TIERS / currentPriorityTier in inboxValidation.ts) currently reads
 * as 'now'. Only considers priority_fixed = false rows — priority_fixed =
 * true rows are *real* due dates already covered by agent-tick's
 * fetchDueNudgeCandidates()/selectDueItemsToNudge() due-date nudge, and
 * including them again here would double-count the same item across two
 * digest sections.
 */
export async function fetchDueNowTierItems(
  supabase: SupabaseClient,
  userId: string,
  cap: number = DEFAULT_SECTION_CAP,
  now: Date = new Date(),
): Promise<InboxNudgeCandidateItem[]> {
  const { data } = await supabase
    .from('inbox_items')
    .select('id, text, workflow_status, priority_due_at')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq('priority_fixed', false)
    .not('priority_due_at', 'is', null)

  const candidates = (data ?? []) as InboxNudgeCandidateItem[]
  return candidates
    .filter((item) => isDueNowTier(item.priority_due_at, now))
    .sort((a, b) => new Date(a.priority_due_at!).getTime() - new Date(b.priority_due_at!).getTime())
    .slice(0, cap)
}

/**
 * Open inbox_items that still need the user's own input/action: workflow
 * status is unset, 'Not started', or 'Work in progress' — i.e. not already
 * 'Do Now' (its own digest section above), and not 'Waiting on someone' /
 * 'Blocked' (the ball isn't in the user's court for those).
 *
 * No single PostgREST filter expresses "status IS NULL OR status IN (...)"
 * without excluding NULL rows outright (a bare `not.in` treats NULL as
 * "doesn't match", dropping unset items we want to keep) — so this scans
 * open items broadly (bounded by SCAN_LIMIT) and applies the whitelist in
 * JS instead.
 *
 * This does not exclude items also captured by fetchDueNowTierItems (a
 * 'Not started' item due today would appear in both sections) — matching
 * the existing convention in this file of independent candidate fetchers
 * that don't cross-dedupe against each other (see selectDueItemsToNudge vs.
 * selectMeetingsForInboxNudge, which never check each other's output either).
 */
export async function fetchNeedsInputItems(
  supabase: SupabaseClient,
  userId: string,
  cap: number = DEFAULT_SECTION_CAP,
): Promise<InboxNudgeCandidateItem[]> {
  const { data } = await supabase
    .from('inbox_items')
    .select('id, text, workflow_status, priority_due_at, updated_at')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('updated_at', { ascending: true })
    .limit(SCAN_LIMIT)

  const rows = (data ?? []) as Array<InboxNudgeCandidateItem & { updated_at: string }>
  return rows
    .filter((item) => item.workflow_status == null || NEEDS_INPUT_STATUSES.includes(item.workflow_status))
    .slice(0, cap)
    .map(({ id, text, workflow_status, priority_due_at }) => ({ id, text, workflow_status, priority_due_at }))
}

/** Which of the three "blocking others" signals matched this item — lets a
 *  caller vary the digest copy without re-deriving it from source_ref. */
export type BlockingOthersReason = 'owed_by' | 'meeting_action_item' | 'cos_meeting_action'

export interface BlockingOthersItem {
  id: string
  text: string
  via: BlockingOthersReason
}

/**
 * Open inbox_items where the user is blocking someone else — the union of:
 *  - owed_by = 'me' (new explicit classification, populated by concurrent
 *    Slack/Zoom extraction work — see 20260728000001_inbox_items_owed_by.sql)
 *  - source_ref.type = 'meeting_action_item' (already assigned_to-filtered
 *    upstream by the sync trigger — see
 *    20260723000003_meeting_action_items_inbox_sync.sql)
 *  - source_ref.type = 'cos_meeting_action' (already owner='me'-filtered
 *    upstream — see 20260723000001_cos_meeting_actions_inbox_sync.sql)
 *
 * Deduped by item id: an item matching more than one condition (e.g. an
 * owed_by='me' row that's also a synced meeting_action_item) is reported
 * once, with 'owed_by' taking precedence as the most directly-classified
 * signal.
 */
export async function fetchBlockingOthersItems(
  supabase: SupabaseClient,
  userId: string,
  cap: number = DEFAULT_SECTION_CAP,
): Promise<BlockingOthersItem[]> {
  const [{ data: owedByMe }, { data: meetingActionItems }, { data: cosMeetingActions }] = await Promise.all([
    supabase.from('inbox_items').select('id, text').eq('user_id', userId).eq('status', 'open').eq('owed_by', 'me'),
    supabase
      .from('inbox_items')
      .select('id, text')
      .eq('user_id', userId)
      .eq('status', 'open')
      .contains('source_ref', { type: 'meeting_action_item' }),
    supabase
      .from('inbox_items')
      .select('id, text')
      .eq('user_id', userId)
      .eq('status', 'open')
      .contains('source_ref', { type: 'cos_meeting_action' }),
  ])

  const seen = new Set<string>()
  const result: BlockingOthersItem[] = []

  const addAll = (rows: Array<{ id: string; text: string }> | null, via: BlockingOthersReason) => {
    for (const row of rows ?? []) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      result.push({ id: row.id, text: row.text, via })
    }
  }

  addAll(owedByMe as Array<{ id: string; text: string }> | null, 'owed_by')
  addAll(meetingActionItems as Array<{ id: string; text: string }> | null, 'meeting_action_item')
  addAll(cosMeetingActions as Array<{ id: string; text: string }> | null, 'cos_meeting_action')

  return result.slice(0, cap)
}
