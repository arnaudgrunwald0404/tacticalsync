import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { RCCheckinWithRelations } from '@/types/rcdo';

export interface UserCheckinWithParent extends RCCheckinWithRelations {
  parent_name?: string;
  parent_type_label?: 'DO' | 'SI';
}

export function useUserCheckins() {
  const [checkins, setCheckins] = useState<UserCheckinWithParent[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUserCheckins = useCallback(async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCheckins([]);
        setLoading(false);
        return;
      }

      // First, get all SIs where user is owner or participant
      // We need to fetch all SIs and filter in memory because Supabase array queries can be tricky
      const { data: allSIs, error: siError } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, owner_user_id, participant_user_ids');

      if (siError) throw siError;

      // Filter SIs where user is owner or participant
      const userSIs = (allSIs || []).filter(si => 
        si.owner_user_id === user.id || 
        (si.participant_user_ids && Array.isArray(si.participant_user_ids) && si.participant_user_ids.includes(user.id))
      );

      const siIds = (userSIs || []).map(si => si.id);

      // Get all DOs where user is owner
      const { data: userDOs, error: doError } = await supabase
        .from('rc_defining_objectives')
        .select('id, title, owner_user_id')
        .eq('owner_user_id', user.id);

      if (doError) throw doError;

      const doIds = (userDOs || []).map(doItem => doItem.id);

      // Fetch check-ins for user's SIs
      let filteredSICheckins: any[] = [];
      if (siIds.length > 0) {
        const { data: siCheckins, error: checkinSiError } = await supabase
          .from('rc_checkins')
          .select(`
            *,
            creator:profiles!created_by(id, first_name, last_name, full_name, avatar_url, avatar_name)
          `)
          .eq('parent_type', 'initiative')
          .in('parent_id', siIds)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        if (checkinSiError) throw checkinSiError;

        // Map to include parent name
        filteredSICheckins = (siCheckins || []).map((checkin: any) => {
          const si = userSIs?.find(s => s.id === checkin.parent_id);
          return {
            ...checkin,
            parent_name: si?.title,
            parent_type_label: 'SI' as const,
          };
        });
      }

      // Fetch check-ins for user's DOs
      let filteredDOCheckins: any[] = [];
      if (doIds.length > 0) {
        const { data: doCheckins, error: checkinDoError } = await supabase
          .from('rc_checkins')
          .select(`
            *,
            creator:profiles!created_by(id, first_name, last_name, full_name, avatar_url, avatar_name)
          `)
          .eq('parent_type', 'do')
          .in('parent_id', doIds)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        if (checkinDoError) throw checkinDoError;

        // Map to include parent name
        filteredDOCheckins = (doCheckins || []).map((checkin: any) => {
          const definingObjective = userDOs?.find(d => d.id === checkin.parent_id);
          return {
            ...checkin,
            parent_name: definingObjective?.title,
            parent_type_label: 'DO' as const,
          };
        });
      }

      // Combine and sort by date (most recent first)
      const allCheckins = [...filteredSICheckins, ...filteredDOCheckins].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setCheckins(allCheckins as UserCheckinWithParent[]);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch check-ins',
        variant: 'destructive',
      });
      setCheckins([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUserCheckins();
  }, [fetchUserCheckins]);

  return { checkins, loading, refetch: fetchUserCheckins };
}

