import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatMemberNames } from '@/lib/nameUtils';

interface Profile {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string;
  avatar_name?: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  team_id: string;
  role: string;
  created_at: string;
  profiles: Profile | null;
}

interface MeetingContextData {
  teamId: string;
  currentUserId: string | null;
  isSuperAdmin: boolean;
  isTeamAdmin: boolean;
  teamMembers: TeamMember[];
  memberNames: Map<string, string>;
  loading: boolean;
  refetch: () => Promise<void>;
}

const MeetingContext = createContext<MeetingContextData | null>(null);

export function useMeetingContext() {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error('useMeetingContext must be used within MeetingProvider');
  }
  return context;
}

interface MeetingProviderProps {
  teamId: string;
  children: ReactNode;
}

export function MeetingProvider({ teamId, children }: MeetingProviderProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isTeamAdmin, setIsTeamAdmin] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      
      setCurrentUserId(user.id);

      // Batch fetch: user profile, user's team membership, and all team members in parallel
      const [profileResult, membershipResult, teamMembersResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', user.id)
          .single(),
        supabase
          .from('team_members')
          .select('role')
          .eq('team_id', teamId)
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('team_members')
          .select('id, user_id, team_id, role, created_at')
          .eq('team_id', teamId)
      ]);

      // Set permissions
      setIsSuperAdmin(!!(profileResult.data as any)?.is_super_admin);
      setIsTeamAdmin((membershipResult.data as any)?.role === 'admin');

      // Fetch profiles for all team members
      if (teamMembersResult.data && teamMembersResult.data.length > 0) {
        const userIds = teamMembersResult.data.map(member => member.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email, avatar_url, avatar_name')
          .in('id', userIds);

        // Combine team members with profiles
        const membersWithProfiles = teamMembersResult.data.map(member => ({
          ...member,
          profiles: profiles?.find(p => p.id === member.user_id) || null
        }));

        setTeamMembers(membersWithProfiles);

        // Generate smart name map
        const nameMap = formatMemberNames(membersWithProfiles);
        setMemberNames(nameMap);
      } else {
        setTeamMembers([]);
        setMemberNames(new Map());
      }
    } catch (error) {
      console.error('Error fetching meeting context data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (teamId) {
      fetchData();
    }
  }, [teamId]);

  const value: MeetingContextData = {
    teamId,
    currentUserId,
    isSuperAdmin,
    isTeamAdmin,
    teamMembers,
    memberNames,
    loading,
    refetch: fetchData,
  };

  return (
    <MeetingContext.Provider value={value}>
      {children}
    </MeetingContext.Provider>
  );
}

