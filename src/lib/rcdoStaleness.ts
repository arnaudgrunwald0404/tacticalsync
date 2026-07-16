// RCDO staleness thresholds and pure helpers.
//
// Neither rc_checkins nor rc_do_metrics carries an explicit "expected
// cadence" field, so "stale" is a product decision rather than something
// read off the schema. These numbers intentionally match the staleness
// iconography StrategyCanvas.tsx already renders client-side (see
// `showWarning` in the SI node renderer: `daysSinceUpdate > 21 && daysSinceCreated > 21`)
// so the RCDO module has exactly one definition of "stale" instead of two
// disagreeing ones. Metrics reuse the same number for the same reason: there's
// no separate cadence concept for metrics vs. check-ins in this schema, and a
// single configurable constant is easier to reason about (and to change later)
// than inventing a second unrelated threshold.
//
// A mirrored (Deno-runtime) copy of this logic lives in
// supabase/functions/_shared/rcdoStaleness.ts for the scheduled edge function
// that sends the Slack DM nudge — the two can't share a module across the
// Vite/vitest and Deno runtimes, so keep them in sync (same convention as
// `meetingQualifiesForPrep` in supabase/functions/agent-tick/index.ts, which
// documents the same constraint against src/lib/prepTools.ts).

/** No check-in / metric update for this many days counts as stale. */
export const STALE_CHECKIN_DAYS = 21;
export const STALE_METRIC_DAYS = 21;

/** Don't re-send a Slack nudge about the same item within this many days. */
export const NUDGE_THROTTLE_DAYS = 7;

export function daysSince(isoDate: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * A DO/SI is stale when its most recent check-in (or, if it has never had
 * one, its creation date) is older than the threshold. Using creation date
 * as the fallback reference gives every newly created DO/SI a grace period
 * before it can be flagged, rather than nagging the moment it's created.
 */
export function isCheckinStale(
  params: { latestCheckinDate: string | null; createdAt: string },
  now: Date = new Date(),
): boolean {
  const reference = params.latestCheckinDate ?? params.createdAt;
  return daysSince(reference, now) > STALE_CHECKIN_DAYS;
}

/**
 * A metric is stale when its last recorded value (or creation date, if it
 * has never been updated) is older than the threshold. There is no
 * `rc_do_metric_values`-style history table in this schema — `rc_do_metrics`
 * only stores the current value plus `last_updated_at`, updated in place —
 * so "a new value was recorded" is exactly "`last_updated_at` changed".
 */
export function isMetricStale(
  params: { lastUpdatedAt: string | null; createdAt: string },
  now: Date = new Date(),
): boolean {
  const reference = params.lastUpdatedAt ?? params.createdAt;
  return daysSince(reference, now) > STALE_METRIC_DAYS;
}

/** Throttle check shared by the nudge sender: has this item already been
 *  nudged recently enough that we should stay quiet this run? */
export function isNudgeThrottled(lastNudgedAt: string | null, now: Date = new Date()): boolean {
  if (!lastNudgedAt) return false;
  return daysSince(lastNudgedAt, now) < NUDGE_THROTTLE_DAYS;
}
