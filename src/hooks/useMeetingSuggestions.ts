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

interface UseMeetingSuggestionsArgs {
  userId: string | null;
  layoutConfig: CosLayoutConfig;
  members: Member[];
  /** Creates the actual list item. Owned by the parent so its optimistic
   *  priorities state stays in sync. */
  onAddToList: (tagIds: string[], title: string) => Promise<void> | void;
}

interface UseMeetingSuggestionsReturn {
  suggestions: MeetingSuggestion[];
  loading: boolean;
  refreshing: boolean;
  targetOptions: TargetOption[];
  resolve: (category: string | null | undefined) => TargetOption | undefined;
  addToList: (id: string, tagIds: string[]) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const STALE_DAYS = 14;

export function useMeetingSuggestions({
  userId, layoutConfig, members, onAddToList,
}: UseMeetingSuggestionsArgs): UseMeetingSuggestionsReturn {
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

  const addToList = useCallback(async (id: string, tagIds: string[]) => {
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
      await onAddToList(tagIds, suggestion.title);
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
      await supabase.functions.invoke('generate-meeting-suggestions', { body: {} });
    } catch {
      /* surfaced as "no new suggestions" — non-fatal */
    } finally {
      await load();
      setRefreshing(false);
    }
  }, [load]);

  return {
    suggestions, loading, refreshing, targetOptions,
    resolve: (category) => resolveTarget(category, targetOptions),
    addToList, dismiss, refresh,
  };
}
