import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  MeetingAgendaProps,
  MeetingDataState,
  MeetingDataActions,
  TeamMember,
  AgendaItem
} from '@/types/meeting';

export function useMeetingData(props: MeetingAgendaProps): {
  state: MeetingDataState;
  actions: MeetingDataActions;
} {
  const { teamId, onUpdate } = props;
  const { toast } = useToast();

  // State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [editingItems, setEditingItems] = useState<AgendaItem[]>([]);
  const [isEditingAgenda, setIsEditingAgenda] = useState(false);
  
  // Only clear editing items when exiting edit mode
  useEffect(() => {
    if (!isEditingAgenda && editingItems.length > 0) {
      setEditingItems([]);
    }
  }, [isEditingAgenda, editingItems]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Data fetching
  useEffect(() => {
    fetchTeamMembers();
    checkIfAdmin();
  }, [teamId]);

  const fetchTeamMembers = async () => {
    // Fetch team members first
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("id, user_id")
      .eq("team_id", teamId);
    
    if (!teamMembers || teamMembers.length === 0) {
      setTeamMembers([]);
      return;
    }
    
    // Fetch profiles for all team members
    const userIds = teamMembers.map(member => member.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, email, avatar_url, avatar_name")
      .in("id", userIds);
    
    // Combine team members with their profiles
    const membersWithProfiles = teamMembers.map(member => {
      const profile = profiles?.find(p => p.id === member.user_id);
      return {
        id: member.id,
        user_id: member.user_id,
        profiles: profile || null
      };
    });
    
    setTeamMembers(membersWithProfiles);
  };

  const checkIfAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberData, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .single();

      if (!error && memberData) {
        setIsAdmin(memberData.role === "admin");
      }
    } catch (error: unknown) {
      console.error("Error checking admin status:", error);
    }
  };

  // Actions
  const handleToggleComplete = async (itemId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    
    try {
      // First, ensure we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      
      if (!session) {
        // If no session, try to refresh
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw refreshError;
        if (!refreshedSession) throw new Error('No session available');
      }

      // Update the agenda item in the correct table with the correct column
      const { error } = await supabase
        .from("meeting_series_agenda")
        .update({ 
          completion_status: newStatus ? 'completed' : 'not_started'
        })
        .eq("id", itemId);

      if (error) throw error;

      onUpdate();
    } catch (error: unknown) {
      console.error('Error updating agenda item:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update item";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleUpdateNotes = async (itemId: string, notes: string) => {
    const { error } = await supabase
      .from("meeting_series_agenda")
      .update({ notes })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update notes",
        variant: "destructive",
      });
    }
  };

  const updateEditingItem = (index: number, field: keyof AgendaItem, value: AgendaItem[keyof AgendaItem]) => {
    const updated = [...editingItems];
    updated[index] = { ...updated[index], [field]: value };
    setEditingItems(updated);
  };

  const updateEditingItems = (items: AgendaItem[]) => {
    setEditingItems(items);
  };

  const setEditing = (editing: boolean) => {
    setIsEditingAgenda(editing);
  };

  return {
    state: {
      teamMembers,
      isEditingAgenda,
      editingItems,
      isAdmin,
    },
    actions: {
      handleToggleComplete,
      handleUpdateNotes,
      updateEditingItem,
      updateEditingItems,
      setEditing,
    },
  };
}