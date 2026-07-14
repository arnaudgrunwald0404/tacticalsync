// RCDO staleness thresholds and pure helpers — Deno-runtime mirror of
// src/lib/rcdoStaleness.ts (kept in sync manually; see that file's header
// comment for the reasoning behind the specific numbers, and
// agent-tick/index.ts's `meetingQualifiesForPrep` for the precedent of
// documenting this same cross-runtime duplication constraint elsewhere in
// this codebase).
//
// Used by rcdo-stale-check/index.ts, the scheduled function that Slack-DMs
// DO/SI/metric owners when their item has gone quiet.

/** No check-in / metric update for this many days counts as stale. */
export const STALE_CHECKIN_DAYS = 21
export const STALE_METRIC_DAYS = 21

/** Don't re-send a Slack nudge about the same item within this many days. */
export const NUDGE_THROTTLE_DAYS = 7

export function daysSince(isoDate: string, now: number): number {
  return (now - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
}

export function isCheckinStale(
  params: { latestCheckinDate: string | null; createdAt: string },
  now: number,
): boolean {
  const reference = params.latestCheckinDate ?? params.createdAt
  return daysSince(reference, now) > STALE_CHECKIN_DAYS
}

export function isMetricStale(
  params: { lastUpdatedAt: string | null; createdAt: string },
  now: number,
): boolean {
  const reference = params.lastUpdatedAt ?? params.createdAt
  return daysSince(reference, now) > STALE_METRIC_DAYS
}

export function isNudgeThrottled(lastNudgedAt: string | null, now: number): boolean {
  if (!lastNudgedAt) return false
  return daysSince(lastNudgedAt, now) < NUDGE_THROTTLE_DAYS
}
