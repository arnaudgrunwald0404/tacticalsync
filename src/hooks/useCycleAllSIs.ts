import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type CheckinStatus = 'on_track' | 'at_risk' | 'off_track' | 'unknown';

export interface AllHandsSIRow {
  siId: string;
  siTitle: string;
  doId: string;
  doTitle: string;
  doDisplayOrder: number;
  siDisplayOrder: number;
  doOwnerId: string | null;
  doOwnerName: string;
  doOwnerAvatarName: string | null;
  doOwnerAvatarUrl: string | null;
  status: CheckinStatus;
  latestPercent: number | null;
  latestCheckinDate: string | null;
  priorPercent: number | null;
  priorCheckinDate: string | null;
}

interface OwnerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_name: string | null;
  avatar_url: string | null;
}

interface DORow {
  id: string;
  title: string;
  display_order: number;
  owner: OwnerProfile | null;
}

interface SIRow {
  id: string;
  title: string;
  display_order: number;
  defining_objective_id: string;
  defining_objective: DORow | null;
}

interface CheckinRow {
  parent_id: string;
  date: string;
  created_at: string;
  percent_to_goal: number | null;
  sentiment: number | null;
}

function sentimentToStatus(sentiment: number | null | undefined): CheckinStatus {
  if (sentiment === null || sentiment === undefined) return 'unknown';
  if (sentiment <= -1) return 'off_track';
  if (sentiment === 0) return 'at_risk';
  return 'on_track';
}

function fullName(p: OwnerProfile | null): string {
  if (!p) return 'Unassigned';
  const first = (p.first_name || '').trim();
  const last = (p.last_name || '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  return (p.full_name || '').trim() || 'Unassigned';
}

/**
 * Flat list of every Strategic Initiative under a Rallying Cry, paired with
 * its DO owner and the latest + prior-calendar-month check-in. Used by the
 * /rcdo/all-hands progress table.
 */
export function useCycleAllSIs(rallyingCryId: string | undefined) {
  const [rows, setRows] = useState<AllHandsSIRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    if (!rallyingCryId) {
      setRows([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: doData, error: doErr } = await supabase
        .from('rc_defining_objectives')
        .select('id')
        .eq('rallying_cry_id', rallyingCryId);
      if (doErr) throw doErr;

      const doIds = (doData ?? []).map((d) => d.id);
      if (doIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: siData, error: siErr } = await supabase
        .from('rc_strategic_initiatives')
        .select(`
          id,
          title,
          display_order,
          defining_objective_id,
          defining_objective:rc_defining_objectives!defining_objective_id(
            id,
            title,
            display_order,
            owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_name, avatar_url)
          )
        `)
        .in('defining_objective_id', doIds)
        .order('display_order', { ascending: true });
      if (siErr) throw siErr;

      const sis = (siData ?? []) as unknown as SIRow[];
      if (sis.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const siIds = sis.map((s) => s.id);

      const { data: checkData, error: checkErr } = await supabase
        .from('rc_checkins')
        .select('parent_id, date, created_at, percent_to_goal, sentiment')
        .eq('parent_type', 'initiative')
        .in('parent_id', siIds)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (checkErr) throw checkErr;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startOfMonthISO = startOfMonth.toISOString().slice(0, 10);

      const latestBySI = new Map<string, CheckinRow>();
      const priorBySI = new Map<string, CheckinRow>();
      for (const c of (checkData ?? []) as CheckinRow[]) {
        if (!latestBySI.has(c.parent_id)) {
          latestBySI.set(c.parent_id, c);
        }
        // Prior = most recent check-in strictly before the current calendar month
        if (c.date < startOfMonthISO && !priorBySI.has(c.parent_id)) {
          priorBySI.set(c.parent_id, c);
        }
      }

      const built: AllHandsSIRow[] = sis.map((si) => {
        const latest = latestBySI.get(si.id);
        const prior = priorBySI.get(si.id);
        const owner = si.defining_objective?.owner ?? null;
        return {
          siId: si.id,
          siTitle: si.title,
          doId: si.defining_objective_id,
          doTitle: si.defining_objective?.title ?? '',
          doDisplayOrder: si.defining_objective?.display_order ?? 0,
          siDisplayOrder: si.display_order ?? 0,
          doOwnerId: owner?.id ?? null,
          doOwnerName: fullName(owner),
          doOwnerAvatarName: owner?.avatar_name ?? null,
          doOwnerAvatarUrl: owner?.avatar_url ?? null,
          status: sentimentToStatus(latest?.sentiment ?? null),
          latestPercent: latest?.percent_to_goal ?? null,
          latestCheckinDate: latest?.date ?? null,
          priorPercent: prior?.percent_to_goal ?? null,
          priorCheckinDate: prior?.date ?? null,
        };
      });

      built.sort((a, b) => {
        if (a.doDisplayOrder !== b.doDisplayOrder) return a.doDisplayOrder - b.doDisplayOrder;
        if (a.doId !== b.doId) return a.doId.localeCompare(b.doId);
        return a.siDisplayOrder - b.siDisplayOrder;
      });

      setRows(built);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load progress data';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [rallyingCryId, toast]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { rows, loading, error, refetch: fetch };
}
