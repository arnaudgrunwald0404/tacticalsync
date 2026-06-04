import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CommitmentQuarter,
  QuarterlyPriority,
  MonthlyCommitment,
  TeamReportingLine,
  PersonCommitments,
  CreateQuarterForm,
  UpsertPriorityForm,
  UpsertCommitmentForm,
} from '@/types/commitments';

// ─── useActiveQuarter ────────────────────────────────────────────────────────

export function useActiveQuarter() {
  const [quarter, setQuarter] = useState<CommitmentQuarter | null>(null);
  const [quarters, setQuarters] = useState<CommitmentQuarter[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchQuarters = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('commitment_quarters')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as CommitmentQuarter[];
      setQuarters(rows);
      const today = new Date().toISOString().slice(0, 10);
      setQuarter(
        rows.find(q => q.start_date <= today && today <= q.end_date)
        ?? rows.find(q => q.status === 'active')
        ?? rows.find(q => q.start_date <= today)
        ?? rows[rows.length - 1]
        ?? null,
      );
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchQuarters(); }, [fetchQuarters]);

  const createQuarter = useCallback(async (form: CreateQuarterForm) => {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('commitment_quarters')
      .insert({ ...form, created_by: userData.user?.id ?? null })
      .select()
      .single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return null; }
    await fetchQuarters();
    return data as CommitmentQuarter;
  }, [fetchQuarters, toast]);

  return { quarter, quarters, loading, setQuarter, refetch: fetchQuarters, createQuarter };
}

// ─── useMyCommitments ────────────────────────────────────────────────────────

export function useMyCommitments(quarterId: string | null, userId: string | null) {
  const [priorities, setPriorities] = useState<QuarterlyPriority[]>([]);
  const [commitments, setCommitments] = useState<MonthlyCommitment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    if (!quarterId || !userId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [priRes, comRes] = await Promise.all([
        supabase
          .from('quarterly_priorities')
          .select('*')
          .eq('quarter_id', quarterId)
          .eq('user_id', userId)
          .order('display_order'),
        supabase
          .from('monthly_commitments')
          .select('*')
          .eq('quarter_id', quarterId)
          .eq('user_id', userId)
          .order('month_number')
          .order('display_order'),
      ]);
      if (priRes.error) throw priRes.error;
      if (comRes.error) throw comRes.error;
      setPriorities((priRes.data ?? []) as QuarterlyPriority[]);
      setCommitments((comRes.data ?? []) as MonthlyCommitment[]);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [quarterId, userId, toast]);

  useEffect(() => { fetch(); }, [fetch]);

  const upsertPriority = useCallback(async (form: UpsertPriorityForm) => {
    const { data, error } = await supabase
      .from('quarterly_priorities')
      .upsert({ ...form, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return null; }
    await fetch();
    return data as QuarterlyPriority;
  }, [fetch, toast]);

  const deletePriority = useCallback(async (id: string) => {
    const { error } = await supabase.from('quarterly_priorities').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await fetch();
  }, [fetch, toast]);

  const upsertCommitment = useCallback(async (form: UpsertCommitmentForm) => {
    const { data, error } = await supabase
      .from('monthly_commitments')
      .upsert({ ...form, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return null; }
    await fetch();
    return data as MonthlyCommitment;
  }, [fetch, toast]);

  const deleteCommitment = useCallback(async (id: string) => {
    const { error } = await supabase.from('monthly_commitments').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await fetch();
  }, [fetch, toast]);

  const updateCommitmentStatus = useCallback(async (id: string, status: MonthlyCommitment['status']) => {
    const { error } = await supabase
      .from('monthly_commitments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setCommitments(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  }, [toast]);

  const updatePriorityStatus = useCallback(async (id: string, status: QuarterlyPriority['status']) => {
    const { error } = await supabase
      .from('quarterly_priorities')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setPriorities(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  }, [toast]);

  const toggleCommitmentFlagged = useCallback(async (id: string, flagged: boolean) => {
    const { error } = await supabase
      .from('monthly_commitments')
      .update({ flagged, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setCommitments(prev => prev.map(c => c.id === id ? { ...c, flagged } : c));
  }, [toast]);

  const togglePriorityFlagged = useCallback(async (id: string, flagged: boolean) => {
    const { error } = await supabase
      .from('quarterly_priorities')
      .update({ flagged, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setPriorities(prev => prev.map(p => p.id === id ? { ...p, flagged } : p));
  }, [toast]);

  return {
    priorities,
    commitments,
    loading,
    refetch: fetch,
    upsertPriority,
    deletePriority,
    upsertCommitment,
    deleteCommitment,
    updateCommitmentStatus,
    updatePriorityStatus,
    toggleCommitmentFlagged,
    togglePriorityFlagged,
  };
}

// ─── useReportingLines ───────────────────────────────────────────────────────
// Derives reporting lines from profiles.manager_email (the authoritative org
// chart source) instead of the team_reporting_lines table.

export function useReportingLines(teamId: string | null) {
  const [lines, setLines] = useState<TeamReportingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    if (!teamId) { setLoading(false); return; }
    try {
      setLoading(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profiles, error } = await (supabase as any)
        .from('profiles')
        .select('id, email, manager_email')
        .not('email', 'is', null);
      if (error) throw error;

      type OrgProfile = { id: string; email: string; manager_email: string | null };
      const allProfiles = (profiles ?? []) as OrgProfile[];

      const emailToId = new Map<string, string>();
      for (const p of allProfiles) {
        emailToId.set(p.email.toLowerCase(), p.id);
      }

      const derived: TeamReportingLine[] = [];
      let counter = 0;
      for (const p of allProfiles) {
        if (!p.manager_email) continue;
        const managerId = emailToId.get(p.manager_email.toLowerCase());
        if (managerId && managerId !== p.id) {
          derived.push({
            id: `derived-${counter++}`,
            team_id: teamId,
            manager_id: managerId,
            report_id: p.id,
            created_at: '',
          });
        }
      }

      setLines(derived);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [teamId, toast]);

  useEffect(() => { fetch(); }, [fetch]);

  const addLine = useCallback(async (managerId: string, reportId: string) => {
    if (!teamId) return;
    const { error } = await supabase
      .from('team_reporting_lines')
      .insert({ team_id: teamId, manager_id: managerId, report_id: reportId });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await fetch();
  }, [teamId, fetch, toast]);

  const removeLine = useCallback(async (id: string) => {
    const { error } = await supabase.from('team_reporting_lines').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await fetch();
  }, [fetch, toast]);

  // Convenience: get direct report IDs for a given manager
  const getDirectReportIds = useCallback((managerId: string) =>
    lines.filter(l => l.manager_id === managerId).map(l => l.report_id),
  [lines]);

  // Convenience: get all report IDs at any depth (for org view)
  const getAllReportIds = useCallback((rootManagerId: string): string[] => {
    const visited = new Set<string>();
    const queue = [rootManagerId];
    const result: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      const reports = lines.filter(l => l.manager_id === current).map(l => l.report_id);
      for (const r of reports) {
        if (!visited.has(r)) {
          visited.add(r);
          result.push(r);
          queue.push(r);
        }
      }
    }
    return result;
  }, [lines]);

  return { lines, loading, refetch: fetch, addLine, removeLine, getDirectReportIds, getAllReportIds };
}

// ─── useTeamCommitments ──────────────────────────────────────────────────────
// Fetches priorities + commitments for a given list of user IDs

export function useTeamCommitments(
  quarterId: string | null,
  userIds: string[],
) {
  const [data, setData] = useState<{ priorities: QuarterlyPriority[]; commitments: MonthlyCommitment[] }>({
    priorities: [],
    commitments: [],
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    if (!quarterId || userIds.length === 0) { setLoading(false); return; }
    try {
      setLoading(true);
      const [priRes, comRes] = await Promise.all([
        supabase
          .from('quarterly_priorities')
          .select('*')
          .eq('quarter_id', quarterId)
          .in('user_id', userIds)
          .order('display_order'),
        supabase
          .from('monthly_commitments')
          .select('*')
          .eq('quarter_id', quarterId)
          .in('user_id', userIds)
          .order('month_number')
          .order('display_order'),
      ]);
      if (priRes.error) throw priRes.error;
      if (comRes.error) throw comRes.error;
      setData({
        priorities: (priRes.data ?? []) as QuarterlyPriority[],
        commitments: (comRes.data ?? []) as MonthlyCommitment[],
      });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [quarterId, userIds.join(','), toast]);

  useEffect(() => { fetch(); }, [fetch]);

  // Build per-person structure
  const byUser = useCallback((userId: string): PersonCommitments | null => {
    const priorities = data.priorities.filter(p => p.user_id === userId);
    const commitmentsByMonth: Record<number, MonthlyCommitment[]> = { 1: [], 2: [], 3: [] };
    data.commitments
      .filter(c => c.user_id === userId)
      .forEach(c => { commitmentsByMonth[c.month_number] = [...(commitmentsByMonth[c.month_number] ?? []), c]; });
    return { userId, fullName: '', avatarUrl: null, avatarName: null, priorities, commitments: commitmentsByMonth };
  }, [data]);

  return { ...data, loading, refetch: fetch, byUser };
}
