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
  const [isEditingAgenda, setIsEditingAgenda] = useState(false);
  
  useEffect(() => {
    if (!isEditingAgenda) {
      setEditingItems([]);
    }
  }, [isEditingAgenda]);
  const [editingItems, setEditingItems] = useState<AgendaItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Data fetching
  useEffect(() => {
    fetchTeamMembers();
    checkIfAdmin();
  }, [teamId]);

  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(full_name, first_name, last_name, email, avatar_url, avatar_name)
      `)
      .eq("team_id", teamId);

    if (error) {
      console.error("Error fetching team members:", error);
      return;
    }

    if (data) {
      const validMembers = (data as unknown[])
        .filter((member): member is { id: unknown; user_id: unknown; profiles: Record<string, unknown> } => (
          member !== null &&
          typeof member === 'object' &&
          'id' in member &&
          'user_id' in member &&
          'profiles' in member &&
          member.profiles !== null &&
          typeof member.profiles === 'object'
        ))
        .map(member => ({
          id: String(member.id),
          user_id: String(member.user_id),
          profiles: {
            full_name: typeof member.profiles.full_name === 'string' ? member.profiles.full_name : undefined,
            first_name: typeof member.profiles.first_name === 'string' ? member.profiles.first_name : undefined,
            last_name: typeof member.profiles.last_name === 'string' ? member.profiles.last_name : undefined,
            email: typeof member.profiles.email === 'string' ? member.profiles.email : '',
            avatar_url: typeof member.profiles.avatar_url === 'string' ? member.profiles.avatar_url : undefined,
            avatar_name: typeof member.profiles.avatar_name === 'string' ? member.profiles.avatar_name : undefined,
          }
        })) as TeamMember[];
      setTeamMembers(validMembers);
    }
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

      // Now try to update the item
      const { error } = await supabase
        .from("meeting_items")
        .update({ 
          is_completed: newStatus
        })
        .eq("id", itemId)
        .eq("type", "agenda");

      if (error) throw error;

      onUpdate();
    } catch (error: any) {
      console.error('Error updating agenda item:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update item",
        variant: "destructive",
      });
    }
  };

  const handleUpdateNotes = async (itemId: string, notes: string) => {
    const { error } = await supabase
      .from("meeting_items")
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