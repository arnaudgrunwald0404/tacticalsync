import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────────
//
// IMPORTANT framing note (see PLAN_idea9_manager_signals.md §2.2 and §4):
// every value returned by this hook is computed from the MANAGER'S OWN
// inbox_items — items the manager tagged with a direct report's name. It is
// never the report's own activity (cos_team_members has no verified link to
// the report's actual account). Consumers of this hook must not present these
// numbers as describing the report's behavior or performance — see the
// coaching-framing copy in ManagerSignalsPanel.

export type SignalWindow = 30 | 90;

/** Minimum tagged items in-window before we render a rate instead of a "not enough data" state. */
export const MIN_ITEMS_FOR_RATE = 5;

export interface ManagerCloseRate {
  managerId: string;
  memberId: string;
  memberName: string;
  relationshipType: string;
  total30d: number;
  done30d: number;
  total90d: number;
  done90d: number;
}

export interface ManagerCloseRateSummary extends ManagerCloseRate {
  /** Total/done for the currently-selected window. */
  total: number;
  done: number;
  /** null when `total < MIN_ITEMS_FOR_RATE` — render the low-N copy instead. */
  rate: number | null;
  hasEnoughData: boolean;
}

export type AgingUrgency = 'critical' | 'warning' | 'normal';

export interface ManagerAgingItem {
  managerId: string;
  memberId: string;
  memberName: string;
  itemId: string;
  text: string;
  workflowStatus: string;
  updatedAt: string;
  daysStale: number;
  urgency: AgingUrgency;
}

// ── Row shapes returned by the SQL views (supabase/migrations/20260721000000_manager_signal_views.sql) ──

interface CloseRateRow {
  manager_id: string;
  member_id: string;
  member_name: string;
  relationship_type: string;
  total_30d: number;
  done_30d: number;
  total_90d: number;
  done_90d: number;
}

interface AgingItemRow {
  manager_id: string;
  member_id: string;
  member_name: string;
  item_id: string;
  text: string;
  workflow_status: string;
  updated_at: string;
  days_stale: number;
  urgency: AgingUrgency;
}

function rowToCloseRate(r: CloseRateRow): ManagerCloseRate {
  return {
    managerId: r.manager_id,
    memberId: r.member_id,
    memberName: r.member_name,
    relationshipType: r.relationship_type,
    total30d: r.total_30d ?? 0,
    done30d: r.done_30d ?? 0,
    total90d: r.total_90d ?? 0,
    done90d: r.done_90d ?? 0,
  };
}

function rowToAgingItem(r: AgingItemRow): ManagerAgingItem {
  return {
    managerId: r.manager_id,
    memberId: r.member_id,
    memberName: r.member_name,
    itemId: r.item_id,
    text: r.text,
    workflowStatus: r.workflow_status,
    updatedAt: r.updated_at,
    daysStale: r.days_stale,
    urgency: r.urgency,
  };
}

/** Applies the low-N guard (§3.1 / §8a.1 of the plan): below MIN_ITEMS_FOR_RATE, `rate` is null. */
export function withRateSummary(row: ManagerCloseRate, windowDays: SignalWindow): ManagerCloseRateSummary {
  const total = windowDays === 30 ? row.total30d : row.total90d;
  const done = windowDays === 30 ? row.done30d : row.done90d;
  const hasEnoughData = total >= MIN_ITEMS_FOR_RATE;
  return {
    ...row,
    total,
    done,
    hasEnoughData,
    rate: hasEnoughData ? done / total : null,
  };
}

// ── useManagerCloseRates ─────────────────────────────────────────────────────

export function useManagerCloseRates(managerId: string | null, windowDays: SignalWindow = 30) {
  const [rows, setRows] = useState<ManagerCloseRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCloseRates = useCallback(async () => {
    if (!managerId) {
      setRows([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      // .eq('manager_id', managerId) is defensive, not load-bearing for security:
      // RLS on the underlying tables already restricts every row to the caller's
      // own data (see plan §6.2). Kept for query-planning clarity and as a
      // second guard against a future SECURITY DEFINER regression on the view.
      const { data, error: fetchError } = await supabase
        .from('cos_manager_signal_close_rate' as never)
        .select('*')
        .eq('manager_id', managerId)
        .order('member_name', { ascending: true });

      if (fetchError) throw fetchError;
      setRows(((data ?? []) as unknown as CloseRateRow[]).map(rowToCloseRate));
    } catch (err) {
      console.error('Failed to fetch manager close-rate signals:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { fetchCloseRates(); }, [fetchCloseRates]);

  const summaries = rows.map((r) => withRateSummary(r, windowDays));

  return { closeRates: summaries, loading, error, refetch: fetchCloseRates };
}

// ── useManagerAgingItems ─────────────────────────────────────────────────────

export function useManagerAgingItems(managerId: string | null) {
  const [items, setItems] = useState<ManagerAgingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgingItems = useCallback(async () => {
    if (!managerId) {
      setItems([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('cos_manager_signal_aging_items' as never)
        .select('*')
        .eq('manager_id', managerId)
        .order('days_stale', { ascending: false });

      if (fetchError) throw fetchError;
      setItems(((data ?? []) as unknown as AgingItemRow[]).map(rowToAgingItem));
    } catch (err) {
      console.error('Failed to fetch manager aging-item signals:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { fetchAgingItems(); }, [fetchAgingItems]);

  /** Top N oldest items for a given report, per plan §3.2 ("surface top N oldest per person"). */
  const forMember = useCallback((memberId: string, limit = 5) =>
    items.filter((i) => i.memberId === memberId).slice(0, limit),
  [items]);

  return { agingItems: items, loading, error, refetch: fetchAgingItems, forMember };
}

// ── useManagerSignals (composition root) ─────────────────────────────────────

export function useManagerSignals(managerId: string | null, windowDays: SignalWindow = 30) {
  const closeRateState = useManagerCloseRates(managerId, windowDays);
  const agingItemsState = useManagerAgingItems(managerId);

  const refetch = useCallback(() => {
    closeRateState.refetch();
    agingItemsState.refetch();
  }, [closeRateState, agingItemsState]);

  return {
    closeRates: closeRateState.closeRates,
    agingItems: agingItemsState.agingItems,
    agingItemsForMember: agingItemsState.forMember,
    loading: closeRateState.loading || agingItemsState.loading,
    error: closeRateState.error ?? agingItemsState.error,
    refetch,
  };
}
