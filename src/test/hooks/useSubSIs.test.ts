import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSubSIs } from '@/hooks/useSubSIs';
import { supabase } from '@/integrations/supabase/client';

// Mock the toast hook. Critical: the returned `toast` must be a STABLE
// reference across renders — useSubSIs lists `toast` as a useCallback dep,
// and a fresh reference each render destabilizes the callback, triggers a
// re-fetch, and loops forever. We freeze the object and return the same one.
vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  const ret = { toast };
  return { useToast: () => ret };
});

// Supabase mock: each call returns a thenable builder so the hook can chain
// `.from('table').select(...).eq(...).order(...)` and `.insert(...).select().single()`
// without us hand-rolling every method. The mock per-test replaces these functions.
type SelectChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

vi.mock('@/integrations/supabase/client', () => {
  const from = vi.fn();
  return {
    supabase: {
      from,
      auth: { getUser: vi.fn() },
    },
  };
});

const mockedSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
};

const makeFetchChain = (rows: unknown[], error: Error | null = null) => {
  // Mirrors `.from('rc_strategic_initiatives').select(...).eq(...).order(...)`:
  // each step returns the same builder until `.order()` resolves (it's awaited).
  const orderResult = Promise.resolve({ data: rows, error });
  const order = vi.fn(() => orderResult);
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, order };
};

const makeInsertChain = (row: unknown, error: Error | null = null) => {
  // Mirrors `.from(...).insert(...).select(...).single()`.
  const singleResult = Promise.resolve({ data: row, error });
  const single = vi.fn(() => singleResult);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert, select, single };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSubSIs', () => {
  it('returns empty subSIs and stops loading when no parentSiId given', async () => {
    const { result } = renderHook(() => useSubSIs(undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subSIs).toEqual([]);
    // No query should have been issued.
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('fetches sub-SIs for the given parent and exposes them ordered', async () => {
    const rows = [
      { id: 'sub-a', title: 'Alpha', display_order: 0 },
      { id: 'sub-b', title: 'Beta', display_order: 1 },
    ];
    const fetchChain = makeFetchChain(rows);
    mockedSupabase.from.mockReturnValue({ select: fetchChain.select });

    const { result } = renderHook(() => useSubSIs('parent-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subSIs).toEqual(rows);
    // The hook filters to children of parent-1 and orders by display_order.
    expect(mockedSupabase.from).toHaveBeenCalledWith('rc_strategic_initiatives');
    expect(fetchChain.eq).toHaveBeenCalledWith('parent_si_id', 'parent-1');
    expect(fetchChain.order).toHaveBeenCalledWith('display_order', { ascending: true });
  });

  it('leaves subSIs empty (and surfaces nothing) when the fetch errors', async () => {
    // The hook catches the error and shows a toast — here we just verify the
    // hook returns gracefully without populating subSIs.
    const fetchChain = makeFetchChain([], new Error('boom'));
    mockedSupabase.from.mockReturnValue({ select: fetchChain.select });

    const { result } = renderHook(() => useSubSIs('parent-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subSIs).toEqual([]);
  });

  describe('createSubSI', () => {
    it('inserts with display_order = (max existing + 1) and refetches', async () => {
      // Initial fetch: two existing sub-SIs at orders 0 and 1.
      const existingRows = [
        { id: 'sub-a', title: 'Alpha', display_order: 0 },
        { id: 'sub-b', title: 'Beta', display_order: 1 },
      ];
      const initialFetch = makeFetchChain(existingRows);
      const insertChain = makeInsertChain({ id: 'sub-c', title: 'New', display_order: 2 });
      const refetch = makeFetchChain([
        ...existingRows,
        { id: 'sub-c', title: 'New', display_order: 2 },
      ]);

      // Sequence the supabase mock to return different builders for the
      // initial fetch, the insert, and the post-insert refetch.
      mockedSupabase.from
        .mockReturnValueOnce({ select: initialFetch.select }) // initial fetch
        .mockReturnValueOnce({ insert: insertChain.insert }) // createSubSI insert
        .mockReturnValueOnce({ select: refetch.select }); // refetch
      mockedSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const { result } = renderHook(() => useSubSIs('parent-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.subSIs).toHaveLength(2);

      await act(async () => {
        const created = await result.current.createSubSI('do-1', 'New');
        expect(created).toMatchObject({ id: 'sub-c', title: 'New' });
      });

      // The insert payload should have:
      //   - parent_si_id = 'parent-1'
      //   - defining_objective_id = 'do-1'
      //   - title = 'New'
      //   - display_order = 2 (max of 0,1 + 1)
      //   - owner_user_id = current auth user
      const insertedRow = insertChain.insert.mock.calls[0][0];
      expect(insertedRow.parent_si_id).toBe('parent-1');
      expect(insertedRow.defining_objective_id).toBe('do-1');
      expect(insertedRow.title).toBe('New');
      expect(insertedRow.display_order).toBe(2);
      expect(insertedRow.owner_user_id).toBe('user-1');
    });

    it('uses display_order = 0 when there are no existing sub-SIs', async () => {
      const initialFetch = makeFetchChain([]);
      const insertChain = makeInsertChain({ id: 'sub-a', title: 'First', display_order: 0 });
      const refetch = makeFetchChain([{ id: 'sub-a', title: 'First', display_order: 0 }]);

      mockedSupabase.from
        .mockReturnValueOnce({ select: initialFetch.select })
        .mockReturnValueOnce({ insert: insertChain.insert })
        .mockReturnValueOnce({ select: refetch.select });
      mockedSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const { result } = renderHook(() => useSubSIs('parent-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.createSubSI('do-1', 'First');
      });

      expect(insertChain.insert.mock.calls[0][0].display_order).toBe(0);
    });

    it('returns null and does not throw when the insert errors', async () => {
      const initialFetch = makeFetchChain([]);
      const insertChain = makeInsertChain(null, new Error('insert failed'));

      mockedSupabase.from
        .mockReturnValueOnce({ select: initialFetch.select })
        .mockReturnValueOnce({ insert: insertChain.insert });
      mockedSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const { result } = renderHook(() => useSubSIs('parent-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let created: unknown;
      await act(async () => {
        created = await result.current.createSubSI('do-1', 'Doomed');
      });
      expect(created).toBeNull();
    });
  });
});
