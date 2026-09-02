import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CosLayoutConfig } from '@/types/cos';
import { buildTargetOptions, resolveTarget, type TargetOption } from '@/lib/meetingSuggestions';

export type { TargetOption } from '@/lib/meetingSuggestions';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SuggestionTagRecommendation {
  tag_id: string;
  tag_name: string;
  color: string;
  reason: string;
}

export interface MeetingSuggestion {
  id: string;
  title: string;
  source: string | null;
  source_type: string | null;
  urgency: string | null;
  rationale: string | null;
  raw_context: string | null;
  suggested_category: string | null;
  member_id: string | null;
  memberName: string | null;
  group_meeting_id: string | null;
  date: string;
  tag_suggestions: SuggestionTagRecommendation[];
  source_url: string | null;
}

interface Member { id: string; name: string }

// ── Hook ─────────────────────────────────────────────────────────────────────

// Generic over Destination: each caller has its own idea of "where this goes"
// (the Inbox panel passes an array of tag ids; the Chief-of-Staff panel passes
// a single category string) — the hook never inspects it, just forwards it.
interface UseMeetingSuggestionsArgs<Destination> {
  userId: string | null;
  layoutConfig: CosLayoutConfig;
  members: Member[];
  /** Creates the actual list item. Owned by the parent so its optimistic
   *  priorities state stays in sync. */
  onAddToList: (destination: Destination, title: string) => Promise<void> | void;
  /** Called after a manual re-scan completes. The re-scan can also archive or
   *  resolve items owned by other hooks (agent_question inbox items closed by
   *  the reconcile/suppression sweeps) — the parent reloads those here so
   *  handled items actually leave the screen. */
  onAfterRefresh?: () => Promise<void> | void;
}

interface UseMeetingSuggestionsReturn<Destination> {
  suggestions: MeetingSuggestion[];
  loading: boolean;
  refreshing: boolean;
  targetOptions: TargetOption[];
  resolve: (category: string | null | undefined) => TargetOption | undefined;
  addToList: (id: string, destination: Destination) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const STALE_DAYS = 14;

export function useMeetingSuggestions<Destination>({
  userId, layoutConfig, members, onAddToList, onAfterRefresh,
}: UseMeetingSuggestionsArgs<Destination>): UseMeetingSuggestionsReturn<Destination> {
  const [suggestions, setSuggestions] = useState<MeetingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Guards against a suggestion being actioned twice (e.g. a fast double-click)
  // before the optimistic state update has re-rendered and removed its row.
  const pendingRef = useRef<Set<string>>(new Set());

  const targetOptions = buildTargetOptions(layoutConfig);

  const load = useCallback(async () => {
    if (!userId) return;
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('dci_suggested_tasks')
      .select('id, title, source, source_type, urgency, rationale, raw_context, suggested_category, member_id, group_meeting_id, date, tag_suggestions')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .is('assignee_member_id', null)
      .gte('date', cutoff)
      .order('date', { ascending: false });

    const memberName = new Map(members.map(m => [m.id, m.name]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: MeetingSuggestion[] = (data ?? []).map((r: any) => ({
      ...r,
      memberName: r.member_id ? memberName.get(r.member_id) ?? null : null,
    }));
    setSuggestions(rows);
    setLoading(false);
  }, [userId, members]);

  useEffect(() => { load(); }, [load]);

  const addToList = useCallback(async (id: string, destination: Destination) => {
    if (pendingRef.current.has(id)) return; // already being actioned — avoid a duplicate add
    const suggestion = suggestions.find(s => s.id === id);
    if (!suggestion) return;
    pendingRef.current.add(id);
    // Optimistically drop it from the panel.
    setSuggestions(prev => prev.filter(s => s.id !== id));
    try {
      // Persist the status change first: if this panel unmounts/remounts (e.g. the
      // user switches tabs) while the slower item-creation call below is still in
      // flight, a refetch must never see this suggestion as still "pending" —
      // otherwise it reappears and can be actioned a second time, creating a duplicate.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('dci_suggested_tasks')
        .update({ status: 'accepted' })
        .eq('id', id);
      await onAddToList(destination, suggestion.title);
    } finally {
      pendingRef.current.delete(id);
    }
  }, [suggestions, onAddToList]);

  const dismiss = useCallback(async (id: string) => {
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);
    setSuggestions(prev => prev.filter(s => s.id !== id));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('dci_suggested_tasks')
        .update({ status: 'dismissed' })
        .eq('id', id);
    } finally {
      pendingRef.current.delete(id);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Each function is incremental server-side: per-user scan cursors limit
      // the fetch to content newer than the last completed scan, and a
      // 10-minute cooldown skips the LLM extraction entirely on rapid
      // re-clicks. The validation passes (resolve suggestions whose email/
      // Slack thread was answered) and the dismissal-rule sweep are DB-only
      // and run on every click regardless of cooldown. `days` is just the
      // outer cap on the window, not the amount re-scanned.
      await Promise.allSettled([
        supabase.functions.invoke('generate-meeting-suggestions', { body: {} }),
        supabase.functions.invoke('slack-inbox-sync', { body: { days: 7 } }),
        supabase.functions.invoke('gmail-inbox-sync', { body: { days: 7 } }),
        // Owns the agent_question pipeline: scans new Slack/Gmail content,
        // archives items already answered at the source, and applies the
        // latest learned suppression rules to open items.
        supabase.functions.invoke('extract-inbox-action-items', { body: {} }),
      ]);
    } finally {
      await load();
      await onAfterRefresh?.();
      setRefreshing(false);
    }
  }, [load, onAfterRefresh]);

  return {
    suggestions, loading, refreshing, targetOptions,
    resolve: (category) => resolveTarget(category, targetOptions),
    addToList, dismiss, refresh,
  };
}
