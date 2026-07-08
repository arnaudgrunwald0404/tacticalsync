import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { InboxView, InboxFilterState, InboxViewSort } from '@/types/inbox';
import { validateViewName } from '@/lib/inboxValidation';

// Mirrors the shape/conventions of useInboxTags.ts. `filter_json`/`sort_json`
// are jsonb columns typed loosely by the generated client — narrow them at
// this one boundary, same pattern as rowToTag/rowToItem elsewhere.
interface InboxViewRow {
  id: string;
  user_id: string;
  name: string;
  filter_json: unknown;
  sort_json: unknown;
  is_starred: boolean;
  sort_order: number;
  created_at: string;
}

const rowToView = (r: InboxViewRow): InboxView => ({
  ...r,
  filter_json: (r.filter_json as InboxFilterState) ?? {},
  sort_json: (r.sort_json as InboxViewSort) ?? { sortMode: 'byProject', prioritizeMode: false },
});

export function useInboxViews(userId: string | null) {
  const [views, setViews] = useState<InboxView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('inbox_views')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order');
    if (data) setViews((data as InboxViewRow[]).map(rowToView));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const createView = useCallback(async (
    name: string,
    filter: InboxFilterState,
    sort: InboxViewSort,
  ): Promise<InboxView | null> => {
    if (!userId) return null;
    const nameResult = validateViewName(name);
    if (!nameResult.ok) return null;

    const { data, error } = await supabase
      .from('inbox_views')
      .insert({
        user_id: userId,
        name: nameResult.value,
        filter_json: filter as unknown as Json,
        sort_json: sort as unknown as Json,
        sort_order: views.length,
      })
      .select()
      .single();
    if (error || !data) return null;
    const view = rowToView(data as InboxViewRow);
    setViews(prev => [...prev, view]);
    return view;
  }, [userId, views.length]);

  const renameView = useCallback(async (id: string, name: string) => {
    const nameResult = validateViewName(name);
    if (!nameResult.ok) return;
    await supabase.from('inbox_views').update({ name: nameResult.value }).eq('id', id);
    setViews(prev => prev.map(v => v.id === id ? { ...v, name: nameResult.value } : v));
  }, []);

  const deleteView = useCallback(async (id: string) => {
    await supabase.from('inbox_views').delete().eq('id', id);
    setViews(prev => prev.filter(v => v.id !== id));
  }, []);

  /**
   * Star `id` as the default view, unstarring any previously-starred view —
   * exclusive by design (see PLAN_idea2_dormant20.md Section 2's resolved
   * open question) so "default view" stays unambiguous. Unstarring `id`
   * itself (passing `starred: false`) just clears it, leaving no default.
   */
  const toggleStar = useCallback(async (id: string, starred: boolean) => {
    if (starred) {
      const previouslyStarred = views.filter(v => v.is_starred && v.id !== id);
      await Promise.all(previouslyStarred.map(v =>
        supabase.from('inbox_views').update({ is_starred: false }).eq('id', v.id),
      ));
      await supabase.from('inbox_views').update({ is_starred: true }).eq('id', id);
      setViews(prev => prev.map(v => ({ ...v, is_starred: v.id === id })));
    } else {
      await supabase.from('inbox_views').update({ is_starred: false }).eq('id', id);
      setViews(prev => prev.map(v => v.id === id ? { ...v, is_starred: false } : v));
    }
  }, [views]);

  const starredView = views.find(v => v.is_starred) ?? null;

  return { views, loading, createView, renameView, deleteView, toggleStar, starredView, reload: load };
}
