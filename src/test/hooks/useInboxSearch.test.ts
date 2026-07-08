import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useInboxItems } from '@/hooks/useInboxItems';
import { supabase } from '@/integrations/supabase/client';
import type { InboxItemType } from '@/types/inbox';

// ─────────────────────────────────────────────────────────────────────────────
// Integration: prove useInboxItems.load() builds the search filter correctly
// and combines it (AND) with other active filters — this is the query-building
// half of the search feature; sanitizeSearchTerm's escaping is unit-tested
// separately in inboxValidation.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const USER = '11111111-1111-1111-1111-111111111111';

let orSpy: ReturnType<typeof vi.fn>;
let inSpy: ReturnType<typeof vi.fn>;
let builder: Record<string, unknown>;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from;

function buildBuilder() {
  orSpy = vi.fn(() => builder);
  inSpy = vi.fn(() => builder);
  builder = {};
  const passthrough = ['select', 'eq', 'order', 'not', 'limit', 'contains'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.or = orSpy;
  builder.in = inSpy;
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null });
}

beforeEach(() => {
  buildBuilder();
  mockedFrom.mockReset();
  mockedFrom.mockImplementation(() => builder);
});

// Stable references: useInboxItems lists `filter` as a useCallback/useEffect
// dep, so a fresh {} literal per render would re-create load() and re-fire
// the effect on every render, and `loading` would never settle to false
// within a test's wait window (see useInboxValidation.test.ts's FILTER
// constant for the same reasoning).
const NO_SEARCH = {};
const WHITESPACE_SEARCH = { search: '   ' };
const REAL_SEARCH = { search: 'expense report' };
const INJECTION_SEARCH = { search: 'x%,status.eq.done' };
const SEARCH_WITH_TYPE = { search: 'standup', types: ['task'] as InboxItemType[] };

describe('useInboxItems search filtering', () => {
  it('does not call .or() when no search term is set', async () => {
    const hook = renderHook(() => useInboxItems(USER, NO_SEARCH));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(orSpy).not.toHaveBeenCalled();
  });

  it('does not call .or() for a whitespace-only search term', async () => {
    const hook = renderHook(() => useInboxItems(USER, WHITESPACE_SEARCH));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(orSpy).not.toHaveBeenCalled();
  });

  it('builds an ilike .or() clause across text and body for a real search term', async () => {
    const hook = renderHook(() => useInboxItems(USER, REAL_SEARCH));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(orSpy).toHaveBeenCalledTimes(1);
    const [clause] = orSpy.mock.calls[0];
    expect(clause).toContain('text.ilike.%expense report%');
    expect(clause).toContain('body.ilike.%expense report%');
  });

  it('sanitizes a search term containing filter-string syntax before building the clause', async () => {
    const hook = renderHook(() => useInboxItems(USER, INJECTION_SEARCH));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const [clause] = orSpy.mock.calls[0];
    // The comma must not have produced a third top-level .or() branch.
    expect(clause.split(',').length).toBe(2);
  });

  it('combines search with an active type filter (both applied to the same query)', async () => {
    const hook = renderHook(() => useInboxItems(USER, SEARCH_WITH_TYPE));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(orSpy).toHaveBeenCalledTimes(1);
    expect(inSpy).toHaveBeenCalledWith('type', ['task']);
  });
});
