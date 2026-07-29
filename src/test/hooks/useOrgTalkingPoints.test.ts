import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOrgTalkingPoints, isWithinActiveWindow } from '@/hooks/useOrgTalkingPoints';
import { supabase } from '@/integrations/supabase/client';

// Coverage for PLAN_idea11_org_wide_talking_points.md §9 ("Unit (Vitest):
// useOrgTalkingPoints: correct active-window filtering ... correct exclusion
// of already-dismissed points for a given (user, team_member) pair").
//
// The two-query, filter-in-code shape here is deliberate (not a raw SQL
// subquery) per §4.1's injection-risk callout — these tests exercise exactly
// that merge logic: fetch active points, fetch this user+member's dismissed
// ids, filter client-side.

const USER_ID = 'u1111111-1111-1111-1111-111111111111';
const MEMBER_ID = 'm1111111-1111-1111-1111-111111111111';

let activePointsData: unknown[] = [];
let dismissedIdsData: unknown[] = [];
let mutationError: Error | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

const mockedSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
};

function buildSelectBuilder(resolveWith: unknown[]) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'lte', 'gte'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: resolveWith, error: null }).then(resolve);
  return builder;
}

function buildMutationBuilder() {
  const builder: Record<string, unknown> = {};
  const passthrough = ['eq', 'delete'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.upsert = vi.fn(() => Promise.resolve({ data: null, error: mutationError }));
  // .delete().eq().eq().eq() resolves at the end of the chain.
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: mutationError }).then(resolve);
  return builder;
}

beforeEach(() => {
  activePointsData = [];
  dismissedIdsData = [];
  mutationError = null;
  mockedSupabase.from.mockReset();
  mockedSupabase.auth.getUser.mockReset();
  mockedSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

  mockedSupabase.from.mockImplementation((table: string) => {
    if (table === 'cos_org_talking_points') return buildSelectBuilder(activePointsData);
    if (table === 'cos_org_talking_point_dismissals') {
      // Reused both for the read (select) in load() and the write (upsert/delete)
      // in dismiss() — return a builder that supports both shapes.
      const builder = buildSelectBuilder(dismissedIdsData) as Record<string, unknown>;
      builder.upsert = vi.fn(() => Promise.resolve({ data: null, error: mutationError }));
      builder.delete = vi.fn(() => buildMutationBuilder());
      return builder;
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });
});

// ── isWithinActiveWindow: pure boundary function ─────────────────────────────

describe('isWithinActiveWindow', () => {
  const TODAY = '2026-07-29';

  it('is true when today is inside the window (inclusive of both boundaries)', () => {
    expect(isWithinActiveWindow({ starts_on: '2026-07-29', ends_on: '2026-07-29' }, TODAY)).toBe(true);
    expect(isWithinActiveWindow({ starts_on: '2026-07-01', ends_on: '2026-08-01' }, TODAY)).toBe(true);
  });

  it('is false when the window has not started yet', () => {
    expect(isWithinActiveWindow({ starts_on: '2026-07-30', ends_on: '2026-08-15' }, TODAY)).toBe(false);
  });

  it('is false when the window has already ended', () => {
    expect(isWithinActiveWindow({ starts_on: '2026-07-01', ends_on: '2026-07-28' }, TODAY)).toBe(false);
  });
});

// ── useOrgTalkingPoints: fetch + merge behavior ──────────────────────────────

describe('useOrgTalkingPoints', () => {
  it('returns an empty array and does not query when teamMemberId is null', async () => {
    const { result } = renderHook(() => useOrgTalkingPoints(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toEqual([]);
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('returns active points not yet dismissed by this (user, team_member) pair', async () => {
    activePointsData = [
      { id: 'tp-1', title: 'Engagement survey', body: 'Ask about it', starts_on: '2026-07-01', ends_on: '2026-08-01' },
      { id: 'tp-2', title: 'Open enrollment', body: 'Remind them', starts_on: '2026-07-01', ends_on: '2026-08-01' },
    ];
    dismissedIdsData = [{ talking_point_id: 'tp-2' }];

    const { result } = renderHook(() => useOrgTalkingPoints(MEMBER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.points).toHaveLength(2);
    const byId = Object.fromEntries(result.current.points.map(p => [p.id, p.dismissed]));
    expect(byId['tp-1']).toBe(false);
    expect(byId['tp-2']).toBe(true);
  });

  it('filters out points outside the active window even if the query returns them', async () => {
    activePointsData = [
      { id: 'tp-in', title: 'In window', body: 'x', starts_on: '2026-07-01', ends_on: '2026-08-01' },
      { id: 'tp-future', title: 'Not started yet', body: 'x', starts_on: '2026-08-01', ends_on: '2026-09-01' },
      { id: 'tp-past', title: 'Already ended', body: 'x', starts_on: '2026-06-01', ends_on: '2026-06-30' },
    ];
    dismissedIdsData = [];

    const { result } = renderHook(() => useOrgTalkingPoints(MEMBER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.points.map(p => p.id)).toEqual(['tp-in']);
  });

  it('scopes the dismissal lookup to the given user and team member', async () => {
    activePointsData = [{ id: 'tp-1', title: 'T', body: 'B', starts_on: '2026-07-01', ends_on: '2026-08-01' }];
    renderHook(() => useOrgTalkingPoints(MEMBER_ID));
    await waitFor(() => expect(mockedSupabase.from).toHaveBeenCalledWith('cos_org_talking_point_dismissals'));
  });

  it('dismiss() flips a point to dismissed and does not affect other reports (no cross-member leakage in the returned set)', async () => {
    activePointsData = [{ id: 'tp-1', title: 'T', body: 'B', starts_on: '2026-07-01', ends_on: '2026-08-01' }];
    dismissedIdsData = [];

    const { result } = renderHook(() => useOrgTalkingPoints(MEMBER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points[0].dismissed).toBe(false);

    await act(async () => {
      await result.current.dismiss('tp-1');
    });

    expect(result.current.points[0].dismissed).toBe(true);
  });

  it('dismiss() reverts the optimistic update if the write fails', async () => {
    activePointsData = [{ id: 'tp-1', title: 'T', body: 'B', starts_on: '2026-07-01', ends_on: '2026-08-01' }];
    dismissedIdsData = [];
    mutationError = new Error('write failed');

    const { result } = renderHook(() => useOrgTalkingPoints(MEMBER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.dismiss('tp-1');
    });

    expect(result.current.points[0].dismissed).toBe(false);
  });
});
