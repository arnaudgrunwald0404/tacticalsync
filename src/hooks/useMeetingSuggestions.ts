import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CosLayoutConfig } from '@/types/cos';
import { buildTargetOptions, resolveTarget, type TargetOption } from '@/lib/meetingSuggestions';

export type { TargetOption } from '@/lib/meetingSuggestions';

// ── Types ──────────────────────────────────────────────────────────────────

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
  date: string;
}

interface Member { id: string; name: string }

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseMeetingSuggestionsArgs {
  userId: string | null;
  layoutConfig: CosLayoutConfig;
  members: Member[];
  /** Creates the actual list item. Owned by the parent so its optimistic
   *  priorities state stays in sync. */
  onAddToList: (category: string, title: string) => Promise<void> | void;
}

interface UseMeetingSuggestionsReturn {
  suggestions: MeetingSuggestion[];
  loading: boolean;
  refreshing: boolean;
  targetOptions: TargetOption[];
  resolve: (category: string | null | undefined) => TargetOption | undefined;
  addToList: (id: string, category: string) => Promise<void>;
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

  const targetOptions = buildTargetOptions(layoutConfig);

  const load = useCallback(async () => {
    if (!userId) return;
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('dci_suggested_tasks')
      .select('id, title, source, source_type, urgency, rationale, raw_context, suggested_category, member_id, date')
      .eq('user_id', userId)
      .eq('status', 'pending')
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

  const addToList = useCallback(async (id: string, category: string) => {
    const suggestion = suggestions.find(s => s.id === id);
    if (!suggestion) return;
    // Optimistically drop it from the panel.
    setSuggestions(prev => prev.filter(s => s.id !== id));
    await onAddToList(category, suggestion.title);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('dci_suggested_tasks')
      .update({ status: 'accepted' })
      .eq('id', id);
  }, [suggestions, onAddToList]);

  const dismiss = useCallback(async (id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('dci_suggested_tasks')
      .update({ status: 'dismissed' })
      .eq('id', id);
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
