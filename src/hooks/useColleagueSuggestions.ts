import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ColleagueSuggestion {
  id: string;
  title: string;
  source: string | null;
  source_type: string | null;
  rationale: string | null;
  raw_context: string | null;
  date: string;
}

interface UseColleagueSuggestionsReturn {
  suggestions: ColleagueSuggestion[];
  loading: boolean;
  accept: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  reload: () => void;
}

const STALE_DAYS = 14;

export function useColleagueSuggestions(memberId: string | null): UseColleagueSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<ColleagueSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!memberId) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('dci_suggested_tasks')
        .select('id, title, source, source_type, rationale, raw_context, date')
        .eq('user_id', user.id)
        .eq('assignee_member_id', memberId)
        .eq('status', 'pending')
        .gte('date', cutoff)
        .order('date', { ascending: false });

      if (!cancelled) {
        setSuggestions(data ?? []);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [memberId, reloadKey]);

  const accept = useCallback(async (id: string) => {
    if (!memberId) return;
    const suggestion = suggestions.find(s => s.id === id);
    if (!suggestion) return;
    setSuggestions(prev => prev.filter(s => s.id !== id));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    await db.from('cos_meeting_actions').insert({
      user_id: user.id,
      member_id: memberId,
      text: suggestion.title,
      owner: 'them',
      status: 'pending',
    });
    await db.from('dci_suggested_tasks').update({ status: 'accepted' }).eq('id', id);
  }, [suggestions, memberId]);

  const dismiss = useCallback(async (id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('dci_suggested_tasks')
      .update({ status: 'dismissed' })
      .eq('id', id);
  }, []);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  return { suggestions, loading, accept, dismiss, reload };
}
