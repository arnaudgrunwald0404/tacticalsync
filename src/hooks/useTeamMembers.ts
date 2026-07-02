import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  relationship_type: string;
}

export function useTeamMembers(userId: string | null) {
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    if (!userId) return;
    (supabase as any)
      .from('cos_team_members')
      .select('id, name, email, role, relationship_type')
      .eq('user_id', userId)
      .then(({ data }: { data: TeamMember[] | null }) => {
        if (data) setMembers(data);
      });
  }, [userId]);

  return members;
}
