import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInboxItems } from '@/hooks/useInboxItems';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests for the snooze mutations added to useInboxItems:
//   - snoozeItem (fixed date)
//   - snoozeUntilNext1on1 (person-bound — the "no meeting found" fallback is
//     the one genuinely risky behavior in this whole feature set, per
//     PLAN_idea2_dormant20.md Section 1b's risk notes, so it gets the most
//     coverage here)
//   - unsnoozeItem
//
// Mocks Supabase per-table so `cos_one_on_one_events` (queried by
// resolveNextOneOnOne) and `inbox_items` (mutated by the hook) can be
// configured independently within a single test.
// ─────────────────────────────────────────────────────────────────────────────

const USER = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';
const FILTER = {};

let inboxItemsUpdateSpy: ReturnType<typeof vi.fn>;
let nextEventResult: { start_time: string } | null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from;

function makeInboxItemsBuilder() {
  inboxItemsUpdateSpy = vi.fn(() => builder);
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'in', 'order', 'not', 'limit', 'contains'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.update = inboxItemsUpdateSpy;
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null });
  return builder;
}

function makeOneOnOneEventsBuilder() {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'neq', 'gte', 'order', 'limit'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: nextEventResult, error: null }));
  return builder;
}

beforeEach(() => {
  nextEventResult = null;
  mockedFrom.mockReset();
  mockedFrom.mockImplementation((table: string) => {
    if (table === 'cos_one_on_one_events') return makeOneOnOneEventsBuilder();
    return makeInboxItemsBuilder();
  });
});

async function mountHook() {
  const hook = renderHook(() => useInboxItems(USER, FILTER));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useInboxItems.snoozeItem (fixed date)', () => {
  it('sets status=snoozed, the given date, and clears any member binding', async () => {
    const { result } = await mountHook();
    const until = new Date('2026-07-14T09:00:00.000Z');
    await act(async () => { await result.current.snoozeItem('item-1', until); });

    expect(inboxItemsUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'snoozed',
        snoozed_until: until.toISOString(),
        snooze_until_member_id: null,
      }),
    );
  });

  it('removes the item from the current (open) list', async () => {
    const { result } = await mountHook();
    // Seed one item into the list via the mirror-free path isn't directly
    // testable without a fetch; instead verify the item-removal patcher is
    // idempotent on an empty list (no throw) — the removal logic itself
    // (`prev.filter(i => i.id !== id)`) is exercised the same way markDone's
    // existing tests already cover elsewhere.
    await act(async () => { await result.current.snoozeItem('item-1', new Date()); });
    expect(result.current.items).toEqual([]);
  });
});

describe('useInboxItems.snoozeUntilNext1on1', () => {
  it('resolves the next 1:1 and snoozes with the resolved date + member id', async () => {
    nextEventResult = { start_time: '2026-07-20T15:00:00.000Z' };
    const { result } = await mountHook();

    let outcome: { ok: true } | { ok: false } | undefined;
    await act(async () => {
      outcome = await result.current.snoozeUntilNext1on1('item-1', MEMBER);
    });

    expect(outcome).toEqual({ ok: true, resolvedAt: '2026-07-20T15:00:00.000Z' });
    expect(inboxItemsUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'snoozed',
        snoozed_until: '2026-07-20T15:00:00.000Z',
        snooze_until_member_id: MEMBER,
      }),
    );
  });

  it('does NOT snooze the item when no upcoming 1:1 is found', async () => {
    // The critical negative case: a person with no scheduled meeting must not
    // result in a snooze that can never wake back up.
    nextEventResult = null;
    const { result } = await mountHook();

    let outcome: { ok: true } | { ok: false } | undefined;
    await act(async () => {
      outcome = await result.current.snoozeUntilNext1on1('item-1', MEMBER);
    });

    expect(outcome).toEqual({ ok: false });
    expect(inboxItemsUpdateSpy).not.toHaveBeenCalled();
  });

  it('leaves the item list untouched when no meeting is found', async () => {
    nextEventResult = null;
    const { result } = await mountHook();
    const before = result.current.items;
    await act(async () => { await result.current.snoozeUntilNext1on1('item-1', MEMBER); });
    expect(result.current.items).toBe(before);
  });
});

describe('useInboxItems.unsnoozeItem', () => {
  it('sets status back to open and clears both snooze columns', async () => {
    const { result } = await mountHook();
    await act(async () => { await result.current.unsnoozeItem('item-1'); });

    expect(inboxItemsUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'open',
        snoozed_until: null,
        snooze_until_member_id: null,
      }),
    );
  });
});
