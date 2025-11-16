import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ActiveInitiative {
  id: string;
  title: string;
  doId: string;
  doTitle: string;
  status: string;
}

export function useActiveInitiatives(teamId: string | undefined) {
  const [initiatives, setInitiatives] = useState<ActiveInitiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInitiatives = useCallback(async () => {
    if (!teamId) {
      setInitiatives([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get active initiatives with their DO info
      const { data, error: fetchError } = await supabase
        .from('rc_strategic_initiatives')
        .select(`
          id,
          title,
          status,
          defining_objective_id,
          rc_defining_objectives!inner(
            id,
            title,
            rc_rallying_cries!inner(
              id,
              rc_cycles!inner(
                team_id
              )
            )
          )
        `)
        .eq('rc_defining_objectives.rc_rallying_cries.rc_cycles.team_id', teamId)
        .in('status', ['draft', 'in_progress', 'blocked'])
        .order('title', { ascending: true });

      if (fetchError) throw fetchError;

      // Transform the data
      const transformed: ActiveInitiative[] = (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        doId: item.defining_objective_id,
        doTitle: item.rc_defining_objectives?.title || 'Unknown DO',
        status: item.status,
      }));

      setInitiatives(transformed);
    } catch (err: any) {
      console.error('Failed to fetch active initiatives:', err);
      setError(err.message);
      setInitiatives([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchInitiatives();
  }, [fetchInitiatives]);

  return { initiatives, loading, error, refetch: fetchInitiatives };
}

