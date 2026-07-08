import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { InboxItem, InboxTag, InboxTagType } from '@/types/inbox';
import type { Database, Json } from '@/integrations/supabase/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PersonPageMember {
  id: string;
  name: string;
  role: string;
  relationship_type: string;
  last_1on1_date: string | null;
  context_notes: string | null;
}

export interface RelationshipDocument {
  id: string;
  content: string;
  version_count: number;
  last_updated_at: string;
}

type InboxItemRow = Database['public']['Tables']['inbox_items']['Row'];
type InboxTagRow = Database['public']['Tables']['inbox_tags']['Row'];

const rowToTag = (r: InboxTagRow): InboxTag => ({ ...r, type: r.type as InboxTagType });
const rowToItem = (r: InboxItemRow): InboxItem => ({
  ...r,
  type: r.type as InboxItem['type'],
  status: r.status as InboxItem['status'],
  bucket: r.bucket as InboxItem['bucket'],
  workflow_status: r.workflow_status as InboxItem['workflow_status'],
  agent_payload: (r.agent_payload as InboxItem['agent_payload']) ?? null,
  source_ref: (r.source_ref as unknown as InboxItem['source_ref']) ?? null,
  tag_suggestions: [],
  priority_due_at: ((r as Record<string, unknown>).priority_due_at as string | null) ?? null,
  priority_fixed: ((r as Record<string, unknown>).priority_fixed as boolean | null) ?? false,
});

/**
 * Aggregates everything a person page needs (PLAN_idea7_relationship_memory.md
 * §2.2): the cos_team_members header, open inbox items tagged to this person,
 * the rolling relationship brief, and 1:1 prep history. Relationship topics
 * and forgotten commitments are intentionally left to the existing
 * useRelationshipTopics/useForgottenCommitments hooks (src/hooks/
 * useRelationshipTopics.ts) rather than duplicated here — see the plan's
 * §2.3 reuse note.
 */
export function usePersonPage(userId: string | null, memberId: string | null) {
  const [member, setMember] = useState<PersonPageMember | null>(null);
  const [personTag, setPersonTag] = useState<InboxTag | null>(null);
  const [openItems, setOpenItems] = useState<InboxItem[]>([]);
  const [relationshipDoc, setRelationshipDoc] = useState<RelationshipDocument | null>(null);
  const [prepHistory, setPrepHistory] = useState<Array<{ id: string; content: string; prep_date: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !memberId) { setLoading(false); return; }
    setLoading(true);
    setNotFound(false);

    const [memberRes, tagRes, docRes, prepRes] = await Promise.all([
      supabase
        .from('cos_team_members')
        .select('id, name, role, relationship_type, last_1on1_date, context_notes')
        .eq('id', memberId)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('inbox_tags')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'person')
        .eq('member_id', memberId)
        .maybeSingle(),
      supabase
        .from('cos_relationship_documents')
        .select('id, content, version_count, last_updated_at')
        .eq('user_id', userId)
        .eq('team_member_id', memberId)
        .maybeSingle(),
      supabase
        .from('cos_one_on_one_prep')
        .select('id, content, prep_date')
        .eq('user_id', userId)
        .eq('team_member_id', memberId)
        .eq('status', 'ready')
        .order('prep_date', { ascending: false })
        .limit(10),
    ]);

    if (!memberRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setMember(memberRes.data as PersonPageMember);
    setPersonTag(tagRes.data ? rowToTag(tagRes.data) : null);
    setRelationshipDoc(docRes.data as RelationshipDocument | null);
    setPrepHistory((prepRes.data ?? []) as Array<{ id: string; content: string; prep_date: string }>);

    // Open inbox items tagged to this person, both directions (see the plan's
    // note in generate-person-brief about the current owed_by approximation —
    // the page itself just lists every open item tagged to the person).
    if (tagRes.data) {
      const { data: itemTagRows } = await supabase
        .from('inbox_item_tags')
        .select('inbox_items(*)')
        .eq('tag_id', tagRes.data.id);

      const items = ((itemTagRows ?? []) as Array<{ inbox_items: InboxItemRow | null }>)
        .map(r => r.inbox_items)
        .filter((i): i is InboxItemRow => !!i && i.status === 'open')
        .map(rowToItem)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      setOpenItems(items);
    } else {
      setOpenItems([]);
    }

    setLoading(false);
  }, [userId, memberId]);

  useEffect(() => { load(); }, [load]);

  return {
    member,
    personTag,
    openItems,
    relationshipDoc,
    prepHistory,
    loading,
    notFound,
    reload: load,
    // True once we've loaded and found genuinely little history — drives the
    // cold-start empty-state banner (PLAN §7a.1). Deliberately generous
    // (openItems + prep history + a doc all count) so a person with a rich
    // rolling brief but no open inbox items isn't mislabeled as cold-start.
    isColdStart: !loading && !notFound && openItems.length < 5 && prepHistory.length === 0 && !relationshipDoc,
  };
}

export type { InboxItem };
export type PersonPageJson = Json;
