import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useStrategicInitiatives } from '@/hooks/useRCDO';
import { supabase } from '@/integrations/supabase/client';

// Regression coverage for 505edf9: createInitiative used to insert new
// Strategic Initiatives with status: 'draft', a value the
// rc_strategic_initiatives_status_check DB constraint
// (not_started|on_track|at_risk|off_track|completed) has never accepted —
// every SI creation through this hook would have failed the CHECK
// constraint. It must write 'not_started'.

vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

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

const makeFetchChain = (rows: unknown[] = [], error: Error | null = null) => {
  const order = vi.fn(() => Promise.resolve({ data: rows, error }));
  const is = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, is, order };
};

const makeInsertChain = (row: unknown, error: Error | null = null) => {
  const single = vi.fn(() => Promise.resolve({ data: row, error }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert, select, single };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useStrategicInitiatives.createInitiative', () => {
  it('inserts a new SI with status "not_started", never "draft"', async () => {
    const initialFetch = makeFetchChain([]);
    const insertChain = makeInsertChain({ id: 'si-new', title: 'New SI' });
    const refetch = makeFetchChain([{ id: 'si-new', title: 'New SI' }]);

    mockedSupabase.from
      .mockReturnValueOnce({ select: initialFetch.select }) // mount fetch
      .mockReturnValueOnce({ insert: insertChain.insert }) // createInitiative
      .mockReturnValueOnce({ select: refetch.select }); // post-create refetch
    mockedSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const { result } = renderHook(() => useStrategicInitiatives('do-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createInitiative({
        defining_objective_id: 'do-1',
        title: 'New SI',
        owner_user_id: 'user-1',
      });
    });

    const insertedRow = insertChain.insert.mock.calls[0][0];
    expect(insertedRow.status).toBe('not_started');
    expect(insertedRow.status).not.toBe('draft');
  });

  it('does not fetch when doId is undefined', async () => {
    const { result } = renderHook(() => useStrategicInitiatives(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });
});
