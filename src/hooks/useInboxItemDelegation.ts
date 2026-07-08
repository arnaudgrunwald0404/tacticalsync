import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Person-to-person inbox item delegation (Idea #8 — "People delegation with
 * a paper trail"). Deliberately named/typed distinctly from
 * useInboxDelegation.ts, which is the AI-agent delegation hook (a different
 * feature — see PLAN_idea8_people_delegation.md §1.3).
 *
 * inbox_item_delegations and inbox_items.active_delegation_id are not yet in
 * the generated Supabase types (schema was hand-authored in this pass, no
 * Docker/type-regen available in this environment) — follows the same
 * `(supabase as any)` escape hatch used by useCosTeamMemberLinking.ts for
 * the equivalent situation.
 */

export type InboxItemDelegationStatus = 'pending' | 'accepted' | 'done' | 'cancelled';

export interface InboxItemDelegation {
  id: string;
  source_item_id: string;
  delegator_user_id: string;
  delegatee_user_id: string;
  delegatee_item_id: string | null;
  team_member_id: string | null;
  status: InboxItemDelegationStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A delegation the current user delegated out, joined with the linked
 *  teammate's display name for the "Waiting on X" chip. */
export interface OutgoingDelegationInfo extends InboxItemDelegation {
  delegateeName: string;
}

/** A delegation delegated to the current user, joined with the delegator's
 *  display name for the "From X" badge. */
export interface IncomingDelegationInfo extends InboxItemDelegation {
  delegatorName: string;
}

interface DelegateResult {
  success: boolean;
  error?: string;
  delegationId?: string;
  delegateeItemId?: string;
}

/**
 * Delegates `sourceItemId` to the teammate represented by `teamMemberId`.
 * Calls the delegate-inbox-item-to-person edge function (service-role —
 * needed because the delegator's own RLS grant cannot insert a row owned by
 * someone else's user_id). Surfaces `not_linked` distinctly so the caller
 * can route into the invite flow instead of showing a generic error.
 */
export async function delegateInboxItemToPerson(
  sourceItemId: string,
  teamMemberId: string,
  note?: string,
): Promise<DelegateResult> {
  try {
    const { data, error } = await supabase.functions.invoke('delegate-inbox-item-to-person', {
      body: { sourceItemId, teamMemberId, note },
    });
    if (error) {
      // supabase-js surfaces non-2xx responses as a generic FunctionsHttpError
      // without the JSON body attached in some client versions — try to read
      // the structured error the edge function actually returned.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const context = (error as any)?.context;
      let details: { error?: string } | null = null;
      try {
        details = context?.json ? await context.json() : null;
      } catch {
        details = null;
      }
      return { success: false, error: details?.error ?? error.message ?? 'unknown_error' };
    }
    const result = (data ?? {}) as { success?: boolean; error?: string; delegationId?: string; delegateeItemId?: string };
    if (!result.success) {
      return { success: false, error: result.error ?? 'unknown_error' };
    }
    return { success: true, delegationId: result.delegationId, delegateeItemId: result.delegateeItemId };
  } catch (err) {
    console.error('delegateInboxItemToPerson failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'unknown_error' };
  }
}

/** Cancels a delegation the current user created — archives the delegatee's
 *  copy via the DB trigger (fn_sync_delegation_on_cancel) and clears the
 *  delegator's active_delegation_id pointer. */
export async function cancelInboxItemDelegation(delegationId: string): Promise<{ success: boolean; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('inbox_item_delegations')
    .update({ status: 'cancelled' })
    .eq('id', delegationId);
  if (error) {
    console.error('cancelInboxItemDelegation failed', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Loads and keeps in sync (via realtime) the delegation state for a single
 * source item — used by the delegator's row to render "Waiting on Alex · 3d"
 * from live data (per PLAN §8.3), including the delegatee's display name.
 */
export function useOutgoingDelegation(sourceItemId: string | null) {
  const [delegation, setDelegation] = useState<OutgoingDelegationInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!sourceItemId) { setDelegation(null); return; }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('inbox_item_delegations')
      .select('*')
      .eq('source_item_id', sourceItemId)
      .in('status', ['pending', 'accepted', 'done'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const row = data as InboxItemDelegation;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: names } = await (supabase as any).rpc('get_inbox_delegation_display_names', {
        p_delegation_ids: [row.id],
      });
      const delegateeName = (names?.[0] as { delegatee_name?: string } | undefined)?.delegatee_name ?? 'teammate';
      setDelegation({ ...row, delegateeName });
    } else {
      setDelegation(null);
    }
    setLoading(false);
  }, [sourceItemId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!sourceItemId) return;
    const channel = supabase
      .channel(`inbox_item_delegation:source:${sourceItemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_item_delegations', filter: `source_item_id=eq.${sourceItemId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sourceItemId, load]);

  return { delegation, loading, refresh: load };
}

/**
 * Loads every delegation addressed to `userId` (the delegatee side) so the
 * inbox row can render the persistent "From Dan · 3 days ago" badge (PLAN
 * §8.3) keyed by the delegatee's own inbox_items.id (delegatee_item_id).
 */
export function useIncomingDelegations(userId: string | null) {
  const [byDelegateeItemId, setByDelegateeItemId] = useState<Record<string, IncomingDelegationInfo>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setByDelegateeItemId({}); return; }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('inbox_item_delegations')
      .select('*')
      .eq('delegatee_user_id', userId)
      .in('status', ['pending', 'accepted']);

    const rows = (data ?? []) as InboxItemDelegation[];
    let namesById: Record<string, string> = {};
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: names } = await (supabase as any).rpc('get_inbox_delegation_display_names', {
        p_delegation_ids: rows.map(r => r.id),
      });
      namesById = Object.fromEntries(
        ((names ?? []) as Array<{ delegation_id: string; delegator_name: string }>)
          .map(n => [n.delegation_id, n.delegator_name]),
      );
    }

    const map: Record<string, IncomingDelegationInfo> = {};
    for (const row of rows) {
      if (!row.delegatee_item_id) continue;
      map[row.delegatee_item_id] = { ...row, delegatorName: namesById[row.id] ?? 'a colleague' };
    }
    setByDelegateeItemId(map);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`inbox_item_delegation:delegatee:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_item_delegations', filter: `delegatee_user_id=eq.${userId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  return { byDelegateeItemId, loading, refresh: load };
}

/**
 * Single-item variant of useIncomingDelegations, for InboxItemRow to call
 * directly — matches the file's existing convention (useInboxDelegation and
 * useOutgoingDelegation are both called per-row from InboxItemRow itself)
 * rather than threading a delegation map as a new prop through
 * InboxGroupedView -> BucketSection -> SortableItem and
 * InboxByProjectView's two render sites. Looks up by delegatee_item_id
 * (this item's own id, since it's the delegatee's copy) rather than
 * source_item_id.
 */
export function useIncomingDelegationForItem(itemId: string | null) {
  const [info, setInfo] = useState<IncomingDelegationInfo | null>(null);

  const load = useCallback(async () => {
    if (!itemId) { setInfo(null); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('inbox_item_delegations')
      .select('*')
      .eq('delegatee_item_id', itemId)
      .in('status', ['pending', 'accepted'])
      .maybeSingle();

    if (!data) { setInfo(null); return; }
    const row = data as InboxItemDelegation;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: names } = await (supabase as any).rpc('get_inbox_delegation_display_names', {
      p_delegation_ids: [row.id],
    });
    const delegatorName = (names?.[0] as { delegator_name?: string } | undefined)?.delegator_name ?? 'a colleague';
    setInfo({ ...row, delegatorName });
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!itemId) return;
    const channel = supabase
      .channel(`inbox_item_delegation:delegatee_item:${itemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_item_delegations', filter: `delegatee_item_id=eq.${itemId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId, load]);

  return info;
}
