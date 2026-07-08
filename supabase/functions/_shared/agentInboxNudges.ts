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
