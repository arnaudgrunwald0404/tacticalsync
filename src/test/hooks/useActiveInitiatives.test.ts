import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActiveInitiatives } from '@/hooks/useActiveInitiatives';
import { supabase } from '@/integrations/supabase/client';

// Regression coverage for 505edf9: the #-hashtag SI picker in meeting
// priorities used to filter on a pre-migration status set
// ('draft','not_started','active','blocked') that no longer matches any
// value the rc_strategic_initiatives_status_check DB constraint accepts —
// SIs would never surface in the picker regardless of their real status.
// The filter must match the current "still in play" set, excluding only
// 'completed'.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = vi.mocked(supabase.from);

describe('useActiveInitiatives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters SIs on the current in-play statuses, excluding only completed', async () => {
    const activeCycleChain = { maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'cycle-1' } })) };
    const cycleEq = vi.fn(() => activeCycleChain);
    const cycleSelect = vi.fn(() => ({ eq: cycleEq }));

    const rallyChain = { maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'rc-1' } })) };
    const rallyEq = vi.fn(() => rallyChain);
    const rallySelect = vi.fn(() => ({ eq: rallyEq }));

    const order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const inCall = vi.fn(() => ({ order }));
    const isCall = vi.fn(() => ({ in: inCall }));
    const siEq = vi.fn(() => ({ is: isCall }));
    const siSelect = vi.fn(() => ({ eq: siEq }));

    mockedFrom
      .mockReturnValueOnce({ select: cycleSelect } as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce({ select: rallySelect } as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce({ select: siSelect } as unknown as ReturnType<typeof supabase.from>);

    const { result } = renderHook(() => useActiveInitiatives('team-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(inCall).toHaveBeenCalledWith('status', ['not_started', 'on_track', 'at_risk', 'off_track']);

    const filterArg = inCall.mock.calls[0][1] as string[];
    expect(filterArg).not.toContain('completed');
    expect(filterArg).not.toContain('draft');
    expect(filterArg).not.toContain('active');
    expect(filterArg).not.toContain('blocked');
  });

  it('returns no initiatives when there is no active cycle', async () => {
    const activeCycleChain = { maybeSingle: vi.fn(() => Promise.resolve({ data: null })) };
    const cycleEq = vi.fn(() => activeCycleChain);
    const cycleSelect = vi.fn(() => ({ eq: cycleEq }));
    mockedFrom.mockReturnValueOnce({ select: cycleSelect } as unknown as ReturnType<typeof supabase.from>);

    const { result } = renderHook(() => useActiveInitiatives('team-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.initiatives).toEqual([]);
  });
});
