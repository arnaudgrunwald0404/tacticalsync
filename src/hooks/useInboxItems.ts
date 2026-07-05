import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import type {
  InboxItem, InboxItemType, InboxItemStatus, InboxBucket, InboxTag, InboxTagType,
  InboxFilterState, AgentPayload, SourceRef, BriefPriority, TagSuggestion,
} from '@/types/inbox';
import {
  validateItemText,
  validateItemBody,
  applyInboxClientFilters,
  resolveTargetStatus,
  nextWorkflowStatus,
} from '@/lib/inboxValidation';

// The generated Row types the jsonb/CHECK columns as Json/string; the domain
// InboxItem narrows them. These mappers are the single boundary where we assert
// the shapes the DB CHECK constraints already guarantee.
type InboxItemRow = Database['public']['Tables']['inbox_items']['Row'];
type InboxItemUpdate = Database['public']['Tables']['inbox_items']['Update'];
type InboxTagRow = Database['public']['Tables']['inbox_tags']['Row'];

const rowToTag = (r: InboxTagRow): InboxTag => ({ ...r, type: r.type as InboxTagType });

const rowToItem = (r: InboxItemRow): InboxItem => ({
  ...r,
  type: r.type as InboxItemType,
  status: r.status as InboxItemStatus,
  bucket: r.bucket as InboxBucket | null,
  workflow_status: r.workflow_status as InboxItem['workflow_status'],
  agent_payload: (r.agent_payload as AgentPayload | null) ?? null,
  source_ref: (r.source_ref as SourceRef | null) ?? null,
  tag_suggestions: Array.isArray((r as Record<string, unknown>).tag_suggestions)
    ? ((r as Record<string, unknown>).tag_suggestions as TagSuggestion[])
    : [],
});

type ItemsPatcher = (prev: InboxItem[]) => InboxItem[];

// Fetch items + their tags for a user, applying a filter. `mirror`, if given, is
// called with the same in-place patcher applied to every mutation (add/update/
// remove), letting a second instance (e.g. one used only for sidebar counts)
// stay in sync without its own network refetch.
export function useInboxItems(
  userId: string | null,
  filter: InboxFilterState,
  mirror?: (patcher: ItemsPatcher) => void,
) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const applyPatch = useCallback((patcher: ItemsPatcher) => {
    setItems(patcher);
    mirror?.(patcher);
  }, [mirror]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    // Fetch items matching status filter
    const targetStatus = resolveTargetStatus(filter);

    let query = supabase
      .from('inbox_items')
      .select('*')
      .eq('user_id', userId)
      .eq('status', targetStatus)
      .order('created_at', { ascending: false });

    if (filter.types?.length) {
      query = query.in('type', filter.types);
    }

    // (builtIn 'asap' is handled client-side after the tag join.)

    const { data: rawItems } = await query;
    if (!rawItems) { setLoading(false); return; }

    // Fetch tags for all fetched items
    const itemIds = rawItems.map((i) => i.id);
    let itemsWithTags: InboxItem[] = rawItems.map(rowToItem);

    if (itemIds.length > 0) {
      const { data: itemTagRows } = await supabase
        .from('inbox_item_tags')
        .select('item_id, inbox_tags(*)')
        .in('item_id', itemIds);

      if (itemTagRows) {
        const tagsByItem: Record<string, InboxTag[]> = {};
        for (const row of itemTagRows) {
          if (!row.inbox_tags) continue;
          (tagsByItem[row.item_id] ??= []).push(rowToTag(row.inbox_tags));
        }
        itemsWithTags = itemsWithTags.map((item) => ({
          ...item,
          tags: tagsByItem[item.id] ?? [],
        }));
      }
    }

    // Client-side filters that depend on the joined tags (ASAP / waiting / tagIds).
    itemsWithTags = applyInboxClientFilters(itemsWithTags, filter);

    setItems(itemsWithTags);
    setLoading(false);
  }, [userId, filter]);

  useEffect(() => { load(); }, [load]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const addItem = useCallback(async (
    text: string,
    type: InboxItemType = 'task',
    tagIds: string[] = [],
    extra?: Partial<Pick<InboxItem, 'body' | 'agent_payload' | 'source_ref'>>,
  ): Promise<InboxItem | null> => {
    if (!userId) return null;

    // Validate before touching the DB: reject empty / control-char / over-long
    // text, and normalize the body. A rejected write returns null so callers
    // surface it the same way they handle a network failure.
    const textResult = validateItemText(text);
    if (!textResult.ok) return null;
    const bodyResult = validateItemBody(extra?.body);
    if (!bodyResult.ok) return null;

    const { data, error } = await supabase
      .from('inbox_items')
      .insert({
        user_id: userId,
        type,
        text: textResult.value,
        body: bodyResult.value,
        agent_payload: (extra?.agent_payload ?? null) as Json,
        source_ref: (extra?.source_ref ?? null) as Json,
      })
      .select()
      .single();
    if (error || !data) return null;

    const newItem = rowToItem(data);

    if (tagIds.length > 0) {
      const { data: tagRows } = await supabase
        .from('inbox_item_tags')
        .insert(tagIds.map(tid => ({ item_id: data.id, tag_id: tid })))
        .select('inbox_tags(*)');
      if (tagRows) {
        newItem.tags = tagRows
          .map(r => r.inbox_tags)
          .filter((t): t is InboxTagRow => !!t)
          .map(rowToTag);
      }
    }

    setItems(prev => applyInboxClientFilters([newItem, ...prev], filter));
    mirror?.(prev => [newItem, ...prev]);
    return newItem;
  }, [userId, filter, mirror]);

  const updateItem = useCallback(async (id: string, patch: Partial<InboxItem>) => {
    // Guard text/body edits with the same rules as inserts. Invalid edits are
    // dropped rather than persisting a bad row.
    if ('text' in patch) {
      const r = validateItemText(patch.text);
      if (!r.ok) return;
      patch = { ...patch, text: r.value };
    }
    if ('body' in patch) {
      const r = validateItemBody(patch.body);
      if (!r.ok) return;
      patch = { ...patch, body: r.value };
    }
    // The outgoing payload crosses the domain→Json seam (agent_payload etc.),
    // so cast to the generated Update type at the boundary. Table + column names
    // are still checked by the typed client on the query itself.
    const dbPatch = { ...patch, updated_at: new Date().toISOString() } as unknown as InboxItemUpdate;
    await supabase
      .from('inbox_items')
      .update(dbPatch)
      .eq('id', id);
    applyPatch(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }, [applyPatch]);

  const markDone = useCallback(async (id: string, done: boolean) => {
    const patch = done
      ? { status: 'done', done_at: new Date().toISOString() }
      : { status: 'open', done_at: null };
    await updateItem(id, patch as Partial<InboxItem>);
    if (done) applyPatch(prev => prev.filter(i => i.id !== id));
  }, [updateItem, applyPatch]);

  const archive = useCallback(async (id: string) => {
    await updateItem(id, { status: 'archived', archived_at: new Date().toISOString() } as Partial<InboxItem>);
    applyPatch(prev => prev.filter(i => i.id !== id));
  }, [updateItem, applyPatch]);

  const deleteItem = useCallback(async (id: string) => {
    await supabase.from('inbox_items').delete().eq('id', id);
    applyPatch(prev => prev.filter(i => i.id !== id));
  }, [applyPatch]);

  const addTagToItem = useCallback(async (itemId: string, tagId: string) => {
    const { data: tagRow } = await supabase
      .from('inbox_tags')
      .select('*')
      .eq('id', tagId)
      .single();
    await supabase.from('inbox_item_tags').insert({ item_id: itemId, tag_id: tagId });
    applyPatch(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const already = i.tags?.some(t => t.id === tagId);
      if (already) return i;
      const tag = tagRow ? rowToTag(tagRow) : ({ id: tagId } as unknown as InboxTag);
      return { ...i, tags: [...(i.tags ?? []), tag] };
    }));
  }, [applyPatch]);

  const removeTagFromItem = useCallback(async (itemId: string, tagId: string) => {
    await supabase.from('inbox_item_tags').delete()
      .eq('item_id', itemId).eq('tag_id', tagId);
    applyPatch(prev => prev.map(i =>
      i.id === itemId ? { ...i, tags: i.tags?.filter(t => t.id !== tagId) } : i
    ));
  }, [applyPatch]);

  const cycleWorkflowStatus = useCallback(async (id: string, current: string | null) => {
    await updateItem(id, { workflow_status: nextWorkflowStatus(current) });
  }, [updateItem]);

  // Upsert a brief_item for today's daily brief run.
  // Idempotent: if an item already exists for this date, update its payload.
  const syncBriefItem = useCallback(async (
    date: string,
    priorities: BriefPriority[],
    summaryText: string,
  ): Promise<void> => {
    if (!userId) return;

    const { data: existing } = await supabase
      .from('inbox_items')
      .select('id, agent_payload')
      .eq('user_id', userId)
      .eq('type', 'brief_item')
      .contains('source_ref', { type: 'dci_brief', id: date })
      .maybeSingle();

    const payload: AgentPayload = {
      rationale: 'Auto-generated from daily brief',
      brief_date: date,
      brief_priorities: priorities,
    };
    const sourceRef: SourceRef = { type: 'dci_brief', id: date };

    if (existing) {
      await supabase
        .from('inbox_items')
        .update({ agent_payload: payload as Json, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      applyPatch(prev => prev.map(i =>
        i.id === existing.id ? { ...i, agent_payload: payload } : i,
      ));
    } else {
      const { data } = await supabase
        .from('inbox_items')
        .insert({
          user_id: userId,
          type: 'brief_item',
          text: summaryText,
          status: 'open',
          bucket: 'now',
          agent_payload: payload as Json,
          source_ref: sourceRef as unknown as Json,
        })
        .select()
        .single();
      if (data) {
        const newItem = rowToItem(data);
        setItems(prev => applyInboxClientFilters([newItem, ...prev], filter));
        mirror?.(prev => [newItem, ...prev]);
      }
    }
  }, [userId, filter, mirror, applyPatch]);

  const pinItem = useCallback(async (id: string, pinned: boolean) => {
    await updateItem(id, { pinned });
  }, [updateItem]);

  // Accept a tag suggestion: apply the tag and remove the suggestion from the list.
  const acceptSuggestion = useCallback(async (itemId: string, suggestion: TagSuggestion) => {
    // Apply the tag
    await supabase.from('inbox_item_tags').upsert({ item_id: itemId, tag_id: suggestion.tag_id }, { onConflict: 'item_id,tag_id' });
    // Remove this suggestion from the DB array
    const item = items.find(i => i.id === itemId);
    const remaining = (item?.tag_suggestions ?? []).filter(s => s.tag_id !== suggestion.tag_id);
    await supabase.from('inbox_items').update({ tag_suggestions: remaining as unknown as Json }).eq('id', itemId);
    // Optimistic update
    applyPatch(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const already = i.tags?.some(t => t.id === suggestion.tag_id);
      return {
        ...i,
        tag_suggestions: (i.tag_suggestions ?? []).filter(s => s.tag_id !== suggestion.tag_id),
        tags: already ? i.tags : [...(i.tags ?? []), { id: suggestion.tag_id, name: suggestion.tag_name, color: suggestion.color, type: 'project', user_id: '', member_id: null, parent_id: null, sort_order: 0, created_at: '' } as InboxTag],
      };
    }));
  }, [items, applyPatch]);

  // Dismiss a suggestion without applying the tag.
  const dismissSuggestion = useCallback(async (itemId: string, tagId: string) => {
    const item = items.find(i => i.id === itemId);
    const remaining = (item?.tag_suggestions ?? []).filter(s => s.tag_id !== tagId);
    await supabase.from('inbox_items').update({ tag_suggestions: remaining as unknown as Json }).eq('id', itemId);
    applyPatch(prev => prev.map(i =>
      i.id === itemId ? { ...i, tag_suggestions: (i.tag_suggestions ?? []).filter(s => s.tag_id !== tagId) } : i
    ));
  }, [items, applyPatch]);

  return {
    items,
    loading,
    reload: load,
    // Lets another instance of this hook mirror patches into this one (see the
    // `mirror` param above) without a network refetch.
    applyExternalPatch: setItems,
    addItem,
    updateItem,
    markDone,
    archive,
    deleteItem,
    addTagToItem,
    removeTagFromItem,
    cycleWorkflowStatus,
    syncBriefItem,
    pinItem,
    acceptSuggestion,
    dismissSuggestion,
  };
}
