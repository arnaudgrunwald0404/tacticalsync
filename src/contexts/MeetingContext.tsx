import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
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

// OPTIMIZED: Module-level cache to prevent duplicate fetches across component remounts
interface CacheEntry {
  data: {
    currentUserId: string;
    isSuperAdmin: boolean;
    isTeamAdmin: boolean;
    teamMembers: TeamMember[];
    memberNames: Map<string, string>;
  };
  timestamp: number;
}

const contextCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30000; // 30 seconds cache

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
  const isFetchingRef = useRef(false); // Prevent concurrent fetches

  const fetchData = async (forceRefresh = false) => {
    // OPTIMIZED: Check cache first
    const cacheKey = teamId;
    const cached = contextCache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < CACHE_DURATION)) {
      // Use cached data
      setCurrentUserId(cached.data.currentUserId);
      setIsSuperAdmin(cached.data.isSuperAdmin);
      setIsTeamAdmin(cached.data.isTeamAdmin);
      setTeamMembers(cached.data.teamMembers);
      setMemberNames(cached.data.memberNames);
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      setLoading(true);
      
      // Get current user (cached by Supabase client)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        isFetchingRef.current = false;
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

      const superAdmin = !!(profileResult.data as any)?.is_super_admin;
      const teamAdmin = (membershipResult.data as any)?.role === 'admin';
      
      setIsSuperAdmin(superAdmin);
      setIsTeamAdmin(teamAdmin);

      // Fetch profiles for all team members
      let members: TeamMember[] = [];
      let nameMap = new Map<string, string>();
      
      if (teamMembersResult.data && teamMembersResult.data.length > 0) {
        const userIds = teamMembersResult.data.map(member => member.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email, avatar_url, avatar_name')
          .in('id', userIds);

        // Combine team members with profiles
        members = teamMembersResult.data.map(member => ({
          ...member,
          profiles: profiles?.find(p => p.id === member.user_id) || null
        }));

        // Generate smart name map
        nameMap = formatMemberNames(members);
      }

      setTeamMembers(members);
      setMemberNames(nameMap);

      // OPTIMIZED: Store in cache
      contextCache.set(cacheKey, {
        data: {
          currentUserId: user.id,
          isSuperAdmin: superAdmin,
          isTeamAdmin: teamAdmin,
          teamMembers: members,
          memberNames: nameMap,
        },
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Error fetching meeting context data:', error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
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
    refetch: () => fetchData(true), // Force refresh on manual refetch
  };

  return (
    <MeetingContext.Provider value={value}>
      {children}
    </MeetingContext.Provider>
  );
}

