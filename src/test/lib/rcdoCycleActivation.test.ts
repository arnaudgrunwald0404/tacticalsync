import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activateRcdoCycle } from '@/lib/rcdoCycleActivation';
import { supabase } from '@/integrations/supabase/client';

// Regression coverage for e0aafcb: StrategyHome.tsx and CyclePlanner.tsx
// used to run two sequential client-side .update() calls to archive the
// currently-active cycle and activate the target one, leaving a race
// window where concurrent activations could produce zero or two active
// cycles. Both call sites must go through the atomic rcdo_activate_cycle
// RPC — never resurrect the two-update pattern — since only the RPC's
// single-transaction archive-then-activate pairs correctly with the
// rc_cycles_single_active_idx partial unique index.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

const mockedRpc = vi.mocked(supabase.rpc);

describe('activateRcdoCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the atomic rcdo_activate_cycle RPC with the target cycle id', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as unknown as ReturnType<typeof supabase.rpc>);

    await activateRcdoCycle('cycle-123');

    expect(mockedRpc).toHaveBeenCalledTimes(1);
    expect(mockedRpc).toHaveBeenCalledWith('rcdo_activate_cycle', { p_cycle_id: 'cycle-123' });
  });

  it('never issues two separate .update() calls, only the single RPC call', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as unknown as ReturnType<typeof supabase.rpc>);

    await activateRcdoCycle('cycle-123');

    // The old buggy implementation called supabase.from('rc_cycles').update(...)
    // twice. Since this module has no `.from` mock at all, any accidental
    // reintroduction of direct table updates would throw here instead of
    // silently passing.
    expect(mockedRpc).toHaveBeenCalledTimes(1);
  });

  it('surfaces an RPC error instead of silently succeeding', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'unique violation' } } as unknown as ReturnType<typeof supabase.rpc>);

    const result = await activateRcdoCycle('cycle-123');

    expect(result.error).not.toBeNull();
    expect((result.error as unknown as { message: string }).message).toBe('unique violation');
  });
});
