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

      // First, get SIs where user is owner
      const { data: ownerSIs, error: ownerSiError } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, owner_user_id, participant_user_ids')
        .eq('owner_user_id', user.id);

      if (ownerSiError) {
        console.error('Error fetching owner SIs:', ownerSiError);
        throw ownerSiError;
      }

      // Get all DOs where user is owner (needed for both paths)
      const { data: userDOs, error: doError } = await supabase
        .from('rc_defining_objectives')
        .select('id, title, owner_user_id')
        .eq('owner_user_id', user.id);

      if (doError) throw doError;

      const doIds = (userDOs || []).map(doItem => doItem.id);

      // Get SIs where user is a participant (using Postgres array contains operator)
      // Note: We use cs (contains) operator to check if the array contains the user ID
      const { data: participantSIs, error: participantSiError } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, owner_user_id, participant_user_ids')
        .contains('participant_user_ids', [user.id]);

      let uniqueSIs: any[];
      let siIds: string[];

      if (participantSiError) {
        console.error('Error fetching participant SIs:', participantSiError);
        // If array query fails, fall back to fetching all and filtering
        console.warn('Falling back to fetching all SIs and filtering in memory');
        const { data: allSIs, error: allSiError } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, owner_user_id, participant_user_ids');
        
        if (allSiError) throw allSiError;
        
        // Filter SIs where user is participant (owner SIs already fetched)
        const participantSIsFiltered = (allSIs || []).filter(si => 
          si.owner_user_id !== user.id && // Exclude ones we already have as owner
          si.participant_user_ids && 
          Array.isArray(si.participant_user_ids) && 
          si.participant_user_ids.includes(user.id)
        );
        
        // Combine owner and participant SIs, removing duplicates
        const allUserSIs = [...(ownerSIs || []), ...participantSIsFiltered];
        uniqueSIs = Array.from(
          new Map(allUserSIs.map(si => [si.id, si])).values()
        );
      } else {
        // Combine owner and participant SIs, removing duplicates
        const allUserSIs = [...(ownerSIs || []), ...(participantSIs || [])];
        uniqueSIs = Array.from(
          new Map(allUserSIs.map(si => [si.id, si])).values()
        );
      }

      console.log(`Found ${uniqueSIs.length} SIs for user (${ownerSIs?.length || 0} owned, ${participantSiError ? 'error fetching participants' : (participantSIs?.length || 0)} as participant)`);

      siIds = uniqueSIs.map(si => si.id);


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
          const si = uniqueSIs.find(s => s.id === checkin.parent_id);
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

