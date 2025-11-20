import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { StrategicInitiativeWithRelations, RCCheckin } from '@/types/rcdo';

export interface SIWithProgress extends StrategicInitiativeWithRelations {
  latestPercentToGoal: number | null;
  latestCheckinDate: string | null;
}

/**
 * Hook to fetch SI data with latest check-in percent_to_goal
 * Used for displaying progress in StrategyCanvas
 */
export function useSIWithProgress(siId: string | undefined) {
  const [siData, setSiData] = useState<SIWithProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSIWithProgress = useCallback(async () => {
    if (!siId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch SI with owner info
      const { data: siData, error: siError } = await supabase
        .from('rc_strategic_initiatives')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name)
        `)
        .eq('id', siId)
        .single();

      if (siError) throw siError;
      if (!siData) {
        setSiData(null);
        setLoading(false);
        return;
      }

      // Fetch latest check-in with percent_to_goal
      const { data: latestCheckin, error: checkinError } = await supabase
        .from('rc_checkins')
        .select('percent_to_goal, date, created_at')
        .eq('parent_type', 'initiative')
        .eq('parent_id', siId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkinError && checkinError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned", which is fine
        throw checkinError;
      }

      const result: SIWithProgress = {
        ...(siData as StrategicInitiativeWithRelations),
        latestPercentToGoal: latestCheckin?.percent_to_goal ?? null,
        latestCheckinDate: latestCheckin?.date ?? null,
      };

      setSiData(result);
    } catch (err: any) {
      console.error('Error fetching SI with progress:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch SI data',
        variant: 'destructive',
      });
      setSiData(null);
    } finally {
      setLoading(false);
    }
  }, [siId, toast]);

  useEffect(() => {
    fetchSIWithProgress();
  }, [fetchSIWithProgress]);

  return { siData, loading, refetch: fetchSIWithProgress };
}

/**
 * Hook to fetch multiple SIs with progress for a DO
 */
export function useSIsWithProgressForDO(doId: string | undefined) {
  const [sisWithProgress, setSisWithProgress] = useState<Map<string, SIWithProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSIsWithProgress = useCallback(async () => {
    if (!doId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch all SIs for this DO
      const { data: sisData, error: siError } = await supabase
        .from('rc_strategic_initiatives')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name)
        `)
        .eq('defining_objective_id', doId)
        .order('display_order', { ascending: true });

      if (siError) throw siError;

      if (!sisData || sisData.length === 0) {
        setSisWithProgress(new Map());
        setLoading(false);
        return;
      }

      // Fetch latest check-in for each SI
      const siIds = sisData.map(si => si.id);
      const { data: checkins, error: checkinError } = await supabase
        .from('rc_checkins')
        .select('parent_id, percent_to_goal, date, created_at')
        .eq('parent_type', 'initiative')
        .in('parent_id', siIds)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (checkinError) throw checkinError;

      // Group checkins by SI ID and get latest for each
      const latestCheckinsBySI = new Map<string, { percent_to_goal: number | null; date: string | null }>();
      if (checkins) {
        for (const checkin of checkins) {
          if (!latestCheckinsBySI.has(checkin.parent_id)) {
            latestCheckinsBySI.set(checkin.parent_id, {
              percent_to_goal: checkin.percent_to_goal,
              date: checkin.date,
            });
          }
        }
      }

      // Combine SI data with latest check-in data
      const result = new Map<string, SIWithProgress>();
      for (const si of sisData) {
        const latestCheckin = latestCheckinsBySI.get(si.id);
        result.set(si.id, {
          ...(si as StrategicInitiativeWithRelations),
          latestPercentToGoal: latestCheckin?.percent_to_goal ?? null,
          latestCheckinDate: latestCheckin?.date ?? null,
        });
      }

      setSisWithProgress(result);
    } catch (err: any) {
      console.error('Error fetching SIs with progress:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch SI data',
        variant: 'destructive',
      });
      setSisWithProgress(new Map());
    } finally {
      setLoading(false);
    }
  }, [doId, toast]);

  useEffect(() => {
    fetchSIsWithProgress();
  }, [fetchSIsWithProgress]);

  return { sisWithProgress, loading, refetch: fetchSIsWithProgress };
}

