import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
// Idea #11: org-wide (leadership-authored) recurring talking points. See
// PLAN_idea11_org_wide_talking_points.md §4.2 for the design this hook follows.

export interface OrgTalkingPoint {
  id: string;
  title: string;
  body: string;
  starts_on: string;
  ends_on: string;
  /** Whether the current (user, team_member) pair has dismissed this point. */
  dismissed: boolean;
}

interface RawOrgTalkingPoint {
  id: string;
  title: string;
  body: string;
  starts_on: string;
  ends_on: string;
}

// Exported for direct unit testing: the Supabase query already constrains
// starts_on/ends_on server-side, but this client-side re-check is a
// defensive second pass (and the boundary this file's tests exercise
// directly, since a mocked query builder can't itself enforce .lte()/.gte()).
export function isWithinActiveWindow(
  point: Pick<RawOrgTalkingPoint, 'starts_on' | 'ends_on'>,
  todayDate: string
): boolean {
  return point.starts_on <= todayDate && point.ends_on >= todayDate;
}

// ── useOrgTalkingPoints ──────────────────────────────────────────────────────
// Fetches active, company-wide, in-window talking points and cross-references
// this (user, team_member) pair's dismissals — as two separate queries,
// filtered in code, rather than a raw SQL subquery (see
// PLAN_idea11_org_wide_talking_points.md §4.1's explicit injection-risk
// callout, which applies here just as much as in the edge function).

export function useOrgTalkingPoints(teamMemberId: string | null) {
  const [points, setPoints] = useState<OrgTalkingPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useCurrentUser();

  const load = useCallback(async () => {
    if (!teamMemberId) {
      setPoints([]);
      return;
    }
    try {
      setLoading(true);
      if (!user) return;
      const todayDate = new Date().toISOString().slice(0, 10);

      const [activeRes, dismissedRes] = await Promise.all([
        supabase
          .from('cos_org_talking_points' as never)
          .select('id, title, body, starts_on, ends_on')
          .eq('active', true)
          .eq('target_scope', 'company')
          .lte('starts_on', todayDate)
          .gte('ends_on', todayDate),
        supabase
          .from('cos_org_talking_point_dismissals' as never)
          .select('talking_point_id')
          .eq('user_id', user.id)
          .eq('team_member_id', teamMemberId),
      ]);

      if (activeRes.error) throw activeRes.error;
      if (dismissedRes.error) throw dismissedRes.error;

      const dismissedIds = new Set(
        ((dismissedRes.data ?? []) as unknown as Array<{ talking_point_id: string }>).map(d => d.talking_point_id)
      );
      const active = ((activeRes.data ?? []) as unknown as RawOrgTalkingPoint[])
        .filter(p => isWithinActiveWindow(p, todayDate));

      setPoints(active.map(p => ({ ...p, dismissed: dismissedIds.has(p.id) })));
    } catch (err) {
      console.error('Failed to fetch org talking points:', err);
    } finally {
      setLoading(false);
    }
  }, [teamMemberId, user]);

  useEffect(() => { load(); }, [load]);

  // Toggles dismissal for this (user, team_member, talking_point) triple —
  // "undo" is a delete of the dismissal row, matching the toggle semantics
  // togglePoint()/toggleCustomPoint() already use in OneOnOnePrepDrawer.tsx.
  const dismiss = useCallback(async (id: string) => {
    if (!teamMemberId) return;
    if (!user) return;
    const userId = user.id;

    let nowDismissed = true;
    setPoints(prev => prev.map(p => {
      if (p.id !== id) return p;
      nowDismissed = !p.dismissed;
      return { ...p, dismissed: nowDismissed };
    }));

    try {
      if (nowDismissed) {
        const { error } = await supabase
          .from('cos_org_talking_point_dismissals' as never)
          .upsert(
            { talking_point_id: id, user_id: userId, team_member_id: teamMemberId } as never,
            { onConflict: 'talking_point_id,user_id,team_member_id' }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cos_org_talking_point_dismissals' as never)
          .delete()
          .eq('talking_point_id', id)
          .eq('user_id', userId)
          .eq('team_member_id', teamMemberId);
        if (error) throw error;
      }
    } catch (err) {
      console.error('Failed to toggle org talking point dismissal:', err);
      // Revert the optimistic update on failure.
      setPoints(prev => prev.map(p => (p.id === id ? { ...p, dismissed: !nowDismissed } : p)));
    }
  }, [teamMemberId, user]);

  return { points, loading, dismiss, reload: load };
}
