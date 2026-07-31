// Cascade-delete helpers for removing a Defining Objective or Strategic
// Initiative from the canvas.
//
// Regression coverage for a real bug (see f9f2e76 / 99695b3): the canvas
// delete handlers used to only filter the node out of local React state and
// never touched the database, so the DO/SI (and its rc_links/rc_checkins,
// which reference parents by parent_type+parent_id with no FK) stayed in
// rc_defining_objectives/rc_strategic_initiatives and could resurface on the
// next canvas reconciliation. These are extracted into standalone functions
// so the exact DB call sequence is unit-testable independent of React Flow
// state and the canvas's confirm()/toast plumbing.

import { supabase } from '@/integrations/supabase/client';

export interface CascadeDeleteResult {
  error: Error | null;
}

/**
 * Delete a Defining Objective and its cross-table references.
 *
 * rc_links/rc_checkins reference DOs and SIs by parent_type+parent_id (no
 * FK), so they must be cleaned up explicitly for both the DO and any SIs
 * nested under it — deleting the DO row itself only cascades (via FK) to
 * rc_do_metrics and rc_strategic_initiatives (and, through those, rc_tasks).
 */
export async function deleteDOCascade(
  doDbId: string,
  childSiDbIds: string[] = []
): Promise<CascadeDeleteResult> {
  await Promise.all([
    supabase.from('rc_links').delete().eq('parent_type', 'do').eq('parent_id', doDbId),
    childSiDbIds.length > 0
      ? supabase.from('rc_links').delete().eq('parent_type', 'si').in('parent_id', childSiDbIds)
      : Promise.resolve(),
    supabase.from('rc_checkins').delete().eq('parent_type', 'do').eq('parent_id', doDbId),
    childSiDbIds.length > 0
      ? supabase.from('rc_checkins').delete().eq('parent_type', 'si').in('parent_id', childSiDbIds)
      : Promise.resolve(),
  ]);

  const { error } = await supabase.from('rc_defining_objectives').delete().eq('id', doDbId);
  return { error: error as Error | null };
}

/**
 * Delete a Strategic Initiative and its cross-table references.
 *
 * Deleting the SI row cascades (via FK) to rc_tasks.
 */
export async function deleteSICascade(siDbId: string): Promise<CascadeDeleteResult> {
  await Promise.all([
    supabase.from('rc_links').delete().eq('parent_type', 'si').eq('parent_id', siDbId),
    supabase.from('rc_checkins').delete().eq('parent_type', 'si').eq('parent_id', siDbId),
  ]);

  const { error } = await supabase.from('rc_strategic_initiatives').delete().eq('id', siDbId);
  return { error: error as Error | null };
}
