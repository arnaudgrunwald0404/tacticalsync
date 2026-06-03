import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { StrategicInitiativeWithRelations } from '@/types/rcdo';

// Fetch direct children (sub-SIs) of a parent SI, ordered by display_order.
// Sub-SIs share their parent's defining_objective_id (so RLS works via the existing
// DO -> RC -> cycle -> team chain) but are excluded from every top-level SI list by
// the .is('parent_si_id', null) filter.
export function useSubSIs(parentSiId: string | undefined) {
  const [subSIs, setSubSIs] = useState<StrategicInitiativeWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSubSIs = useCallback(async () => {
    if (!parentSiId) {
      setSubSIs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('rc_strategic_initiatives')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name)
        `)
        .eq('parent_si_id', parentSiId)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      setSubSIs((data || []) as StrategicInitiativeWithRelations[]);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to fetch sub-initiatives',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [parentSiId, toast]);

  useEffect(() => {
    fetchSubSIs();
  }, [fetchSubSIs]);

  // Create a new sub-SI under the given parent. Inherits the parent's
  // defining_objective_id; appended at the end of the current ordering.
  const createSubSI = useCallback(async (
    parentDefiningObjectiveId: string,
    title: string,
  ): Promise<StrategicInitiativeWithRelations | null> => {
    if (!parentSiId) return null;

    const nextDisplayOrder = subSIs.length > 0
      ? Math.max(...subSIs.map(s => s.display_order ?? 0)) + 1
      : 0;

    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('rc_strategic_initiatives')
        .insert({
          defining_objective_id: parentDefiningObjectiveId,
          parent_si_id: parentSiId,
          title,
          status: 'not_started',
          display_order: nextDisplayOrder,
          owner_user_id: auth?.user?.id ?? null,
          created_by: auth?.user?.id ?? null,
        } as never)
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name)
        `)
        .single();

      if (error) throw error;

      await fetchSubSIs();
      return data as StrategicInitiativeWithRelations;
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create sub-initiative',
        variant: 'destructive',
      });
      return null;
    }
  }, [parentSiId, subSIs, fetchSubSIs, toast]);

  return { subSIs, loading, refetch: fetchSubSIs, createSubSI };
}
