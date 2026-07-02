import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { InboxTag, InboxTagType, ProjectSettings, TAG_COLORS } from '@/types/inbox';
import { validateTagName, validateTagColor, isTagType } from '@/lib/inboxValidation';

// The generated Row is structurally identical to the domain InboxTag except that
// `type` is a plain string in the DB (a CHECK constraint, not an enum). Narrow it
// here so the rest of the app gets the union type. This is the one boundary cast.
type InboxTagRow = Database['public']['Tables']['inbox_tags']['Row'];
const rowToTag = (r: InboxTagRow): InboxTag => ({ ...r, type: r.type as InboxTagType });

export function useInboxTags(userId: string | null) {
  const [tags, setTags] = useState<InboxTag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('inbox_tags')
      .select('*')
      .eq('user_id', userId)
      .order('type')
      .order('sort_order');
    if (data) setTags(data.map(rowToTag));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const createTag = useCallback(async (
    name: string,
    type: InboxTagType,
    color: string,
    memberId?: string,
    parentId?: string,
  ): Promise<InboxTag | null> => {
    if (!userId) return null;

    // Validate + normalize before insert. Reject bad type / color / empty name
    // rather than letting a DB CHECK constraint reject it opaquely.
    const nameResult = validateTagName(name);
    if (!nameResult.ok) return null;
    if (!isTagType(type)) return null;
    const colorResult = validateTagColor(color);
    if (!colorResult.ok) return null;

    // Enforce the (user_id, name) uniqueness the DB guarantees, case-insensitively,
    // so we don't fire a doomed insert for a name that already exists.
    const dup = tags.find(t => t.name.toLowerCase() === nameResult.value.toLowerCase());
    if (dup) return dup;

    const { data, error } = await supabase
      .from('inbox_tags')
      .insert({ user_id: userId, name: nameResult.value, type, color: colorResult.value, member_id: memberId ?? null, parent_id: parentId ?? null })
      .select()
      .single();
    if (!error && data) {
      const tag = rowToTag(data);
      setTags(prev => [...prev, tag]);
      return tag;
    }
    return null;
  }, [userId, tags]);

  const createWorkstream = useCallback(async (
    parentId: string,
    name: string,
  ): Promise<InboxTag | null> => {
    const parent = tags.find(t => t.id === parentId);
    if (!parent) return null;
    return createTag(name, 'workstream', parent.color, undefined, parentId);
  }, [tags, createTag]);

  const deleteTag = useCallback(async (id: string) => {
    await supabase.from('inbox_tags').delete().eq('id', id);
    setTags(prev => prev.filter(t => t.id !== id));
  }, []);

  const renameTag = useCallback(async (id: string, name: string) => {
    const nameResult = validateTagName(name);
    if (!nameResult.ok) return;
    const trimmed = nameResult.value;
    await supabase.from('inbox_tags').update({ name: trimmed }).eq('id', id);
    setTags(prev => prev.map(t => t.id === id ? { ...t, name: trimmed } : t));
  }, []);

  const updateTag = useCallback(async (id: string, patch: Partial<Pick<InboxTag, 'type' | 'parent_id' | 'sort_order'>>) => {
    if (patch.type !== undefined && !isTagType(patch.type)) return;
    await supabase.from('inbox_tags').update(patch).eq('id', id);
    setTags(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const saveTagSettings = useCallback(async (id: string, settings: ProjectSettings, name: string) => {
    const nameResult = validateTagName(name);
    const patch: Record<string, unknown> = { settings };
    if (nameResult.ok) patch.name = nameResult.value;
    await supabase.from('inbox_tags').update(patch).eq('id', id);
    setTags(prev => prev.map(t => t.id === id ? { ...t, settings, ...(nameResult.ok ? { name: nameResult.value } : {}) } : t));
  }, []);

  const getOrCreate = useCallback(async (
    name: string,
    type: InboxTagType,
    color: string,
    memberId?: string,
  ): Promise<InboxTag | null> => {
    const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    return createTag(name, type, color, memberId);
  }, [tags, createTag]);

  return { tags, loading, createTag, createWorkstream, deleteTag, renameTag, updateTag, saveTagSettings, getOrCreate, reload: load };
}
