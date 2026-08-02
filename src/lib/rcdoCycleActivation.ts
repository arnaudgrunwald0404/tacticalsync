// Atomic cycle-activation helper, extracted so the exact RPC call shape is
// unit-testable and shared between StrategyHome.tsx and CyclePlanner.tsx.
//
// Regression coverage for e0aafcb: rc_cycles.status was meant to have at
// most one 'active' row company-wide, but this was only enforced by two
// sequential client-side UPDATEs (archive whatever cycle is currently
// active, then activate the target cycle), leaving a race window where
// concurrent activations could produce zero or two active cycles. The fix
// added a partial unique index (rc_cycles_single_active_idx) plus an
// rcdo_activate_cycle(p_cycle_id) SQL function that performs the
// archive-old/activate-new sequence atomically in one transaction. Both
// call sites must go through that RPC — never two separate `.update()`
// calls — or the atomicity guarantee is lost even though the DB-level
// unique index still prevents silent corruption.

import { supabase } from '@/integrations/supabase/client';

export interface ActivateCycleResult {
  error: Error | null;
}

export async function activateRcdoCycle(cycleId: string): Promise<ActivateCycleResult> {
  const { error } = await supabase.rpc('rcdo_activate_cycle', {
    p_cycle_id: cycleId,
  });
  return { error: error as Error | null };
}
