import { describe, it, expect } from 'vitest';
import {
  selectDueItemsToNudge,
  selectMeetingsForInboxNudge,
  decideOptInAction,
  buildMeetingNudgeRationale,
  buildDueDateNudgeRationale,
  isDueNowTier,
  fetchDoNowItems,
  fetchDueNowTierItems,
  fetchNeedsInputItems,
  fetchBlockingOthersItems,
  type DueInboxItem,
  type NudgeHistoryEntry,
  type UpcomingMeeting,
  type OptInState,
} from '@/lib/agentInboxNudges';

// ─────────────────────────────────────────────────────────────────────────────
// Trigger logic for PLAN_idea4_agentic_followthrough.md: pre-1:1 nudges,
// due-date nudges, and the opt-in gate that must block real nudges from firing
// until a user explicitly consents (plan Section 5.1).
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-07-07T12:00:00.000Z');

function item(overrides: Partial<DueInboxItem> = {}): DueInboxItem {
  return {
    id: 'item-1',
    priority_fixed: true,
    priority_due_at: '2026-07-08T12:00:00.000Z', // 24h out
    status: 'open',
    ...overrides,
  };
}

// ── selectDueItemsToNudge ────────────────────────────────────────────────────

describe('selectDueItemsToNudge', () => {
  it('nudges an open, fixed-due-date item inside the window', () => {
    const result = selectDueItemsToNudge(
      [item()],
      [],
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual(['item-1']);
    expect(result.newlyCapped).toEqual([]);
  });

  it('never nudges when priority_fixed is false — a decaying tier-pill date is not a real deadline', () => {
    const result = selectDueItemsToNudge(
      [item({ priority_fixed: false })],
      [],
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual([]);
  });

  it('ignores items with no due date even if fixed is true', () => {
    const result = selectDueItemsToNudge(
      [item({ priority_due_at: null })],
      [],
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual([]);
  });

  it('ignores non-open items (done/archived/snoozed)', () => {
    for (const status of ['done', 'archived', 'snoozed'] as const) {
      const result = selectDueItemsToNudge(
        [item({ status })],
        [],
        { nudge_timing_hours: 24, nudge_max_count: 5 },
        NOW,
      );
      expect(result.toNudge).toEqual([]);
    }
  });

  it('excludes items whose due date is outside the nudge window', () => {
    const result = selectDueItemsToNudge(
      [item({ priority_due_at: '2026-07-20T12:00:00.000Z' })], // 13 days out
      [],
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual([]);
  });

  it('includes an already-overdue item (due date in the past)', () => {
    const result = selectDueItemsToNudge(
      [item({ priority_due_at: '2026-07-01T12:00:00.000Z' })],
      [],
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual(['item-1']);
  });

  it('does not re-nudge an item already nudged today', () => {
    const history: NudgeHistoryEntry[] = [
      { item_id: 'item-1', event_type: 'inbox_due_nudge_sent', created_at: '2026-07-07T09:00:00.000Z' },
    ];
    const result = selectDueItemsToNudge(
      [item()],
      history,
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual([]);
  });

  it('does re-nudge an item nudged on a previous day (still under the cap)', () => {
    const history: NudgeHistoryEntry[] = [
      { item_id: 'item-1', event_type: 'inbox_due_nudge_sent', created_at: '2026-07-05T09:00:00.000Z' },
    ];
    const result = selectDueItemsToNudge(
      [item()],
      history,
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual(['item-1']);
  });

  it('caps an item once it hits nudge_max_count and reports it as newlyCapped, not toNudge', () => {
    const history: NudgeHistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
      item_id: 'item-1',
      event_type: 'inbox_due_nudge_sent' as const,
      created_at: `2026-07-0${i + 1}T09:00:00.000Z`,
    }));
    const result = selectDueItemsToNudge(
      [item()],
      history,
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual([]);
    expect(result.newlyCapped).toEqual(['item-1']);
  });

  it('does not re-cap an item that was already capped previously', () => {
    const history: NudgeHistoryEntry[] = [
      { item_id: 'item-1', event_type: 'inbox_due_nudge_capped', created_at: '2026-07-05T09:00:00.000Z' },
    ];
    const result = selectDueItemsToNudge(
      [item()],
      history,
      { nudge_timing_hours: 24, nudge_max_count: 5 },
      NOW,
    );
    expect(result.toNudge).toEqual([]);
    expect(result.newlyCapped).toEqual([]); // already capped, not "newly"
  });

  it('handles multiple items independently', () => {
    const items = [
      item({ id: 'a', priority_due_at: '2026-07-07T13:00:00.000Z' }), // in window
      item({ id: 'b', priority_due_at: '2026-08-01T00:00:00.000Z' }), // out of window
      item({ id: 'c', priority_fixed: false }), // never eligible
    ];
    const result = selectDueItemsToNudge(items, [], { nudge_timing_hours: 24, nudge_max_count: 5 }, NOW);
    expect(result.toNudge).toEqual(['a']);
  });
});

// ── selectMeetingsForInboxNudge ───────────────────────────────────────────────

function meeting(overrides: Partial<UpcomingMeeting> = {}): UpcomingMeeting {
  return {
    eventId: 'evt-1',
    teamMemberId: 'member-1',
    startTime: '2026-07-07T18:00:00.000Z', // 6h out
    status: 'confirmed',
    ...overrides,
  };
}

describe('selectMeetingsForInboxNudge', () => {
  it('selects a confirmed meeting inside the 12h lookahead window', () => {
    const result = selectMeetingsForInboxNudge([meeting()], [], NOW);
    expect(result.map((m) => m.eventId)).toEqual(['evt-1']);
  });

  it('excludes meetings outside the lookahead window', () => {
    const result = selectMeetingsForInboxNudge(
      [meeting({ startTime: '2026-07-09T18:00:00.000Z' })], // 2 days out
      [],
      NOW,
    );
    expect(result).toEqual([]);
  });

  it('excludes meetings that already started', () => {
    const result = selectMeetingsForInboxNudge(
      [meeting({ startTime: '2026-07-07T10:00:00.000Z' })], // 2h in the past
      [],
      NOW,
    );
    expect(result).toEqual([]);
  });

  it('excludes cancelled and tentative meetings', () => {
    for (const status of ['cancelled', 'tentative'] as const) {
      const result = selectMeetingsForInboxNudge([meeting({ status })], [], NOW);
      expect(result).toEqual([]);
    }
  });

  it('excludes a meeting already nudged today (de-dupe by event id)', () => {
    const result = selectMeetingsForInboxNudge([meeting()], ['evt-1'], NOW);
    expect(result).toEqual([]);
  });

  it('respects a custom lookahead window', () => {
    const m = meeting({ startTime: '2026-07-08T00:00:00.000Z' }); // 12h out
    expect(selectMeetingsForInboxNudge([m], [], NOW, 6)).toEqual([]);
    expect(selectMeetingsForInboxNudge([m], [], NOW, 12)).toEqual([m]);
  });
});

// ── decideOptInAction ─────────────────────────────────────────────────────────

function optInState(overrides: Partial<OptInState> = {}): OptInState {
  return {
    nudgeInboxItemsEnabled: false,
    lastDeclinedAt: null,
    promptCurrentlyPending: false,
    ...overrides,
  };
}

describe('decideOptInAction', () => {
  it('sends the real nudge once the user has opted in', () => {
    expect(decideOptInAction(optInState({ nudgeInboxItemsEnabled: true }), NOW)).toBe('send_nudge');
  });

  it('shows the one-time opt-in prompt on a user\'s very first eligible nudge', () => {
    expect(decideOptInAction(optInState(), NOW)).toBe('show_optin_prompt');
  });

  it('suppresses (does not re-prompt) while a prompt is already pending', () => {
    expect(decideOptInAction(optInState({ promptCurrentlyPending: true }), NOW)).toBe('suppress');
  });

  it('suppresses re-prompting within the cooldown window after a decline', () => {
    const declined = new Date(NOW.getTime() - 3 * 86_400_000).toISOString(); // 3 days ago
    expect(decideOptInAction(optInState({ lastDeclinedAt: declined }), NOW)).toBe('suppress');
  });

  it('re-offers the opt-in prompt once the cooldown window has passed', () => {
    const declined = new Date(NOW.getTime() - 15 * 86_400_000).toISOString(); // 15 days ago
    expect(decideOptInAction(optInState({ lastDeclinedAt: declined }), NOW)).toBe('show_optin_prompt');
  });

  it('opting in always wins even if a decline is also on record', () => {
    const declined = new Date(NOW.getTime() - 1 * 86_400_000).toISOString();
    expect(
      decideOptInAction(optInState({ nudgeInboxItemsEnabled: true, lastDeclinedAt: declined }), NOW),
    ).toBe('send_nudge');
  });

  it('respects a custom cooldown length', () => {
    const declined = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
    expect(decideOptInAction(optInState({ lastDeclinedAt: declined }), NOW, 7)).toBe('suppress');
    expect(decideOptInAction(optInState({ lastDeclinedAt: declined }), NOW, 3)).toBe('show_optin_prompt');
  });
});

// ── Provenance copy builders ──────────────────────────────────────────────────

describe('buildMeetingNudgeRationale', () => {
  it('includes the member name, day label, meeting time, and a pluralized item count', () => {
    expect(buildMeetingNudgeRationale('Priya', 'today', '2:00 PM', 3)).toBe(
      'Suggested by your agent · based on your 1:1 with Priya today at 2:00 PM — 3 open items tagged to them',
    );
  });

  it('uses singular "item" for a count of exactly one', () => {
    expect(buildMeetingNudgeRationale('Priya', 'tomorrow', '9:00 AM', 1)).toBe(
      'Suggested by your agent · based on your 1:1 with Priya tomorrow at 9:00 AM — 1 open item tagged to them',
    );
  });
});

describe('buildDueDateNudgeRationale', () => {
  it('returns the fixed due-date rationale string', () => {
    expect(buildDueDateNudgeRationale()).toBe('Suggested by your agent · due date approaching');
  });
});

// ── Consolidated daily digest — additional nudge-candidate fetchers ─────────────

// A minimal in-memory PostgREST-like stub: `.from(table)` returns a fluent
// builder whose eq/not/contains/order/limit calls filter/slice an in-memory
// row array, and which resolves (via `.then`) to `{ data, error: null }` when
// awaited — enough surface for the fetch*() functions under test without
// needing to mock the real `@supabase/supabase-js` client.
function makeSupabaseStub(tableRows: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let rows = [...(tableRows[table] ?? [])];
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        not(col: string, op: string, val: unknown) {
          if (op === 'is' && val === null) {
            rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
          }
          return builder;
        },
        contains(col: string, val: Record<string, unknown>) {
          rows = rows.filter((r) => {
            const cell = r[col];
            if (!cell || typeof cell !== 'object') return false;
            return Object.entries(val).every(([k, v]) => (cell as Record<string, unknown>)[k] === v);
          });
          return builder;
        },
        order() {
          return builder;
        },
        limit(n: number) {
          rows = rows.slice(0, n);
          return builder;
        },
        then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'item-1',
    user_id: 'user-1',
    text: 'Some item',
    status: 'open',
    workflow_status: null,
    priority_due_at: null,
    priority_fixed: false,
    owed_by: null,
    source_ref: null,
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isDueNowTier', () => {
  const NOW2 = new Date('2026-07-07T12:00:00.000Z');

  it('is false for a null due date', () => {
    expect(isDueNowTier(null, NOW2)).toBe(false);
  });

  it('is true for a due date earlier today', () => {
    expect(isDueNowTier('2026-07-07T01:00:00.000Z', NOW2)).toBe(true);
  });

  it('is true for a due date in the past', () => {
    expect(isDueNowTier('2026-07-01T00:00:00.000Z', NOW2)).toBe(true);
  });

  it('is false for a due date tomorrow or later', () => {
    expect(isDueNowTier('2026-07-08T00:00:01.000Z', NOW2)).toBe(false);
  });

  it('is false for an unparseable date string', () => {
    expect(isDueNowTier('not-a-date', NOW2)).toBe(false);
  });
});

describe('fetchDoNowItems', () => {
  it('returns only open items with workflow_status "Do Now"', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [
        row({ id: 'a', workflow_status: 'Do Now' }),
        row({ id: 'b', workflow_status: 'Not started' }),
        row({ id: 'c', workflow_status: 'Do Now', status: 'done' }),
      ],
    });
    const result = await fetchDoNowItems(supabase, 'user-1');
    expect(result.map((i) => i.id)).toEqual(['a']);
  });

  it('respects the cap', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: Array.from({ length: 15 }, (_, i) => row({ id: `item-${i}`, workflow_status: 'Do Now' })),
    });
    const result = await fetchDoNowItems(supabase, 'user-1', 5);
    expect(result).toHaveLength(5);
  });
});

describe('fetchDueNowTierItems', () => {
  const NOW2 = new Date('2026-07-07T12:00:00.000Z');

  it('includes an item due today or earlier that is not priority_fixed', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [
        row({ id: 'a', priority_due_at: '2026-07-07T01:00:00.000Z', priority_fixed: false }),
      ],
    });
    const result = await fetchDueNowTierItems(supabase, 'user-1', 10, NOW2);
    expect(result.map((i) => i.id)).toEqual(['a']);
  });

  it('also includes a priority_fixed item due today or earlier (e.g. a real deadline extracted from a Slack DM/email)', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [
        row({ id: 'a', priority_due_at: '2026-07-07T01:00:00.000Z', priority_fixed: true }),
      ],
    });
    const result = await fetchDueNowTierItems(supabase, 'user-1', 10, NOW2);
    expect(result.map((i) => i.id)).toEqual(['a']);
  });

  it('excludes items with no due date', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [row({ id: 'a', priority_due_at: null, priority_fixed: false })],
    });
    const result = await fetchDueNowTierItems(supabase, 'user-1', 10, NOW2);
    expect(result).toEqual([]);
  });

  it('excludes items due in the future', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [row({ id: 'a', priority_due_at: '2026-07-09T00:00:00.000Z', priority_fixed: false })],
    });
    const result = await fetchDueNowTierItems(supabase, 'user-1', 10, NOW2);
    expect(result).toEqual([]);
  });

  it('sorts the most overdue item first and respects the cap', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [
        row({ id: 'later', priority_due_at: '2026-07-07T10:00:00.000Z', priority_fixed: false }),
        row({ id: 'earliest', priority_due_at: '2026-07-01T00:00:00.000Z', priority_fixed: false }),
        row({ id: 'mid', priority_due_at: '2026-07-05T00:00:00.000Z', priority_fixed: false }),
      ],
    });
    const result = await fetchDueNowTierItems(supabase, 'user-1', 2, NOW2);
    expect(result.map((i) => i.id)).toEqual(['earliest', 'mid']);
  });
});

describe('fetchNeedsInputItems', () => {
  it('includes null, "Not started", and "Work in progress" statuses', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [
        row({ id: 'a', workflow_status: null }),
        row({ id: 'b', workflow_status: 'Not started' }),
        row({ id: 'c', workflow_status: 'Work in progress' }),
      ],
    });
    const result = await fetchNeedsInputItems(supabase, 'user-1');
    expect(result.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('excludes "Do Now", "Waiting on someone", and "Blocked"', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [
        row({ id: 'a', workflow_status: 'Do Now' }),
        row({ id: 'b', workflow_status: 'Waiting on someone' }),
        row({ id: 'c', workflow_status: 'Blocked' }),
      ],
    });
    const result = await fetchNeedsInputItems(supabase, 'user-1');
    expect(result).toEqual([]);
  });

  it('respects the cap', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: Array.from({ length: 15 }, (_, i) => row({ id: `item-${i}`, workflow_status: 'Not started' })),
    });
    const result = await fetchNeedsInputItems(supabase, 'user-1', 5);
    expect(result).toHaveLength(5);
  });
});

describe('fetchBlockingOthersItems', () => {
  it('includes items with owed_by = "me"', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [row({ id: 'a', owed_by: 'me' })],
    });
    const result = await fetchBlockingOthersItems(supabase, 'user-1');
    expect(result).toEqual([{ id: 'a', text: 'Some item', via: 'owed_by' }]);
  });

  it('includes source_ref.type = "meeting_action_item" rows', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [row({ id: 'a', source_ref: { type: 'meeting_action_item', id: '123' } })],
    });
    const result = await fetchBlockingOthersItems(supabase, 'user-1');
    expect(result).toEqual([{ id: 'a', text: 'Some item', via: 'meeting_action_item' }]);
  });

  it('includes source_ref.type = "cos_meeting_action" rows', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [row({ id: 'a', source_ref: { type: 'cos_meeting_action', id: '456' } })],
    });
    const result = await fetchBlockingOthersItems(supabase, 'user-1');
    expect(result).toEqual([{ id: 'a', text: 'Some item', via: 'cos_meeting_action' }]);
  });

  it('dedupes an item matching more than one condition, preferring owed_by', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [row({ id: 'a', owed_by: 'me', source_ref: { type: 'meeting_action_item', id: '1' } })],
    });
    const result = await fetchBlockingOthersItems(supabase, 'user-1');
    expect(result).toEqual([{ id: 'a', text: 'Some item', via: 'owed_by' }]);
  });

  it('does not include unrelated open items', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: [row({ id: 'a', owed_by: null, source_ref: null })],
    });
    const result = await fetchBlockingOthersItems(supabase, 'user-1');
    expect(result).toEqual([]);
  });

  it('respects the cap across the merged union', async () => {
    const supabase = makeSupabaseStub({
      inbox_items: Array.from({ length: 15 }, (_, i) => row({ id: `item-${i}`, owed_by: 'me' })),
    });
    const result = await fetchBlockingOthersItems(supabase, 'user-1', 5);
    expect(result).toHaveLength(5);
  });
});
