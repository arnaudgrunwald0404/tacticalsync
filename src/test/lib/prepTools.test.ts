import { describe, it, expect } from 'vitest';
import { categorizeMeeting, meetingQualifies, effectivePrepTools } from '@/lib/prepTools';

// ─────────────────────────────────────────────────────────────────
// Pure inclusion-model + toolset helpers used by the Recurring Meeting
// Prep settings and mirrored in the daily-prep-batch edge function.
// ─────────────────────────────────────────────────────────────────

describe('categorizeMeeting', () => {
  it('classifies recurring vs one-off and 1:1 vs group', () => {
    expect(categorizeMeeting('series-1', 1)).toBe('recurring_1on1');
    expect(categorizeMeeting('series-1', 0)).toBe('recurring_1on1'); // no other attendees synced
    expect(categorizeMeeting(null, 1)).toBe('oneoff_1on1');
    expect(categorizeMeeting('series-2', 4)).toBe('recurring_group');
    expect(categorizeMeeting(null, 5)).toBe('oneoff_group');
    expect(categorizeMeeting('', 2)).toBe('oneoff_group'); // empty string = not recurring
  });
});

describe('meetingQualifies', () => {
  const opted = ['series-yes'];

  it('always includes 1:1s', () => {
    expect(meetingQualifies('recurring_1on1', 'series-x', opted)).toBe(true);
    expect(meetingQualifies('oneoff_1on1', null, opted)).toBe(true);
  });

  it('includes recurring groups only when opted in', () => {
    expect(meetingQualifies('recurring_group', 'series-yes', opted)).toBe(true);
    expect(meetingQualifies('recurring_group', 'series-no', opted)).toBe(false);
  });

  it('never auto-includes one-off groups', () => {
    expect(meetingQualifies('oneoff_group', null, opted)).toBe(false);
  });
});

describe('effectivePrepTools', () => {
  const global = ['zoom', 'slack'];

  it('uses the global default when there is no override', () => {
    expect(effectivePrepTools(null, global)).toEqual(global);
    expect(effectivePrepTools(undefined, global)).toEqual(global);
    expect(effectivePrepTools([], global)).toEqual(global);
  });

  it('prefers a non-empty per-member override', () => {
    expect(effectivePrepTools(['stackone'], global)).toEqual(['stackone']);
  });
});
