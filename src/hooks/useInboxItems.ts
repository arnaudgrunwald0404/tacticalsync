import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import type {
  InboxItem, InboxItemType, InboxItemStatus, InboxBucket, InboxTag, InboxTagType,
  InboxFilterState, AgentPayload, SourceRef, BriefPriority,
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
});

// Fetch items + their tags for a user, applying a filter
export function useInboxItems(userId: string | null, filter: InboxFilterState) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

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

    if (tagIds.length > 0) {
      await supabase
        .from('inbox_item_tags')
        .insert(tagIds.map(tid => ({ item_id: data.id, tag_id: tid })));
    }

    await load();
    return rowToItem(data);
  }, [userId, load]);

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
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }, []);

  const markDone = useCallback(async (id: string, done: boolean) => {
    const patch = done
      ? { status: 'done', done_at: new Date().toISOString() }
      : { status: 'open', done_at: null };
    await updateItem(id, patch as Partial<InboxItem>);
    if (done) setItems(prev => prev.filter(i => i.id !== id));
  }, [updateItem]);

  const archive = useCallback(async (id: string) => {
    await updateItem(id, { status: 'archived', archived_at: new Date().toISOString() } as Partial<InboxItem>);
    setItems(prev => prev.filter(i => i.id !== id));
  }, [updateItem]);

  const deleteItem = useCallback(async (id: string) => {
    await supabase.from('inbox_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const addTagToItem = useCallback(async (itemId: string, tagId: string) => {
    await supabase.from('inbox_item_tags').insert({ item_id: itemId, tag_id: tagId });
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const already = i.tags?.some(t => t.id === tagId);
      // Optimistic partial tag; the trailing load() replaces it with the full row.
      return already ? i : { ...i, tags: [...(i.tags ?? []), { id: tagId } as unknown as InboxTag] };
    }));
    await load();
  }, [load]);

  const removeTagFromItem = useCallback(async (itemId: string, tagId: string) => {
    await supabase.from('inbox_item_tags').delete()
      .eq('item_id', itemId).eq('tag_id', tagId);
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, tags: i.tags?.filter(t => t.id !== tagId) } : i
    ));
  }, []);

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
      setItems(prev => prev.map(i =>
        i.id === existing.id ? { ...i, agent_payload: payload } : i,
      ));
    } else {
      await supabase
        .from('inbox_items')
        .insert({
          user_id: userId,
          type: 'brief_item',
          text: summaryText,
          status: 'open',
          bucket: 'now',
          agent_payload: payload as Json,
          source_ref: sourceRef as unknown as Json,
        });
      await load();
    }
  }, [userId, load]);

  const pinItem = useCallback(async (id: string, pinned: boolean) => {
    await updateItem(id, { pinned });
  }, [updateItem]);

  return {
    items,
    loading,
    reload: load,
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
  };
}
