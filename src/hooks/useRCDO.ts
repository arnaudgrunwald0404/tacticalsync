import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  RCCycle,
  RCCycleWithRelations,
  RallyingCry,
  RallyingCryWithRelations,
  DefiningObjective,
  DefiningObjectiveWithRelations,
  DOMetric,
  StrategicInitiative,
  StrategicInitiativeWithRelations,
  RCCheckin,
  RCLink,
  RCLinkWithDetails,
  CreateCycleForm,
  CreateRallyingCryForm,
  CreateDOForm,
  CreateMetricForm,
  UpdateMetricForm,
  CreateInitiativeForm,
  CreateCheckinForm,
  CreateLinkForm,
} from '@/types/rcdo';

// ============================================================================
// useActiveCycle - Fetch the active cycle (company-wide)
// ============================================================================
export function useActiveCycle() {
  const [cycle, setCycle] = useState<RCCycleWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchActiveCycle = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('rc_cycles')
        .select('*')
        .eq('status', 'active')
        .maybeSingle();

      if (fetchError) throw fetchError;

      setCycle(data as RCCycleWithRelations);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch active cycle';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchActiveCycle();
  }, [fetchActiveCycle]);

  return { cycle, loading, error, refetch: fetchActiveCycle };
}

// ============================================================================
// useCycles - Fetch all cycles (company-wide)
// ============================================================================
export function useCycles() {
  const [cycles, setCycles] = useState<RCCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchCycles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('rc_cycles')
        .select('*')
        .order('start_date', { ascending: false });

      if (fetchError) throw fetchError;

      setCycles(data || []);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch cycles';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  const createCycle = async (form: CreateCycleForm) => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('You must be logged in to create a cycle');
      }

      // Check if there's already an active cycle
      const { data: activeCycle } = await supabase
        .from('rc_cycles')
        .select('id')
        .eq('status', 'active')
        .maybeSingle();

      // If no active cycle exists, create as active; otherwise create as draft
      const newStatus = activeCycle ? 'draft' : 'active';

      const { data, error: createError } = await supabase
        .from('rc_cycles')
        .insert({
          type: 'half',
          start_date: form.start_date,
          end_date: form.end_date,
          status: newStatus,
          created_by: user.id,
        })
        .select()
        .single();

      if (createError) throw createError;

      toast({
        title: 'Success',
        description: `Cycle created successfully${newStatus === 'active' ? ' and activated' : ''}`,
      });

      await fetchCycles();
      return data;
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create cycle',
        variant: 'destructive',
      });
      throw err;
    }
  };

  return { cycles, loading, error, refetch: fetchCycles, createCycle };
}

// ============================================================================
// useRallyingCry - Fetch rallying cry for a cycle
// ============================================================================
export function useRallyingCry(cycleId: string | undefined) {
  const [rallyingCry, setRallyingCry] = useState<RallyingCryWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRallyingCry = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('rc_rallying_cries')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name)
        `)
        .eq('cycle_id', cycleId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      setRallyingCry(data as RallyingCryWithRelations);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch rallying cry';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [cycleId, toast]);

  useEffect(() => {
    fetchRallyingCry();
  }, [fetchRallyingCry]);

  const createRallyingCry = async (form: CreateRallyingCryForm) => {
    try {
      const { data, error: createError } = await supabase
        .from('rc_rallying_cries')
        .insert({
          cycle_id: form.cycle_id,
          title: form.title,
          narrative: form.narrative || null,
          owner_user_id: form.owner_user_id,
          status: 'draft',
        })
        .select()
        .single();

      if (createError) throw createError;

      toast({
        title: 'Success',
        description: 'Rallying cry created successfully',
      });

      await fetchRallyingCry();
      return data;
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create rallying cry',
        variant: 'destructive',
      });
      throw err;
    }
  };

  return { rallyingCry, loading, error, refetch: fetchRallyingCry, createRallyingCry };
}

// ============================================================================
// useCycleDOs - Fetch all defining objectives for a rallying cry
// ============================================================================
export function useCycleDOs(rallyingCryId: string | undefined) {
  const [dos, setDos] = useState<DefiningObjectiveWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchDOs = useCallback(async () => {
    if (!rallyingCryId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('rc_defining_objectives')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name),
          metrics:rc_do_metrics(*)
        `)
        .eq('rallying_cry_id', rallyingCryId)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      setDos(data as DefiningObjectiveWithRelations[] || []);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch defining objectives';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [rallyingCryId, toast]);

  useEffect(() => {
    fetchDOs();
  }, [fetchDOs]);

  const createDO = async (form: CreateDOForm) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error: createError } = await supabase
        .from('rc_defining_objectives')
        .insert({
          rallying_cry_id: form.rallying_cry_id,
          title: form.title,
          hypothesis: form.hypothesis || null,
          owner_user_id: form.owner_user_id,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          status: 'draft',
          health: 'on_track',
          confidence_pct: 50,
          created_by: auth?.user?.id || null,
        })
        .select()
        .single();

      if (createError) throw createError;

      toast({
        title: 'Success',
        description: 'Defining objective created successfully',
      });

      await fetchDOs();
      return data;
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create defining objective',
        variant: 'destructive',
      });
      throw err;
    }
  };

  return { dos, loading, error, refetch: fetchDOs, createDO };
}

// ============================================================================
// useDODetails - Fetch single DO with all related data
// ============================================================================
export function useDODetails(doId: string | undefined) {
  const [doDetails, setDoDetails] = useState<DefiningObjectiveWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchDODetails = useCallback(async () => {
    if (!doId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('rc_defining_objectives')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name),
          metrics:rc_do_metrics(*),
          initiatives:rc_strategic_initiatives(
            *,
            owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name)
          ),
          links:rc_links(*)
        `)
        .eq('id', doId)
        .single();

      if (fetchError) throw fetchError;

      setDoDetails(data as DefiningObjectiveWithRelations);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch DO details';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [doId, toast]);

  useEffect(() => {
    fetchDODetails();
  }, [fetchDODetails]);

  return { doDetails, loading, error, refetch: fetchDODetails };
}

// ============================================================================
// useDOMetrics - Manage metrics for a DO
// ============================================================================
export function useDOMetrics(doId: string | undefined) {
  const [metrics, setMetrics] = useState<DOMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMetrics = useCallback(async () => {
    if (!doId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('rc_do_metrics')
        .select('*')
        .eq('defining_objective_id', doId)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      setMetrics(data || []);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch metrics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [doId, toast]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const createMetric = async (form: CreateMetricForm) => {
    try {
      const { data, error: createError } = await supabase
        .from('rc_do_metrics')
        .insert({
          defining_objective_id: form.defining_objective_id,
          name: form.name,
          type: form.type,
          unit: form.unit || null,
          target_numeric: form.target_numeric || null,
          direction: form.direction,
          source: 'manual',
        })
        .select()
        .single();

      if (createError) throw createError;

      toast({
        title: 'Success',
        description: 'Metric created successfully',
      });

      await fetchMetrics();
      return data;
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create metric',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const updateMetric = async (metricId: string, updates: UpdateMetricForm) => {
    try {
      const updateData: any = {
        ...updates,
        last_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('rc_do_metrics')
        .update(updateData)
        .eq('id', metricId);

      if (updateError) throw updateError;

      await fetchMetrics();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update metric',
        variant: 'destructive',
      });
      throw err;
    }
  };

  return { metrics, loading, refetch: fetchMetrics, createMetric, updateMetric };
}

// ============================================================================
// useStrategicInitiatives - Manage initiatives for a DO
// ============================================================================
export function useStrategicInitiatives(doId: string | undefined) {
  const [initiatives, setInitiatives] = useState<StrategicInitiativeWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchInitiatives = useCallback(async () => {
    if (!doId) {
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
        .eq('defining_objective_id', doId)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      setInitiatives(data as StrategicInitiativeWithRelations[] || []);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch initiatives',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [doId, toast]);

  useEffect(() => {
    fetchInitiatives();
  }, [fetchInitiatives]);

  const createInitiative = async (form: CreateInitiativeForm) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error: createError } = await supabase
        .from('rc_strategic_initiatives')
        .insert({
          defining_objective_id: form.defining_objective_id,
          title: form.title,
          description: form.description || null,
          owner_user_id: form.owner_user_id,
          participant_user_ids: form.participant_user_ids || [],
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          status: 'draft',
          created_by: auth?.user?.id || null,
        })
        .select()
        .single();

      if (createError) throw createError;

      toast({
        title: 'Success',
        description: 'Initiative created successfully',
      });

      await fetchInitiatives();
      return data;
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create initiative',
        variant: 'destructive',
      });
      throw err;
    }
  };

  return { initiatives, loading, refetch: fetchInitiatives, createInitiative };
}

// ============================================================================
// useRCLinks - Manage links between DOs/Initiatives and meeting artifacts
// ============================================================================
export function useRCLinks(parentType: 'do' | 'initiative', parentId: string | undefined) {
  const [links, setLinks] = useState<RCLinkWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLinks = useCallback(async () => {
    if (!parentId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('rc_links')
        .select(`
          *,
          creator:profiles!created_by(id, first_name, last_name, full_name, avatar_url)
        `)
        .eq('parent_type', parentType)
        .eq('parent_id', parentId);

      if (fetchError) throw fetchError;

      setLinks(data as RCLinkWithDetails[] || []);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch links',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [parentType, parentId, toast]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const createLink = async (form: CreateLinkForm) => {
    try {
      // Get current user for created_by field
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if link already exists
      const { data: existingLink } = await supabase
        .from('rc_links')
        .select('id')
        .eq('parent_type', form.parent_type)
        .eq('parent_id', form.parent_id)
        .eq('kind', form.kind)
        .eq('ref_id', form.ref_id)
        .maybeSingle();

      if (existingLink) {
        // Link already exists, return it without showing error
        return existingLink;
      }

      const { data, error: createError } = await supabase
        .from('rc_links')
        .insert({
          parent_type: form.parent_type,
          parent_id: form.parent_id,
          kind: form.kind,
          ref_id: form.ref_id,
          created_by: user.id,
        })
        .select()
        .single();

      if (createError) {
        // Handle duplicate key error gracefully
        if (createError.code === '23505' || createError.message?.includes('duplicate key')) {
          // Link was created by another process, fetch it
          const { data: fetchedLink } = await supabase
            .from('rc_links')
            .select('id')
            .eq('parent_type', form.parent_type)
            .eq('parent_id', form.parent_id)
            .eq('kind', form.kind)
            .eq('ref_id', form.ref_id)
            .maybeSingle();
          
          if (fetchedLink) {
            return fetchedLink;
          }
        }
        throw createError;
      }

      toast({
        title: 'Success',
        description: 'Link created successfully',
      });

      await fetchLinks();
      return data;
    } catch (err: any) {
      // Only show error if it's not a duplicate key error
      if (!err.code || err.code !== '23505') {
        toast({
          title: 'Error',
          description: err.message || 'Failed to create link',
          variant: 'destructive',
        });
      }
      throw err;
    }
  };

  const deleteLink = async (linkId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('rc_links')
        .delete()
        .eq('id', linkId);

      if (deleteError) throw deleteError;

      toast({
        title: 'Success',
        description: 'Link removed successfully',
      });

      await fetchLinks();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to remove link',
        variant: 'destructive',
      });
      throw err;
    }
  };

  return { links, loading, refetch: fetchLinks, createLink, deleteLink };
}

