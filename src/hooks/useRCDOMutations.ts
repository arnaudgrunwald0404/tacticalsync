import { supabase } from '@/integrations/supabase/client';

/**
 * Canonical DO/SI update, lock/unlock, and delete mutations — shared between
 * the canvas view (StrategyCanvas.tsx + *PanelContent.tsx) and the detail
 * view (DODetail.tsx/SIDetail.tsx) so both call the same Supabase writes
 * instead of maintaining separate, drifting implementations.
 *
 * Plain async functions (not hooks) that take the entity id as a call-time
 * argument — matching the existing useTasks.ts convention (createTask/
 * updateTask/deleteTask) rather than the useRCDO.ts resource-hook convention,
 * since callers here include StrategyCanvas's useCallback handlers that
 * target a different DO/SI id on every invocation (calling a `use*` hook
 * from inside those callbacks would violate the Rules of Hooks). They throw
 * on error rather than toasting internally, so each caller keeps its own
 * contextual error messaging (bulk vs. single vs. detail already differ).
 *
 * Lock-eligibility validation lives separately in `@/lib/rcdoValidation`
 * (getDOLockBlockers/getSILockBlockers) — callers should check that first
 * and only invoke lockDO()/lockInitiative() once there are no blockers.
 */

// ============================================================================
// Defining Objective
// ============================================================================

export interface UpdateDOPatch {
  title?: string;
  hypothesis?: string | null;
  owner_user_id?: string;
}

export async function updateDO(doId: string, patch: UpdateDOPatch): Promise<void> {
  const { error } = await supabase.from('rc_defining_objectives').update(patch).eq('id', doId);
  if (error) throw error;
}

export async function lockDO(doId: string, userId: string | undefined): Promise<void> {
  if (!userId) throw new Error('You must be logged in.');
  const { error } = await supabase
    .from('rc_defining_objectives')
    .update({ status: 'locked', locked_at: new Date().toISOString(), locked_by: userId })
    .eq('id', doId);
  if (error) throw error;
  // A DB trigger (20251122060500_cascade_unlock_si_on_do.sql) cascades this
  // lock to child SIs automatically — no manual SI write needed here.
}

export async function unlockDO(doId: string): Promise<void> {
  const { error } = await supabase
    .from('rc_defining_objectives')
    .update({ status: 'draft', locked_at: null, locked_by: null })
    .eq('id', doId);
  if (error) throw error;
  // Same trigger cascades the unlock to child SIs.
}

/**
 * rc_links/rc_checkins reference DOs/SIs by parent_type+parent_id with no
 * FK, so they must be cleaned up explicitly. Deleting the DO row cascades
 * to rc_do_metrics, rc_strategic_initiatives, and their rc_tasks via FK.
 *
 * Runs as a single-transaction RPC (delete_rc_do, added in
 * 20260808000434_add_delete_rc_do_and_initiative_rpcs.sql) rather than
 * separate .delete() calls, so every row this action touches lands in one
 * Postgres transaction — and therefore one batch_id for the rc_deleted_items
 * trash-capture trigger, letting a "restore what I just deleted" action
 * restore the whole thing instead of only part of it. The RPC looks up
 * child SI ids server-side, so callers no longer need to pass them.
 */
export async function deleteDO(doId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_rc_do', { p_do_id: doId });
  if (error) throw error;
}

// ============================================================================
// Strategic Initiative (also serves sub-SIs — same table, parent_si_id set)
// ============================================================================

export interface UpdateInitiativePatch {
  title?: string;
  description?: string | null;
  owner_user_id?: string | null;
  primary_success_metric?: string | null;
  benchmark?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  participant_user_ids?: string[];
  status?: string;
  accepts_sub_sis?: boolean;
}

export async function updateInitiative(siId: string, patch: UpdateInitiativePatch): Promise<void> {
  const { error } = await supabase.from('rc_strategic_initiatives').update(patch).eq('id', siId);
  if (error) throw error;
}

export async function lockInitiative(siId: string, userId: string | undefined): Promise<void> {
  const { error } = await supabase
    .from('rc_strategic_initiatives')
    .update({ locked_at: new Date().toISOString(), locked_by: userId ?? null })
    .eq('id', siId);
  if (error) throw error;
}

export async function unlockInitiative(siId: string): Promise<void> {
  const { error } = await supabase
    .from('rc_strategic_initiatives')
    .update({ locked_at: null, locked_by: null })
    .eq('id', siId);
  if (error) throw error;
}

/**
 * rc_tasks.strategic_initiative_id cascades via FK; rc_links/rc_checkins need
 * explicit cleanup (no FK). Runs as a single-transaction RPC
 * (delete_rc_initiative, added in
 * 20260808000434_add_delete_rc_do_and_initiative_rpcs.sql) for the same
 * batch_id reason as deleteDO above.
 */
export async function deleteInitiative(siId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_rc_initiative', { p_si_id: siId });
  if (error) throw error;
}
