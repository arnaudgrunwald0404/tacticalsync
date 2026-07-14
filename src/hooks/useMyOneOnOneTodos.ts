import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseLocalDate } from '@/lib/dateUtils';

// ── Central aggregation of "to-dos for me" across ALL one-on-ones ──────────
//
// TODO.md item 7 (flagged critical by the product owner): each 1:1 prep
// drawer already tracks per-person commitments in cos_meeting_actions, split
// by `owner` ('them' vs 'me' — see 20260704000000_add_cos_meeting_action_owner.sql).
// Rows with owner='me' also auto-mirror into inbox_items in real time via the
// sync_cos_meeting_action_to_inbox trigger (20260723000001), which is this
// app's unified personal to-do list — see UnifiedFunnelAnnouncementBanner.
//
// That mirror makes the *data* available centrally already, but the Inbox
// commingles it with meeting-insight action items, delegations, tag
// suggestions, etc. This hook instead reads cos_meeting_actions directly,
// scoped to owner='me' + status='pending' + member_id NOT NULL (1:1s only,
// not group meetings), so a dedicated "My 1:1 To-Dos" view can show ONLY
// what's outstanding across one-on-ones, grouped by person — the thing that
// today is otherwise buried inside each person's individual prep drawer.

export interface MyOneOnOneTodo {
  id: string;
  text: string;
  due_date: string | null;
  created_at: string;
  member_id: string;
  member_name: string;
  member_relationship_type: 'direct_report' | 'collaborator' | string;
}

interface ActionRow {
  id: string;
  text: string;
  due_date: string | null;
  created_at: string;
  member_id: string | null;
}

function todayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Sort overdue-first, then by soonest due date, then most-recently created. */
export function sortMyTodos(todos: MyOneOnOneTodo[]): MyOneOnOneTodo[] {
  const today = todayMs();
  const rank = (t: MyOneOnOneTodo) => {
    if (!t.due_date) return 1; // no date: after overdue, before/with future-dated
    const d = parseLocalDate(t.due_date);
    if (!d) return 1;
    return d.getTime() < today ? 0 : 1;
  };
  return [...todos].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const da = a.due_date ? (parseLocalDate(a.due_date)?.getTime() ?? Infinity) : Infinity;
    const db = b.due_date ? (parseLocalDate(b.due_date)?.getTime() ?? Infinity) : Infinity;
    if (da !== db) return da - db;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function useMyOneOnOneTodos() {
  const [todos, setTodos] = useState<MyOneOnOneTodo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setTodos([]); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: actionRows, error } = await db
        .from('cos_meeting_actions')
        .select('id, text, due_date, created_at, member_id')
        .eq('user_id', userData.user.id)
        .eq('owner', 'me')
        .eq('status', 'pending')
        .not('member_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (actionRows ?? []) as ActionRow[];
      const memberIds = Array.from(new Set(rows.map(r => r.member_id).filter((id): id is string => !!id)));

      let memberById = new Map<string, { name: string; relationship_type: string }>();
      if (memberIds.length > 0) {
        const { data: members, error: memberErr } = await db
          .from('cos_team_members')
          .select('id, name, relationship_type')
          .in('id', memberIds);
        if (memberErr) throw memberErr;
        memberById = new Map(
          ((members ?? []) as Array<{ id: string; name: string; relationship_type: string }>)
            .map(m => [m.id, { name: m.name, relationship_type: m.relationship_type }]),
        );
      }

      const merged: MyOneOnOneTodo[] = rows
        .filter((r): r is ActionRow & { member_id: string } => !!r.member_id)
        .map(r => {
          const member = memberById.get(r.member_id);
          return {
            id: r.id,
            text: r.text,
            due_date: r.due_date,
            created_at: r.created_at,
            member_id: r.member_id,
            member_name: member?.name ?? 'Unknown',
            member_relationship_type: member?.relationship_type ?? 'direct_report',
          };
        });

      setTodos(sortMyTodos(merged));
    } catch (err) {
      console.error('Failed to fetch my 1:1 to-dos:', err);
      setTodos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const markDone = useCallback(async (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('cos_meeting_actions').update({ status: 'done' }).eq('id', id);
    if (error) {
      console.error('Failed to mark to-do done:', error);
      fetchTodos(); // resync on failure so the optimistic removal doesn't lie
    }
  }, [fetchTodos]);

  const overdueCount = useMemo(() => {
    const today = todayMs();
    return todos.filter(t => t.due_date && (parseLocalDate(t.due_date)?.getTime() ?? Infinity) < today).length;
  }, [todos]);

  const groupedByMember = useMemo(() => {
    const groups = new Map<string, { memberId: string; memberName: string; relationshipType: string; todos: MyOneOnOneTodo[] }>();
    for (const t of todos) {
      if (!groups.has(t.member_id)) {
        groups.set(t.member_id, { memberId: t.member_id, memberName: t.member_name, relationshipType: t.member_relationship_type, todos: [] });
      }
      groups.get(t.member_id)!.todos.push(t);
    }
    return Array.from(groups.values());
  }, [todos]);

  return { todos, groupedByMember, overdueCount, loading, refetch: fetchTodos, markDone };
}
