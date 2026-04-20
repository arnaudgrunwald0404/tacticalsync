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
    console.log('🔵 useActiveInitiatives - teamId:', teamId);

    try {
      setLoading(true);
      setError(null);

      console.log('🔵 useActiveInitiatives - Fetching initiatives for active cycle');

      // Get active cycle (company-wide, same as useActiveDOs)
      const { data: activeCycle } = await supabase
        .from('rc_cycles')
        .select('id')
        .eq('status', 'active')
        .maybeSingle();

      if (!activeCycle) {
        console.log('❌ useActiveInitiatives - No active cycle found');
        setInitiatives([]);
        setLoading(false);
        return;
      }

      // Get rallying cry for cycle
      const { data: rallyingCry } = await supabase
        .from('rc_rallying_cries')
        .select('id')
        .eq('cycle_id', activeCycle.id)
        .maybeSingle();

      if (!rallyingCry) {
        console.log('❌ useActiveInitiatives - No rallying cry found for active cycle');
        setInitiatives([]);
        setLoading(false);
        return;
      }

      // Get initiatives for DOs in this rallying cry
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
            rallying_cry_id
          )
        `)
        .eq('rc_defining_objectives.rallying_cry_id', rallyingCry.id)
        .in('status', ['draft', 'not_started', 'active', 'blocked'])
        .order('title', { ascending: true });

      console.log('🔵 useActiveInitiatives - Query result:', { data, error: fetchError });

      if (fetchError) {
        console.error('❌ useActiveInitiatives - Query error:', fetchError);
        throw fetchError;
      }

      console.log('🔵 useActiveInitiatives - Raw data:', data);
      console.log('🔵 useActiveInitiatives - Data length:', data?.length || 0);

      // Transform the data
      const transformed: ActiveInitiative[] = (data || []).map((item) => ({
        id: item.id,
        title: item.title,
        doId: item.defining_objective_id,
        doTitle: (item.rc_defining_objectives as { title?: string } | null)?.title || 'Unknown DO',
        status: item.status,
      }));

      console.log('🔵 useActiveInitiatives - Transformed initiatives:', transformed);
      setInitiatives(transformed);
    } catch (err) {
      console.error('❌ useActiveInitiatives - Failed to fetch active initiatives:', err);
      setError(err instanceof Error ? err.message : String(err));
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

