import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Settings, Plus, Edit2, Save, X, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MeetingAgenda from "@/components/meeting/MeetingAgenda";
import MeetingPriorities from "@/components/meeting/MeetingPriorities";
import type { MeetingPrioritiesRef } from "@/components/meeting/MeetingPriorities";
import TeamTopics from "@/components/meeting/TeamTopics";
import ActionItems from "@/components/meeting/ActionItems";
interface ActionItemsRef {
  startCreating: () => void;
}
import { format, getWeek, addDays, startOfWeek } from "date-fns";
import { getMeetingStartDate, getNextMeetingStartDate, getMeetingPeriodLabel, getISODateString, getMeetingEndDate } from "../lib/dateUtils";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { MeetingProvider } from "@/contexts/MeetingContext";
import { useMeetingRealtime } from "@/hooks/useMeetingRealtime";
import { usePresence } from "@/hooks/usePresence";
import { PresenceIndicator } from "@/components/realtime/PresenceIndicator";
import { ConnectionStatus } from "@/components/realtime/ConnectionStatus";
import { UserProfileHeader } from "@/components/ui/user-profile-header";
import { useMeetingContext } from "@/contexts/MeetingContext";

// Removed hardcoded STATIC_AGENDA - meetings should use standing agenda items from team settings

const TeamMeeting = () => {
  const { teamId, meetingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  interface Team {
    id: string;
    name: string;
    abbreviated_name?: string;
  }

  interface RecurringMeeting {
    id: string;
    name: string;
    frequency: "daily" | "weekly" | "bi-weekly" | "monthly" | "quarter";
    created_by?: string;
  }

  interface Meeting {
    id: string;
    start_date: string;
  }

  interface TeamAdmin {
    id: string;
    role: string;
    profiles: {
      full_name?: string;
      first_name?: string;
      last_name?: string;
    };
  }

  const [team, setTeam] = useState<Team | null>(null);
  const [recurringMeeting, setRecurringMeeting] = useState<RecurringMeeting | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
  const [agendaItems, setAgendaItems] = useState<any[]>([]);
  const [priorityItems, setPriorityItems] = useState<any[]>([]);
  const [previousPriorityItems, setPreviousPriorityItems] = useState<any[]>([]);
  const [teamTopicItems, setTeamTopicItems] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [currentSeriesId, setCurrentSeriesId] = useState<string | null>(null);
  const [teamAdmin, setTeamAdmin] = useState<TeamAdmin | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [previousMeetingId, setPreviousMeetingId] = useState<string | null>(null);
  const meetingPrioritiesRef = useRef<MeetingPrioritiesRef>(null);
  const actionItemsRef = useRef<ActionItemsRef>(null);
  const isFetchingRef = useRef(false); // OPTIMIZED: Prevent concurrent fetches
  const [isEditingAgenda, setIsEditingAgenda] = useState(false);
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    priorities: false,
    topics: false,
    actionItems: false,
  });
  const [showPreviousPeriod, setShowPreviousPeriod] = useState(false);
  const [showMineOnly, setShowMineOnly] = useState(true);
  const myPrioritiesThisPeriod = currentUserId ? priorityItems.filter(item => item.assigned_to === currentUserId) : [];
  const hasMyPriorities = myPrioritiesThisPeriod.length > 0;
  const [currentUserName, setCurrentUserName] = useState<string>("Team Member");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string>("");

  // Fetch current user profile for presence
  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, first_name, last_name, email, avatar_url')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          const displayName = profile.full_name || 
            `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
            profile.email?.split('@')[0] ||
            'Team Member';
          setCurrentUserName(displayName);
          setCurrentUserEmail(profile.email || '');
          setCurrentUserAvatar(profile.avatar_url || '');
        }
      }
    };
    fetchUserProfile();
  }, []);

  // Real-time presence - show who's viewing this meeting
  const { onlineUsers } = usePresence({
    roomId: `meeting:${meetingId}`,
    userName: currentUserName,
    userEmail: currentUserEmail,
    avatarUrl: currentUserAvatar,
    enabled: !!meetingId && !!currentUserName,
  });

  // OPTIMIZED: Granular callbacks to refetch only changed data
  const handlePriorityChange = useCallback(async () => {
    if (!meeting?.id) return;
    
    const [currentResult, previousResult] = await Promise.all([
      supabase
        .from("meeting_instance_priorities")
        .select(`
          *,
          assigned_to_profile:assigned_to(full_name, first_name, last_name, email, avatar_url, avatar_name),
          created_by_profile:created_by(full_name, first_name, last_name, email, avatar_url, avatar_name)
        `)
        .eq("instance_id", meeting.id)
        .order("order_index"),
      
      // Also fetch previous if exists
      previousMeetingId
        ? supabase
            .from("meeting_instance_priorities")
            .select(`
              *,
              assigned_to_profile:assigned_to(full_name, first_name, last_name, email, avatar_url, avatar_name),
              created_by_profile:created_by(full_name, first_name, last_name, email, avatar_url, avatar_name)
            `)
            .eq("instance_id", previousMeetingId)
            .order("order_index")
        : Promise.resolve({ data: [], error: null })
    ]);

    if (!currentResult.error) setPriorityItems(currentResult.data || []);
    if (!previousResult.error) setPreviousPriorityItems(previousResult.data || []);
  }, [meeting?.id, previousMeetingId]);

  const handleTopicChange = useCallback(async () => {
    if (!meeting?.id) return;
    
    const { data, error } = await supabase
      .from("meeting_instance_topics")
      .select("*")
      .eq("instance_id", meeting.id)
      .order("order_index");
    
    if (!error) setTeamTopicItems(data || []);
  }, [meeting?.id]);

  const handleActionItemChange = useCallback(async () => {
    if (!currentSeriesId) return;
    
    const { data, error } = await supabase
      .from("meeting_series_action_items")
      .select(`
        *,
        assigned_to_profile:assigned_to(full_name, first_name, last_name, email, avatar_url, avatar_name),
        created_by_profile:created_by(full_name, first_name, last_name, email, avatar_url, avatar_name)
      `)
      .eq("series_id", currentSeriesId)
      .order("order_index");
    
    if (!error) setActionItems(data || []);
  }, [currentSeriesId]);

  const handleAgendaChange = useCallback(async () => {
    if (!currentSeriesId) return;
    
    const { data: agendaData, error } = await supabase
      .from("meeting_series_agenda")
      .select("*")
      .eq("series_id", currentSeriesId)
      .order("order_index");
    
    if (error) return;
    
    // Fetch profiles for assigned users
    const assignedUserIds = (agendaData || [])
      .map(item => item.assigned_to)
      .filter((id): id is string => id != null);
    
    let profilesById: Record<string, any> = {};
    if (assignedUserIds.length > 0) {
      const uniqueUserIds = [...new Set(assignedUserIds)];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, email, avatar_url, avatar_name")
        .in("id", uniqueUserIds);
      
      profilesById = (profiles || []).reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
      }, {} as Record<string, any>);
    }

    const transformedAgendaData = (agendaData || []).map(item => ({
      ...item,
      is_completed: item.completion_status === 'completed',
      assigned_to_profile: item.assigned_to ? profilesById[item.assigned_to] || null : null
    }));
    setAgendaItems(transformedAgendaData);
  }, [currentSeriesId]);

  // Subscribe to real-time updates with granular handlers
  useMeetingRealtime({
    meetingId: meeting?.id,
    seriesId: currentSeriesId || undefined,
    teamId: teamId,
    previousMeetingId: previousMeetingId || undefined,
    onPriorityChange: handlePriorityChange,
    onTopicChange: handleTopicChange,
    onActionItemChange: handleActionItemChange,
    onAgendaChange: handleAgendaChange,
    enabled: !!meeting?.id && !!currentSeriesId,
  });

  useEffect(() => {
    if (teamId && meetingId) {
      fetchTeamAndMeeting();
    }
  }, [teamId, meetingId, location.pathname]);

  const fetchTeamAndMeeting = async () => {
    // OPTIMIZED: Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log('Fetch already in progress, skipping...');
      return;
    }
    
    isFetchingRef.current = true;

    try {
      // OPTIMIZED: Fetch team, meeting series, and all meetings in parallel
      const [teamResult, recurringResult, allMeetingsResult] = await Promise.all([
        supabase
          .from("teams")
          .select("*")
          .eq("id", teamId)
          .single(),
        supabase
          .from('meeting_series')
          .select('id,name,frequency,created_by')
          .filter('id', 'eq', meetingId)
          .limit(1)
          .single(),
        supabase
          .from("meeting_instances")
          .select("*")
          .eq("series_id", meetingId)
          .order("start_date", { ascending: false })
      ]);

      if (teamResult.error) throw teamResult.error;
      if (recurringResult.error) throw recurringResult.error;
      
      setTeam(teamResult.data);
      const recurringData = recurringResult.data as RecurringMeeting;
      setRecurringMeeting(recurringData);

      const allMeetingsData = allMeetingsResult.data || [];
      if (allMeetingsResult.error) {
        console.error("Error fetching meetings:", allMeetingsResult.error);
      } else {
        setAllMeetings(allMeetingsData);
      }

      // Get or create current period's meeting
      const today = new Date();
      const periodStart = getMeetingStartDate(recurringData.frequency, today);
      const periodStartStr = getISODateString(periodStart);
      
      // Try to find a meeting that includes today
      let selectedMeeting = allMeetingsData.find(m => {
        const [year, month, day] = m.start_date.split('-').map(Number);
        const startDate = new Date(year, month - 1, day);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = getMeetingEndDate(recurringData.frequency, startDate);
        endDate.setHours(23, 59, 59, 999);
        
        return today >= startDate && today <= endDate;
      });

      // If no meeting includes today, try to find one for the current period start date
      if (!selectedMeeting) {
        selectedMeeting = allMeetingsData.find(m => m.start_date === periodStartStr);
      }

      // If still no meeting found, create a new one
      if (!selectedMeeting) {
        console.log('Creating new meeting with data:', {
          series_id: meetingId,
          start_date: periodStartStr
        });
        
        const { data: newMeeting, error: createError } = await supabase
          .from("meeting_instances")
          .insert({ 
            series_id: meetingId,
            start_date: periodStartStr 
          })
          .select()
          .single();

        if (createError) throw createError;
        selectedMeeting = newMeeting;
        console.log('New meeting created:', newMeeting);
        
        // Update all meetings list with the new meeting
        setAllMeetings([newMeeting, ...allMeetingsData]);
      } else if (allMeetingsData.length > 0) {
        // If we found a meeting but there's a more recent one that also includes today, prefer that
        const mostRecent = allMeetingsData[0];
        if (mostRecent.id !== selectedMeeting.id) {
          const mostRecentIncludesToday = (() => {
            const [year, month, day] = mostRecent.start_date.split('-').map(Number);
            const startDate = new Date(year, month - 1, day);
            startDate.setHours(0, 0, 0, 0);
            const endDate = getMeetingEndDate(recurringData.frequency, startDate);
            endDate.setHours(23, 59, 59, 999);
            return today >= startDate && today <= endDate;
          })();
          
          if (mostRecentIncludesToday) {
            selectedMeeting = mostRecent;
          }
        }
      }
      
      setMeeting(selectedMeeting);
      updatePreviousMeetingId(selectedMeeting);
      
      // OPTIMIZED: Fetch meeting items, admin, and user role in parallel
      await Promise.all([
        fetchMeetingItems(selectedMeeting.id),
        fetchTeamAdmin(teamId),
        fetchCurrentUserRole(teamId)
      ]);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      isFetchingRef.current = false; // OPTIMIZED: Allow future fetches
    }
  };

  const fetchTeamAdmin = async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          id,
          role,
          profiles!fk_team_members_user_id_profiles (
            full_name,
            first_name,
            last_name
          )
        `)
        .eq("team_id", teamId)
        .eq("role", "admin");

      console.log("Admin query result:", { data, error });

      if (!error && data && data.length > 0) {
        setTeamAdmin(data[0]);
        console.log("Team admin set:", data[0]);
      } else {
        console.log("No admin found or error:", error);
      }
    } catch (error: unknown) {
      console.error("Error fetching team admin:", error);
    }
  };

  const fetchCurrentUserRole = async (teamId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .single();

      if (!error && data) {
        setCurrentUserRole(data.role);
      }
    } catch (error: unknown) {
      console.error("Error fetching current user role:", error);
    }
  };

  const fetchAllMeetings = async (recurringMeetingId: string) => {
    const { data, error } = await supabase
      .from("meeting_instances")
      .select("*")
      .eq("series_id", recurringMeetingId)
      .order("start_date", { ascending: false });

    if (error) {
      console.error("Error fetching meetings:", error);
      return;
    }

    setAllMeetings(data || []);
  };

  const fetchMeetingItems = async (meetingId: string) => {
    try {
      // Get the current meeting instance to get its series_id
      const { data: meetingData, error: meetingError } = await supabase
        .from("meeting_instances")
        .select("series_id, start_date")
        .eq("id", meetingId)
        .maybeSingle();

      if (meetingError) {
        console.error("Error fetching meeting:", meetingError);
        return;
      }

      if (!meetingData) {
        console.error("Meeting not found:", meetingId);
        return;
      }

      // Store the series_id for use in ActionItems
      setCurrentSeriesId(meetingData.series_id);

      // OPTIMIZED: Batch fetch all data in parallel using Promise.all
      const [
        agendaResult,
        prioritiesResult,
        topicsResult,
        actionItemsResult,
        previousMeetingResult
      ] = await Promise.all([
        // Agenda items
        supabase
          .from("meeting_series_agenda")
          .select("*")
          .eq("series_id", meetingData.series_id)
          .order("order_index"),
        
        // Current priorities with profile joins
        supabase
          .from("meeting_instance_priorities")
          .select(`
            *,
            assigned_to_profile:assigned_to(full_name, first_name, last_name, email, avatar_url, avatar_name),
            created_by_profile:created_by(full_name, first_name, last_name, email, avatar_url, avatar_name)
          `)
          .eq("instance_id", meetingId)
          .order("order_index"),
        
        // Topics
        supabase
          .from("meeting_instance_topics")
          .select("*")
          .eq("instance_id", meetingId)
          .order("order_index"),
        
        // Action items with profile joins
        supabase
          .from("meeting_series_action_items")
          .select(`
            *,
            assigned_to_profile:assigned_to(full_name, first_name, last_name, email, avatar_url, avatar_name),
            created_by_profile:created_by(full_name, first_name, last_name, email, avatar_url, avatar_name)
          `)
          .eq("series_id", meetingData.series_id)
          .order("order_index"),
        
        // Previous meeting lookup
        supabase
          .from("meeting_instances")
          .select("id")
          .eq("series_id", meetingData.series_id)
          .lt("start_date", meetingData.start_date)
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      // Process agenda items
      if (agendaResult.error) {
        console.error("Error fetching agenda items:", agendaResult.error);
      } else {
        // OPTIMIZED: Collect all unique user IDs from agenda items that need profiles
        const assignedUserIds = (agendaResult.data || [])
          .map(item => item.assigned_to)
          .filter((id): id is string => id != null);
        
        let profilesById: Record<string, any> = {};
        
        // Only fetch profiles if there are assigned users
        if (assignedUserIds.length > 0) {
          const uniqueUserIds = [...new Set(assignedUserIds)];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, first_name, last_name, email, avatar_url, avatar_name")
            .in("id", uniqueUserIds);
          
          profilesById = (profiles || []).reduce((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {} as Record<string, any>);
        }

        // Transform the data
        const transformedAgendaData = (agendaResult.data || []).map(item => ({
          ...item,
          is_completed: item.completion_status === 'completed',
          assigned_to_profile: item.assigned_to ? profilesById[item.assigned_to] || null : null
        }));
        setAgendaItems(transformedAgendaData);
      }

      // Process priorities
      if (prioritiesResult.error) {
        console.error("Error fetching priorities:", prioritiesResult.error);
      } else {
        setPriorityItems(prioritiesResult.data || []);
      }

      // Process topics
      if (topicsResult.error) {
        console.error("Error fetching topics:", topicsResult.error);
      } else {
        setTeamTopicItems(topicsResult.data || []);
      }

      // Process action items
      if (actionItemsResult.error) {
        console.error("Error fetching action items:", actionItemsResult.error);
      } else {
        setActionItems(actionItemsResult.data || []);
      }

      // Fetch previous meeting priorities if previous meeting exists
      if (previousMeetingResult.data) {
        const { data: previousPrioritiesData, error: previousPrioritiesError } = await supabase
          .from("meeting_instance_priorities")
          .select(`
            *,
            assigned_to_profile:assigned_to(full_name, first_name, last_name, email, avatar_url, avatar_name),
            created_by_profile:created_by(full_name, first_name, last_name, email, avatar_url, avatar_name)
          `)
          .eq("instance_id", previousMeetingResult.data.id)
          .order("order_index");

        if (previousPrioritiesError) {
          console.error("Error fetching previous priorities:", previousPrioritiesError);
          setPreviousPriorityItems([]);
        } else {
          setPreviousPriorityItems(previousPrioritiesData || []);
        }
      } else {
        setPreviousPriorityItems([]);
      }
    } catch (error) {
      console.error("Error in fetchMeetingItems:", error);
    }
  };


  const formatMeetingPeriodLabel = (weekStartDate: string) => {
    // Fix timezone issue: parse date string safely to avoid UTC conversion
    const [year, month, day] = weekStartDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day); // month is 0-indexed
    const frequency = recurringMeeting?.frequency || "weekly";
    
    console.log('formatMeetingPeriodLabel debug:', {
      weekStartDate,
      startDate: startDate.toISOString().split('T')[0],
      frequency,
      startDateObject: startDate
    });
    
    const label = getMeetingPeriodLabel(startDate, frequency);
    console.log('Generated label:', label);
    
    return label;
  };

  const handleMeetingChange = async (meetingId: string) => {
    const selectedMeeting = allMeetings.find(m => m.id === meetingId);
    if (selectedMeeting) {
      setMeeting(selectedMeeting);
      await fetchMeetingItems(selectedMeeting.id);
      updatePreviousMeetingId(selectedMeeting);
    }
  };

  const updatePreviousMeetingId = (currentMeeting: any) => {
    if (!allMeetings || allMeetings.length === 0) return;
    
    // Sort meetings by date descending
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    );
    
    // Find current meeting index
    const currentIndex = sortedMeetings.findIndex(m => m.id === currentMeeting.id);
    
    // If there's a meeting before this one (next in array since sorted desc)
    if (currentIndex >= 0 && currentIndex < sortedMeetings.length - 1) {
      setPreviousMeetingId(sortedMeetings[currentIndex + 1].id);
    } else {
      setPreviousMeetingId(null);
    }
  };

  // Check if current meeting is the most recent one
  const isCurrentMeeting = () => {
    if (!meeting || allMeetings.length === 0) return false;
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    );
    return meeting.id === sortedMeetings[0].id;
  };

  // Check if current meeting has priorities
  const currentMeetingHasPriorities = () => {
    return priorityItems.length > 0;
  };

  // Check if the meeting period has ended (past meetings)
  const isMeetingPeriodEnded = () => {
    if (!meeting || !recurringMeeting) return false;
    
    // Fix timezone issue: parse date string safely to avoid UTC conversion
    const [year, month, day] = meeting.start_date.split('-').map(Number);
    const safeDate = new Date(year, month - 1, day); // month is 0-indexed
    
    const meetingEndDate = getMeetingEndDate(recurringMeeting.frequency, safeDate);
    const today = new Date();
    
    // Set today to end of day for comparison
    today.setHours(23, 59, 59, 999);
    meetingEndDate.setHours(23, 59, 59, 999);
    
    console.log('isMeetingPeriodEnded debug:', {
      meetingStartDate: meeting.start_date,
      safeDate: safeDate.toISOString().split('T')[0],
      meetingEndDate: meetingEndDate.toISOString().split('T')[0],
      today: today.toISOString().split('T')[0],
      isEnded: meetingEndDate < today
    });
    
    return meetingEndDate < today;
  };

  // Check if a meeting period is current (today falls within the period)
  const isCurrentMeetingPeriod = (meetingStartDateString: string) => {
    if (!recurringMeeting) return false;
    
    // Fix timezone issue: parse date string safely to avoid UTC conversion
    const [year, month, day] = meetingStartDateString.split('-').map(Number);
    const safeDate = new Date(year, month - 1, day); // month is 0-indexed
    
    // Normalize the start date using the utility function for consistency
    const normalizedStartDate = getMeetingStartDate(recurringMeeting.frequency, safeDate);
    const endDate = getMeetingEndDate(recurringMeeting.frequency, normalizedStartDate);
    const today = new Date();
    
    // Set today to start of day for comparison
    today.setHours(0, 0, 0, 0);
    normalizedStartDate.setHours(0, 0, 0, 0); // Ensure start of day for comparison
    endDate.setHours(23, 59, 59, 999); // Ensure end of day for comparison
    
    console.log('isCurrentMeetingPeriod debug:', {
      meetingStartDateString,
      safeDate: safeDate.toISOString().split('T')[0],
      normalizedStartDate: normalizedStartDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      today: today.toISOString().split('T')[0],
      isCurrent: today >= normalizedStartDate && today <= endDate
    });
    
    return today >= normalizedStartDate && today <= endDate;
  };

  // Check if there's a previous meeting to navigate to
  const hasPreviousMeeting = () => {
    if (!meeting || allMeetings.length <= 1) return false;
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
    const currentIndex = sortedMeetings.findIndex(m => m.id === meeting.id);
    return currentIndex > 0; // There's a meeting before this one
  };

  // Navigate to previous meeting
  const navigateToPreviousMeeting = () => {
    if (!meeting || allMeetings.length === 0) return;
    
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    );
    
    const currentIndex = sortedMeetings.findIndex(m => m.id === meeting.id);
    if (currentIndex < sortedMeetings.length - 1) {
      const previousMeeting = sortedMeetings[currentIndex + 1];
      handleMeetingChange(previousMeeting.id);
    }
  };

  // Navigate to next meeting or create new one
  const navigateToNextMeeting = async () => {
    if (!meeting || allMeetings.length === 0) return;
    
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    );
    
    const currentIndex = sortedMeetings.findIndex(m => m.id === meeting.id);
    
    if (currentIndex > 0) {
      // Navigate to existing next meeting
      const nextMeeting = sortedMeetings[currentIndex - 1];
      handleMeetingChange(nextMeeting.id);
    } else if (currentIndex === 0) {
      // We're at the most recent meeting, create next one
      await createNextMeeting();
    }
  };

  // Create next meeting iteration
  const createNextMeeting = async () => {
    if (!meeting || !recurringMeeting) return;
    
    try {
      // Calculate next meeting start date using proper boundaries
    const currentStart = new Date(meeting.start_date);
    const nextStart = getNextMeetingStartDate(recurringMeeting.frequency, currentStart);
    const nextStartStr = getISODateString(nextStart);
      
      // Create new meeting
      const { data: newMeeting, error } = await supabase
        .from("meeting_instances")
        .insert({
          series_id: meetingId,
          start_date: nextStartStr
        })
        .select()
        .single();

      if (error) throw error;

      // Copy agenda items from current meeting series to next meeting instance
      // Note: Agenda items are linked to the series, so they're already available for the new instance

      // Refresh meetings and navigate to new one
      await fetchAllMeetings(meetingId);
      await handleMeetingChange(newMeeting.id);

      toast({
        title: "Next meeting created!",
        description: `${formatMeetingPeriodLabel(nextStartStr)} has been created`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to create next meeting",
        variant: "destructive",
      });
    }
  };

  // OPTIMIZED: Filter action items to only show those active during current meeting period
  // Activity Period = created_at to completed_at (or current if not completed)
  const filteredActionItems = useMemo(() => {
    if (!meeting || !recurringMeeting) return actionItems;
    
    // Calculate meeting period boundaries
    const [year, month, day] = meeting.start_date.split('-').map(Number);
    const meetingStart = new Date(year, month - 1, day);
    meetingStart.setHours(0, 0, 0, 0);
    
    const meetingEnd = getMeetingEndDate(recurringMeeting.frequency, meetingStart);
    meetingEnd.setHours(23, 59, 59, 999);
    
    return actionItems.filter(item => {
      const createdAt = new Date(item.created_at);
      
      // Item must be created before or during this meeting period
      if (createdAt > meetingEnd) {
        return false;
      }
      
      // If item is not completed yet, show it
      if (!item.completed_at) {
        return true;
      }
      
      // If item is completed, only show if completed during or after meeting start
      const completedAt = new Date(item.completed_at);
      return completedAt >= meetingStart;
    });
  }, [actionItems, meeting, recurringMeeting]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!teamId) {
    return null;
  }

  return (
    <MeetingProvider teamId={teamId}>
      <TeamMeetingContent 
        teamId={teamId}
        meetingId={meetingId}
        team={team}
        recurringMeeting={recurringMeeting}
        teamAdmin={teamAdmin}
        currentUserRole={currentUserRole}
        onlineUsers={onlineUsers}
        meeting={meeting}
        allMeetings={allMeetings}
        agendaItems={agendaItems}
        priorityItems={priorityItems}
        previousPriorityItems={previousPriorityItems}
        teamTopicItems={teamTopicItems}
        actionItems={filteredActionItems}
        currentSeriesId={currentSeriesId}
        currentUserId={currentUserId}
        sectionsCollapsed={sectionsCollapsed}
        setSectionsCollapsed={setSectionsCollapsed}
        showPreviousPeriod={showPreviousPeriod}
        setShowPreviousPeriod={setShowPreviousPeriod}
        showMineOnly={showMineOnly}
        setShowMineOnly={setShowMineOnly}
        hasMyPriorities={hasMyPriorities}
        meetingPrioritiesRef={meetingPrioritiesRef}
        actionItemsRef={actionItemsRef}
        handlePriorityChange={handlePriorityChange}
        handleTopicChange={handleTopicChange}
        handleActionItemChange={handleActionItemChange}
        handleAgendaChange={handleAgendaChange}
        handleMeetingChange={handleMeetingChange}
        formatMeetingPeriodLabel={formatMeetingPeriodLabel}
        isCurrentMeetingPeriod={isCurrentMeetingPeriod}
        isCurrentMeeting={isCurrentMeeting}
        currentMeetingHasPriorities={currentMeetingHasPriorities}
        hasPreviousMeeting={hasPreviousMeeting}
        navigateToPreviousMeeting={navigateToPreviousMeeting}
        navigateToNextMeeting={navigateToNextMeeting}
      />
    </MeetingProvider>
  );
};

interface TeamMeetingContentProps {
  teamId: string;
  meetingId: string | undefined;
  team: any;
  recurringMeeting: any;
  teamAdmin: any;
  currentUserRole: string | null;
  onlineUsers: any[];
  meeting: any;
  allMeetings: any[];
  agendaItems: any[];
  priorityItems: any[];
  previousPriorityItems: any[];
  teamTopicItems: any[];
  actionItems: any[];
  currentSeriesId: string | null;
  currentUserId: string | null;
  sectionsCollapsed: any;
  setSectionsCollapsed: any;
  showPreviousPeriod: boolean;
  setShowPreviousPeriod: any;
  showMineOnly: boolean;
  setShowMineOnly: any;
  hasMyPriorities: boolean;
  meetingPrioritiesRef: any;
  actionItemsRef: any;
  handlePriorityChange: () => Promise<void>;
  handleTopicChange: () => Promise<void>;
  handleActionItemChange: () => Promise<void>;
  handleAgendaChange: () => Promise<void>;
  handleMeetingChange: (meetingId: string) => Promise<void>;
  formatMeetingPeriodLabel: (date: string) => string;
  isCurrentMeetingPeriod: (date: string) => boolean;
  isCurrentMeeting: () => boolean;
  currentMeetingHasPriorities: () => boolean;
  hasPreviousMeeting: () => boolean;
  navigateToPreviousMeeting: () => void;
  navigateToNextMeeting: () => Promise<void>;
}

const TeamMeetingContent = ({
  teamId,
  meetingId,
  team,
  recurringMeeting,
  teamAdmin,
  currentUserRole,
  onlineUsers,
  meeting,
  allMeetings,
  agendaItems,
  priorityItems,
  previousPriorityItems,
  teamTopicItems,
  actionItems,
  currentSeriesId,
  currentUserId,
  sectionsCollapsed,
  setSectionsCollapsed,
  showPreviousPeriod,
  setShowPreviousPeriod,
  showMineOnly,
  setShowMineOnly,
  hasMyPriorities,
  meetingPrioritiesRef,
  actionItemsRef,
  handlePriorityChange,
  handleTopicChange,
  handleActionItemChange,
  handleAgendaChange,
  handleMeetingChange,
  formatMeetingPeriodLabel,
  isCurrentMeetingPeriod,
  isCurrentMeeting,
  currentMeetingHasPriorities,
  hasPreviousMeeting,
  navigateToPreviousMeeting,
  navigateToNextMeeting,
}: TeamMeetingContentProps) => {
  const navigate = useNavigate();
  const { teamMembers } = useMeetingContext();

  return (
    <GridBackground inverted className="min-h-screen bg-blue-50 overscroll-none">
              <header className="sticky top-0 z-50 border-b bg-white">
                <div className="container mx-auto px-4 py-3 sm:py-4 relative pr-20">
                  {/* Top row: Logo, Title/Admin, Settings */}
                  <div className="flex items-center justify-between mb-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-8 sm:h-10 px-2 sm:px-4">
                      <ArrowLeft className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Home</span>
                    </Button>
                    
                    {/* Meeting Title - Centered */}
                    <div className="flex-1 text-center px-2">
                      <h1 className="text-lg sm:text-xl md:text-2xl font-bold">
                        {recurringMeeting?.name}
                      </h1>
                      {teamAdmin?.profiles && (
                        <p className="text-[10px] sm:text-xs mt-1">
                          Team admin: {(() => {
                            const firstName = teamAdmin.profiles.first_name || "";
                            const lastName = teamAdmin.profiles.last_name || "";
                            const fullName = teamAdmin.profiles.full_name || "";
                            
                            // Try first_name + last_name first, fallback to full_name
                            if (firstName && lastName) {
                              const lastInitial = lastName.charAt(0) + ".";
                              return `${firstName} ${lastInitial}`.trim();
                            } else if (fullName) {
                              // Check if it's an email address
                              if (fullName.includes("@")) {
                                return fullName;
                              }
                              // Split full_name and use same format
                              const nameParts = fullName.split(" ");
                              if (nameParts.length === 1) {
                                // If only one part, just return it (no initial)
                                return fullName;
                              }
                              const first = nameParts[0] || "";
                              const last = nameParts[nameParts.length - 1] || "";
                              const lastInitial = last ? last.charAt(0) + "." : "";
                              return `${first} ${lastInitial}`.trim();
                            }
                            return "Unknown";
                          })()}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Real-time Connection Status */}
                      <ConnectionStatus />
                      
                      {/* Presence Indicator - Show who's online */}
                      <PresenceIndicator users={onlineUsers} maxDisplay={3} teamMembers={teamMembers} />
                      
                      {currentUserRole === "admin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/team/${teamId}/meeting/${meetingId}/settings`)}
                          className="h-8 sm:h-10 w-8 sm:w-10 p-0"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <UserProfileHeader />
                  
                  {/* Period Picker row with navigation buttons */}
                  {meeting && allMeetings.length > 0 && (
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      {/* Previous Button */}
                      {hasPreviousMeeting() && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="border-gray-300 text-gray-600 hover:text-primary hover:border-primary h-10 sm:h-12 px-2 sm:px-4 text-xs sm:text-sm"
                          onClick={() => navigateToPreviousMeeting()}
                        >
                          <span className="hidden sm:inline">← Previous</span>
                          <span className="sm:hidden">←</span>
                        </Button>
                      )}
                      
                      {/* Period Picker */}
                      <Select value={meeting.id} onValueChange={handleMeetingChange}>
                        <SelectTrigger className={`w-full sm:w-[240px] md:w-[300px] h-10 sm:h-12 font-semibold text-sm sm:text-base md:text-lg ${
                          isCurrentMeetingPeriod(meeting.start_date) 
                            ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-2 border-blue-600 text-white shadow-md' 
                            : 'bg-gray-100 border-gray-300 text-gray-600'
                        }`}>
                          <SelectValue>
                            {formatMeetingPeriodLabel(meeting.start_date)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          {allMeetings.map((m) => (
                            <SelectItem 
                              key={m.id} 
                              value={m.id}
                              className={isCurrentMeetingPeriod(m.start_date) 
                                ? 'bg-gradient-to-br from-blue-50 to-blue-100 text-blue-800 font-semibold border-blue-200' 
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                              }
                            >
                              {formatMeetingPeriodLabel(m.start_date)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Next/Create Next Button */}
                      {(
                        (isCurrentMeeting() && currentMeetingHasPriorities()) || 
                        (!isCurrentMeeting() && allMeetings.length > 1)
                      ) && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="border-gray-300 text-gray-600 hover:text-primary hover:border-primary h-10 sm:h-12 px-2 sm:px-4 text-xs sm:text-sm"
                          onClick={() => navigateToNextMeeting()}
                        >
                          <span className="hidden sm:inline">{isCurrentMeeting() ? "Create Next →" : "Next →"}</span>
                          <span className="sm:hidden">→</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </header>

      <main className="container mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="flex gap-6">
          {/* Sticky Agenda Sidebar - Hide on small screens */}
          <div className="hidden lg:block w-64 xl:w-72 shrink-0">
            <div className="sticky top-24 h-[calc(100vh-140px)]">
              <Card className="p-4 sm:p-6 h-full">
                <MeetingAgenda
                  items={agendaItems}
                  meetingId={meeting?.id}
                  teamId={teamId}
                  onUpdate={handleAgendaChange}
                  currentUserId={currentUserId || undefined}
                  isAdmin={(currentUserRole === "admin") || (currentUserId !== null && currentUserId === recurringMeeting?.created_by) || false}
                />
              </Card>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 space-y-6 sm:space-y-8">
            <Card className="p-4 sm:p-6">
                <div className="space-y-4 mb-4 sm:mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 h-auto hover:bg-transparent"
                            onClick={() => setSectionsCollapsed(prev => ({ ...prev, priorities: !prev.priorities }))}
                          >
                            {sectionsCollapsed.priorities ? (
                              <ChevronRight className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                          </Button>
                          <h2 className="font-bold text-2xl text-gray-900" data-testid="priorities-section">Priorities</h2>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 pt-2">
                      {previousMeetingId && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="show-previous"
                            checked={showPreviousPeriod}
                            onCheckedChange={(checked) => setShowPreviousPeriod(checked === true)}
                          />
                          <label htmlFor="show-previous" className="text-sm text-muted-foreground">
                            Include previous {recurringMeeting?.frequency === "monthly" ? "month" : recurringMeeting?.frequency === "weekly" ? "week" : recurringMeeting?.frequency === "quarter" ? "quarter" : "period"}
                          </label>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="show-mine-only"
                          checked={showMineOnly}
                          onCheckedChange={(checked) => setShowMineOnly(checked === true)}
                        />
                        <label htmlFor="show-mine-only" className="text-sm text-muted-foreground">
                          Show mine only
                        </label>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => meetingPrioritiesRef.current?.startCreating()}
                      size="sm"
                      variant={hasMyPriorities ? "ghost" : "default"}
                      className={`text-xs sm:text-sm h-8 sm:h-9 ${
                        hasMyPriorities 
                          ? "text-primary hover:text-primary/80 hover:bg-transparent" 
                          : ""
                      }`}
                    >
                      {hasMyPriorities ? (
                        <Edit2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                      ) : (
                        <Plus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                      )}
                      <span className="hidden sm:inline">
                        {hasMyPriorities 
                          ? (showPreviousPeriod ? "Edit this Week's Priorities" : "Edit Priorities") 
                          : "Add my priorities"
                        }
                      </span>
                      <span className="sm:hidden">
                        {hasMyPriorities 
                          ? (showPreviousPeriod ? "Edit This Week" : "Edit") 
                          : "Add"
                        }
                      </span>
                    </Button>
                  </div>
                </div>
              {!sectionsCollapsed.priorities && (
                <MeetingPriorities
                ref={meetingPrioritiesRef}
                currentUserId={currentUserId || undefined}
                items={showMineOnly && currentUserId 
                  ? priorityItems.filter(item => item.assigned_to === currentUserId)
                  : priorityItems
                }
                previousItems={showMineOnly && currentUserId 
                  ? previousPriorityItems.filter(item => item.assigned_to === currentUserId)
                  : previousPriorityItems
                }
                meetingId={meeting?.id}
                teamId={teamId}
                onUpdate={handlePriorityChange}
                frequency={recurringMeeting?.frequency}
                showPreviousPeriod={showPreviousPeriod}
                meetingStartDate={meeting?.start_date}
              />
              )}
            </Card>

            <Card className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-0 h-auto hover:bg-transparent"
                    onClick={() => setSectionsCollapsed(prev => ({ ...prev, topics: !prev.topics }))}
                  >
                    {sectionsCollapsed.topics ? (
                      <ChevronRight className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </Button>
                  <h2 className="font-bold text-2xl text-gray-900" data-testid="topics-section">Topics for Today</h2>
                </div>
              </div>
              {!sectionsCollapsed.topics && (
                <TeamTopics
                items={teamTopicItems}
                meetingId={meeting?.id || ""}
                teamId={teamId}
                teamName={team?.abbreviated_name || team?.name || "Team"}
                onUpdate={handleTopicChange}
              />
              )}
            </Card>

            <Card className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-auto hover:bg-transparent"
                  onClick={() => setSectionsCollapsed(prev => ({ ...prev, actionItems: !prev.actionItems }))}
                >
                  {sectionsCollapsed.actionItems ? (
                    <ChevronRight className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </Button>
                <h2 className="font-bold text-2xl text-gray-900" data-testid="action-items-section">Action Items</h2>
              </div>
              {!sectionsCollapsed.actionItems && (
                <ActionItems
                ref={actionItemsRef}
                items={filteredActionItems}
                meetingId={currentSeriesId || ""}
                teamId={teamId}
                onUpdate={handleActionItemChange}
              />
              )}
            </Card>
          </div>
        </div>
      </main>
    </GridBackground>
    </MeetingProvider>
  );
};

export default TeamMeeting;
