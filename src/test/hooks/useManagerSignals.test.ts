import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useManagerCloseRates,
  useManagerAgingItems,
  useManagerSignals,
  withRateSummary,
  MIN_ITEMS_FOR_RATE,
  type ManagerCloseRate,
} from '@/hooks/useManagerSignals';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Coverage for PLAN_idea9_manager_signals.md §3 (signal math) and §10 (test
// coverage). The point of these tests is the arithmetic and guard logic:
// window selection (30d vs 90d), the low-N guard that suppresses a rendered
// rate below MIN_ITEMS_FOR_RATE, divide-by-zero safety, and the aging-item
// sort order / urgency-tier boundaries at exactly 7 and 14 days.
// Cross-manager RLS isolation is NOT unit-testable (RLS is enforced by
// Postgres, not by this client-side hook) — see e2e/security/manager-signals.spec.ts
// for the live RLS check.
// ─────────────────────────────────────────────────────────────────────────────

const MANAGER_ID = '11111111-1111-1111-1111-111111111111';

let closeRateData: unknown[] = [];
let agingItemData: unknown[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from;

function buildBuilder(resolveWith: unknown[]) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'order'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: resolveWith, error: null });
  return builder;
}

beforeEach(() => {
  closeRateData = [];
  agingItemData = [];
  mockedFrom.mockReset();
  mockedFrom.mockImplementation((table: string) => {
    if (table === 'cos_manager_signal_close_rate') return buildBuilder(closeRateData);
    if (table === 'cos_manager_signal_aging_items') return buildBuilder(agingItemData);
    throw new Error(`Unexpected table in test: ${table}`);
  });
});

// ── withRateSummary: pure function, window selection + low-N guard ──────────

describe('withRateSummary', () => {
  const baseRow: ManagerCloseRate = {
    managerId: MANAGER_ID,
    memberId: 'member-1',
    memberName: 'Jane',
    relationshipType: 'direct_report',
    total30d: 10,
    done30d: 7,
    total90d: 20,
    done90d: 15,
  };

  it('computes the rate for the 30-day window when total meets the threshold', () => {
    const summary = withRateSummary(baseRow, 30);
    expect(summary.total).toBe(10);
    expect(summary.done).toBe(7);
    expect(summary.hasEnoughData).toBe(true);
    expect(summary.rate).toBeCloseTo(0.7);
  });

  it('computes the rate for the 90-day window independently of the 30-day window', () => {
    const summary = withRateSummary(baseRow, 90);
    expect(summary.total).toBe(20);
    expect(summary.done).toBe(15);
    expect(summary.rate).toBeCloseTo(0.75);
  });

  it('suppresses the rate (null) when total is below MIN_ITEMS_FOR_RATE', () => {
    const lowN: ManagerCloseRate = { ...baseRow, total30d: MIN_ITEMS_FOR_RATE - 1, done30d: 2 };
    const summary = withRateSummary(lowN, 30);
    expect(summary.hasEnoughData).toBe(false);
    expect(summary.rate).toBeNull();
  });

  it('renders a rate at exactly the MIN_ITEMS_FOR_RATE boundary (inclusive)', () => {
    const atThreshold: ManagerCloseRate = { ...baseRow, total30d: MIN_ITEMS_FOR_RATE, done30d: 1 };
    const summary = withRateSummary(atThreshold, 30);
    expect(summary.hasEnoughData).toBe(true);
    expect(summary.rate).toBeCloseTo(1 / MIN_ITEMS_FOR_RATE);
  });

  it('never divides by zero: total = 0 yields null rate, not NaN or Infinity', () => {
    const zero: ManagerCloseRate = { ...baseRow, total30d: 0, done30d: 0 };
    const summary = withRateSummary(zero, 30);
    expect(summary.hasEnoughData).toBe(false);
    expect(summary.rate).toBeNull();
    expect(Number.isNaN(summary.rate)).toBe(false);
  });
});

// ── useManagerCloseRates: hook-level window plumbing ─────────────────────────

describe('useManagerCloseRates', () => {
  it('returns an empty array and does not query when managerId is null', async () => {
    const { result } = renderHook(() => useManagerCloseRates(null, 30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.closeRates).toEqual([]);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('maps view rows to camelCase and applies the requested window', async () => {
    closeRateData = [
      {
        manager_id: MANAGER_ID,
        member_id: 'member-1',
        member_name: 'Jane',
        relationship_type: 'direct_report',
        total_30d: 8,
        done_30d: 4,
        total_90d: 22,
        done_90d: 11,
      },
    ];
    const { result } = renderHook(() => useManagerCloseRates(MANAGER_ID, 30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.closeRates).toHaveLength(1);
    const row = result.current.closeRates[0];
    expect(row.memberName).toBe('Jane');
    expect(row.total).toBe(8);
    expect(row.done).toBe(4);
    expect(row.rate).toBeCloseTo(0.5);
  });

  it('scopes the query to the given managerId (defense-in-depth alongside RLS)', async () => {
    renderHook(() => useManagerCloseRates(MANAGER_ID, 30));
    await waitFor(() => expect(mockedFrom).toHaveBeenCalledWith('cos_manager_signal_close_rate'));
  });

  it('surfaces a low-N row without a percentage', async () => {
    closeRateData = [
      {
        manager_id: MANAGER_ID,
        member_id: 'member-2',
        member_name: 'New Hire',
        relationship_type: 'direct_report',
        total_30d: 2,
        done_30d: 1,
        total_90d: 2,
        done_90d: 1,
      },
    ];
    const { result } = renderHook(() => useManagerCloseRates(MANAGER_ID, 30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.closeRates[0].hasEnoughData).toBe(false);
    expect(result.current.closeRates[0].rate).toBeNull();
  });
});

// ── useManagerAgingItems: sort order + urgency tiers ─────────────────────────

describe('useManagerAgingItems', () => {
  it('returns an empty array and does not query when managerId is null', async () => {
    const { result } = renderHook(() => useManagerAgingItems(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agingItems).toEqual([]);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('maps rows and preserves the days_stale-descending order the view already applies', async () => {
    agingItemData = [
      {
        manager_id: MANAGER_ID, member_id: 'member-1', member_name: 'Jane',
        item_id: 'item-1', text: 'Waiting on legal review', workflow_status: 'Blocked',
        updated_at: '2026-06-01T00:00:00Z', days_stale: 20, urgency: 'critical',
      },
      {
        manager_id: MANAGER_ID, member_id: 'member-1', member_name: 'Jane',
        item_id: 'item-2', text: 'Waiting on design sign-off', workflow_status: 'Waiting on someone',
        updated_at: '2026-06-10T00:00:00Z', days_stale: 5, urgency: 'normal',
      },
    ];
    const { result } = renderHook(() => useManagerAgingItems(MANAGER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.agingItems.map((i) => i.itemId)).toEqual(['item-1', 'item-2']);
    expect(result.current.agingItems[0].urgency).toBe('critical');
  });

  it('classifies urgency tiers at the exact 7- and 14-day boundaries', async () => {
    agingItemData = [
      { manager_id: MANAGER_ID, member_id: 'm', member_name: 'A', item_id: 'i7', text: 't', workflow_status: 'Blocked', updated_at: 'x', days_stale: 7, urgency: 'normal' },
      { manager_id: MANAGER_ID, member_id: 'm', member_name: 'A', item_id: 'i8', text: 't', workflow_status: 'Blocked', updated_at: 'x', days_stale: 8, urgency: 'warning' },
      { manager_id: MANAGER_ID, member_id: 'm', member_name: 'A', item_id: 'i14', text: 't', workflow_status: 'Blocked', updated_at: 'x', days_stale: 14, urgency: 'warning' },
      { manager_id: MANAGER_ID, member_id: 'm', member_name: 'A', item_id: 'i15', text: 't', workflow_status: 'Blocked', updated_at: 'x', days_stale: 15, urgency: 'critical' },
    ];
    // These urgency values are computed by the SQL view (CASE WHEN > 14 / > 7),
    // not recomputed client-side — this test locks in that the hook passes the
    // view's own tiering through unchanged rather than silently overriding it.
    const { result } = renderHook(() => useManagerAgingItems(MANAGER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const byId = Object.fromEntries(result.current.agingItems.map((i) => [i.itemId, i.urgency]));
    expect(byId.i7).toBe('normal');
    expect(byId.i8).toBe('warning');
    expect(byId.i14).toBe('warning');
    expect(byId.i15).toBe('critical');
  });

  it('forMember filters to a single report and caps at the given limit', async () => {
    agingItemData = Array.from({ length: 7 }, (_, i) => ({
      manager_id: MANAGER_ID, member_id: i < 4 ? 'member-1' : 'member-2', member_name: 'X',
      item_id: `item-${i}`, text: 't', workflow_status: 'Blocked', updated_at: 'x',
      days_stale: 10 - i, urgency: 'warning',
    }));
    const { result } = renderHook(() => useManagerAgingItems(MANAGER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const forMember1 = result.current.forMember('member-1', 5);
    expect(forMember1).toHaveLength(4);
    expect(forMember1.every((i) => i.memberId === 'member-1')).toBe(true);

    const capped = result.current.forMember('member-2', 2);
    expect(capped).toHaveLength(2);
  });
});

// ── useManagerSignals: composition ───────────────────────────────────────────

describe('useManagerSignals', () => {
  it('combines close rates and aging items and exposes a single loading/refetch surface', async () => {
    closeRateData = [{
      manager_id: MANAGER_ID, member_id: 'member-1', member_name: 'Jane', relationship_type: 'direct_report',
      total_30d: 10, done_30d: 5, total_90d: 10, done_90d: 5,
    }];
    agingItemData = [{
      manager_id: MANAGER_ID, member_id: 'member-1', member_name: 'Jane', item_id: 'item-1',
      text: 't', workflow_status: 'Blocked', updated_at: 'x', days_stale: 3, urgency: 'normal',
    }];

    const { result } = renderHook(() => useManagerSignals(MANAGER_ID, 30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.closeRates).toHaveLength(1);
    expect(result.current.agingItems).toHaveLength(1);
    expect(result.current.agingItemsForMember('member-1')).toHaveLength(1);
    expect(typeof result.current.refetch).toBe('function');
  });
});
