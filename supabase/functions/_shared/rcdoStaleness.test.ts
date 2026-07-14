import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  STALE_CHECKIN_DAYS,
  STALE_METRIC_DAYS,
  NUDGE_THROTTLE_DAYS,
  daysSince,
  isCheckinStale,
  isMetricStale,
  isNudgeThrottled,
} from "./rcdoStaleness.ts"

const NOW = new Date("2026-07-14T12:00:00Z").getTime()

function daysAgoIso(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()
}

Deno.test("daysSince computes fractional days between two timestamps", () => {
  assertEquals(Math.round(daysSince(daysAgoIso(5), NOW)), 5)
})

Deno.test("isCheckinStale: not stale within the threshold", () => {
  assertEquals(
    isCheckinStale({ latestCheckinDate: daysAgoIso(STALE_CHECKIN_DAYS - 1), createdAt: daysAgoIso(100) }, NOW),
    false,
  )
})

Deno.test("isCheckinStale: stale once past the threshold", () => {
  assertEquals(
    isCheckinStale({ latestCheckinDate: daysAgoIso(STALE_CHECKIN_DAYS + 1), createdAt: daysAgoIso(100) }, NOW),
    true,
  )
})

Deno.test("isCheckinStale: falls back to createdAt, with a grace period for new items", () => {
  assertEquals(isCheckinStale({ latestCheckinDate: null, createdAt: daysAgoIso(1) }, NOW), false)
  assertEquals(
    isCheckinStale({ latestCheckinDate: null, createdAt: daysAgoIso(STALE_CHECKIN_DAYS + 5) }, NOW),
    true,
  )
})

Deno.test("isMetricStale: not stale within the threshold", () => {
  assertEquals(
    isMetricStale({ lastUpdatedAt: daysAgoIso(STALE_METRIC_DAYS - 1), createdAt: daysAgoIso(100) }, NOW),
    false,
  )
})

Deno.test("isMetricStale: stale once past the threshold, falling back to createdAt", () => {
  assertEquals(
    isMetricStale({ lastUpdatedAt: null, createdAt: daysAgoIso(STALE_METRIC_DAYS + 5) }, NOW),
    true,
  )
})

Deno.test("isNudgeThrottled: never nudged is not throttled", () => {
  assertEquals(isNudgeThrottled(null, NOW), false)
})

Deno.test("isNudgeThrottled: within cooldown is throttled", () => {
  assertEquals(isNudgeThrottled(daysAgoIso(NUDGE_THROTTLE_DAYS - 1), NOW), true)
})

Deno.test("isNudgeThrottled: past cooldown is not throttled", () => {
  assertEquals(isNudgeThrottled(daysAgoIso(NUDGE_THROTTLE_DAYS + 1), NOW), false)
})
