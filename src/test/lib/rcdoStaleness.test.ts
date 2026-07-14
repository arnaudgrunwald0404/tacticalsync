import { describe, it, expect } from 'vitest';
import {
  STALE_CHECKIN_DAYS,
  STALE_METRIC_DAYS,
  NUDGE_THROTTLE_DAYS,
  daysSince,
  isCheckinStale,
  isMetricStale,
  isNudgeThrottled,
} from '@/lib/rcdoStaleness';

const NOW = new Date('2026-07-14T12:00:00Z');

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('rcdoStaleness', () => {
  describe('daysSince', () => {
    it('computes fractional days between two dates', () => {
      expect(daysSince(daysAgoIso(5), NOW)).toBeCloseTo(5, 5);
    });
  });

  describe('isCheckinStale', () => {
    it('is not stale when the latest check-in is within the threshold', () => {
      const result = isCheckinStale(
        { latestCheckinDate: daysAgoIso(STALE_CHECKIN_DAYS - 1), createdAt: daysAgoIso(100) },
        NOW,
      );
      expect(result).toBe(false);
    });

    it('is stale when the latest check-in is older than the threshold', () => {
      const result = isCheckinStale(
        { latestCheckinDate: daysAgoIso(STALE_CHECKIN_DAYS + 1), createdAt: daysAgoIso(100) },
        NOW,
      );
      expect(result).toBe(true);
    });

    it('falls back to createdAt when there has never been a check-in', () => {
      const recentlyCreated = isCheckinStale(
        { latestCheckinDate: null, createdAt: daysAgoIso(3) },
        NOW,
      );
      expect(recentlyCreated).toBe(false);

      const staleSinceCreation = isCheckinStale(
        { latestCheckinDate: null, createdAt: daysAgoIso(STALE_CHECKIN_DAYS + 5) },
        NOW,
      );
      expect(staleSinceCreation).toBe(true);
    });

    it('gives a brand-new DO/SI a grace period instead of flagging immediately', () => {
      const result = isCheckinStale(
        { latestCheckinDate: null, createdAt: daysAgoIso(1) },
        NOW,
      );
      expect(result).toBe(false);
    });
  });

  describe('isMetricStale', () => {
    it('is not stale when last_updated_at is within the threshold', () => {
      const result = isMetricStale(
        { lastUpdatedAt: daysAgoIso(STALE_METRIC_DAYS - 1), createdAt: daysAgoIso(100) },
        NOW,
      );
      expect(result).toBe(false);
    });

    it('is stale when last_updated_at is older than the threshold', () => {
      const result = isMetricStale(
        { lastUpdatedAt: daysAgoIso(STALE_METRIC_DAYS + 1), createdAt: daysAgoIso(100) },
        NOW,
      );
      expect(result).toBe(true);
    });

    it('falls back to createdAt when the metric has never been updated', () => {
      const result = isMetricStale(
        { lastUpdatedAt: null, createdAt: daysAgoIso(STALE_METRIC_DAYS + 5) },
        NOW,
      );
      expect(result).toBe(true);
    });
  });

  describe('isNudgeThrottled', () => {
    it('is not throttled when never nudged', () => {
      expect(isNudgeThrottled(null, NOW)).toBe(false);
    });

    it('is throttled within the cooldown window', () => {
      expect(isNudgeThrottled(daysAgoIso(NUDGE_THROTTLE_DAYS - 1), NOW)).toBe(true);
    });

    it('is not throttled once the cooldown window has passed', () => {
      expect(isNudgeThrottled(daysAgoIso(NUDGE_THROTTLE_DAYS + 1), NOW)).toBe(false);
    });
  });
});
