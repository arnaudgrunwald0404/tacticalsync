import { describe, it, expect } from 'vitest';
import { bucketise, type OneOnOneMember } from '@/components/cos/OneOnOnesView';

// `bucketise` is the scheduling brain of the 1:1s view: it takes raw members
// and tags each with a chronological `bucket` (today / tomorrow / this_week / later)
// plus `isSkip` for skip-level relationships. Pinning `now` makes the cadence
// math deterministic across runs.
//
// Cadence assumptions (from the source):
//   direct_report → 7-day cadence
//   collaborator  → 14-day cadence
//
// Bucket rules (daysUntilNext):
//   ≤ 0   → today  (overdue or due today)
//   = 1   → tomorrow
//   2–7   → this_week
//   > 7   → later
//   null  → later  (never met)

const NOW = new Date('2026-06-15T12:00:00Z');

const make = (overrides: Partial<OneOnOneMember> & { id: string }): OneOnOneMember => ({
  id: overrides.id,
  user_id: `u-${overrides.id}`,
  name: overrides.id,
  role: 'PM',
  relationship_type: 'direct_report',
  context_notes: null,
  last_1on1_date: null,
  reports_to_id: null,
  ...overrides,
});

describe('bucketise (1:1 scheduling)', () => {
  describe('bucket assignment', () => {
    it('returns "later" when the member has no recorded last 1:1', () => {
      const [m] = bucketise([make({ id: 'a' })], NOW);
      expect(m.bucket).toBe('later');
      expect(m.daysSinceLast).toBeNull();
      expect(m.daysUntilNext).toBeNull();
    });

    it('marks a direct_report as "today" when last 1:1 was >7 days ago (overdue)', () => {
      // 10 days ago, cadence 7 → daysUntilNext = -3
      const [m] = bucketise([make({ id: 'a', last_1on1_date: '2026-06-05' })], NOW);
      expect(m.bucket).toBe('today');
      expect(m.daysSinceLast).toBe(10);
      expect(m.daysUntilNext).toBe(-3);
    });

    it('marks a direct_report as "this_week" when next is due in 2-7 days', () => {
      // 5 days ago, cadence 7 → daysUntilNext = 2
      const [m] = bucketise([make({ id: 'a', last_1on1_date: '2026-06-10' })], NOW);
      expect(m.bucket).toBe('this_week');
      expect(m.daysUntilNext).toBe(2);
    });

    it('marks a direct_report as "tomorrow" when next is due in 1 day', () => {
      // 6 days ago, cadence 7 → daysUntilNext = 1
      const [m] = bucketise([make({ id: 'a', last_1on1_date: '2026-06-09' })], NOW);
      expect(m.bucket).toBe('tomorrow');
      expect(m.daysUntilNext).toBe(1);
    });

    it('marks a collaborator as "later" when next is >7 days out', () => {
      // 2 days ago, cadence 14 → daysUntilNext = 12
      const [m] = bucketise(
        [make({ id: 'a', relationship_type: 'collaborator', last_1on1_date: '2026-06-13' })],
        NOW,
      );
      expect(m.bucket).toBe('later');
      expect(m.daysUntilNext).toBe(12);
    });

    it('treats a direct_report at exactly 7 days as "today" (due now)', () => {
      // boundary: daysSinceLast = 7 → daysUntilNext = 0 → bucket should be today
      const [m] = bucketise([make({ id: 'a', last_1on1_date: '2026-06-08' })], NOW);
      expect(m.daysUntilNext).toBe(0);
      expect(m.bucket).toBe('today');
    });
  });

  describe('skip-level detection', () => {
    it('flags a member whose reports_to_id points at a direct_report', () => {
      const members = bucketise(
        [
          make({ id: 'alex', relationship_type: 'direct_report' }),
          make({ id: 'beth', relationship_type: 'direct_report', reports_to_id: 'alex' }),
        ],
        NOW,
      );
      const beth = members.find((m) => m.id === 'beth')!;
      const alex = members.find((m) => m.id === 'alex')!;
      expect(beth.isSkip).toBe(true);
      expect(alex.isSkip).toBe(false);
    });

    it('does NOT flag a member whose reports_to_id is null', () => {
      const [m] = bucketise([make({ id: 'a', reports_to_id: null })], NOW);
      expect(m.isSkip).toBe(false);
    });

    it('does NOT flag a member whose reports_to_id points at a collaborator', () => {
      const members = bucketise(
        [
          make({ id: 'collab', relationship_type: 'collaborator' }),
          make({ id: 'maybe-skip', relationship_type: 'direct_report', reports_to_id: 'collab' }),
        ],
        NOW,
      );
      const maybe = members.find((m) => m.id === 'maybe-skip')!;
      expect(maybe.isSkip).toBe(false);
    });
  });

  describe('mixed cohorts', () => {
    it('handles today + this_week + later together without cross-talk', () => {
      const result = bucketise(
        [
          make({ id: 'overdue', last_1on1_date: '2026-06-01' }),  // 14 days ago, cadence 7 → today
          make({ id: 'soon', last_1on1_date: '2026-06-12' }),     // 3 days ago, cadence 7 → this_week (4d left)
          make({ id: 'fresh' }),                                   // never had one → later
        ],
        NOW,
      );
      const byId = Object.fromEntries(result.map((m) => [m.id, m.bucket]));
      expect(byId).toEqual({ overdue: 'today', soon: 'this_week', fresh: 'later' });
    });
  });
});
