import { forwardRef, useImperativeHandle, useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AgendaSidebar } from "./AgendaSidebar";
import { useMeetingData } from "@/hooks/useMeetingData";
import { MeetingAgendaProps, MeetingAgendaRef } from "@/types/meeting";
import { AgendaItem, AgendaItemInsert } from "@/types/agenda";
import { useToast } from "@/components/ui/use-toast";
import debounce from "lodash/debounce";

const MeetingAgenda = forwardRef<MeetingAgendaRef, MeetingAgendaProps>((props, ref) => {
  const { items, meetingId, onUpdate, isAdmin: isAdminProp } = props;
  const { state, actions } = useMeetingData(props);
  const { toast } = useToast();
  const [systemTemplates, setSystemTemplates] = useState<any[]>([]);
  const [adoptingTemplate, setAdoptingTemplate] = useState(false);

  // Fetch system templates
  useEffect(() => {
    const fetchSystemTemplates = async () => {
      const { data, error } = await supabase
        .from("agenda_templates")
        .select(`
          *,
          items:agenda_template_items(*)
        `)
        .eq("is_system", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching templates:", error);
        return;
      }

      // Sort items by order_index
      const templatesWithSortedItems = (data || []).map(template => ({
        ...template,
        items: (template.items || []).sort((a, b) => a.order_index - b.order_index),
      }));

      setSystemTemplates(templatesWithSortedItems);
    };

    fetchSystemTemplates();
  }, []);

  const validateItems = (items: AgendaItem[]) => {
    return items.every(item => item.title.trim().length > 0);
  };

  const adoptSystemTemplate = async (template: any) => {
    if (!meetingId) return;
    setAdoptingTemplate(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Get the recurring meeting ID for this meeting instance
      const { data: meetingData, error: meetingError } = await supabase
        .from("meeting_instances")
        .select("recurring_meeting_id")
        .eq("id", meetingId)
        .single();

      if (meetingError || !meetingData) throw meetingError || new Error("Meeting not found");

      // Clear existing agenda items first
      const { error: deleteError } = await supabase
        .from("meeting_series_agenda")
        .delete()
        .eq("series_id", meetingData.recurring_meeting_id);

      if (deleteError) throw deleteError;

      // Create agenda items from template
      const items = template.items.map((item: any, index: number) => ({
        series_id: meetingData.recurring_meeting_id,
        title: item.title,
        notes: "",
        time_minutes: item.duration_minutes,
        assigned_to: null,
        order_index: index,
        created_by: user.id
      }));

      const { error } = await supabase
        .from("meeting_series_agenda")
        .insert(items);

      if (error) throw error;

      onUpdate();
      toast({
        title: "Template adopted",
        description: "The agenda has been set up with the selected template.",
      });
    } catch (error: unknown) {
      console.error("Error adopting template:", error);
      toast({
        title: "Error",
        description: "Failed to adopt template",
        variant: "destructive",
      });
    } finally {
      setAdoptingTemplate(false);
    }
  };

  const startAddingManually = async () => {
    if (!meetingId) return;
    
    try {
      // Get the recurring meeting ID for this meeting instance
      const { data: meetingData, error: meetingError } = await supabase
        .from("meeting_instances")
        .select("recurring_meeting_id")
        .eq("id", meetingId)
        .single();

      if (meetingError || !meetingData) throw meetingError || new Error("Meeting not found");

      // Clear existing agenda items
      const { error: deleteError } = await supabase
        .from("meeting_series_agenda")
        .delete()
        .eq("series_id", meetingData.recurring_meeting_id);

      if (deleteError) throw deleteError;

      // Create a single empty agenda item to start with
      const { error: insertError } = await supabase
        .from("meeting_series_agenda")
        .insert({
          series_id: meetingData.recurring_meeting_id,
          title: "",
          notes: "",
          order_index: 0,
          created_by: props.currentUserId,
          assigned_to: null,
          time_minutes: null,
        });

      if (insertError) throw insertError;

      // Refresh the items
      onUpdate();

      // Start editing mode with the empty item
      const emptyItem = {
        id: `temp-${Date.now()}`,
        title: "",
        is_completed: false,
        assigned_to: null,
        notes: null,
        order_index: 0,
        time_minutes: null,
        desired_outcomes: null,
        activities: null,
      };
      
      // Update both the items and editing state
      actions.updateEditingItems([emptyItem]);
      actions.setEditing(true);
      
      // Force a refresh of the items
      onUpdate();

      toast({
        title: "Started new agenda",
        description: "You can now add your agenda items",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start new agenda",
        variant: "destructive",
      });
    }
  };

  const handleError = (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    state.error = errorMessage;
    toast({
      variant: "destructive",
      title: "Error",
      description: errorMessage,
    });
  };

  const saveChanges = async () => {
    if (!validateItems(state.editingItems)) {
      handleError(new Error("All agenda items must have a title"));
      return;
    }

    state.isSaving = true;
    state.error = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Separate items into new and existing
      const newItems = state.editingItems.filter(item => item.id.startsWith('temp-'));
      const existingItems = state.editingItems.filter(item => !item.id.startsWith('temp-'));

      // Get the recurring meeting ID
      const { data: meetingData, error: meetingError } = await supabase
        .from("meeting_instances")
        .select("recurring_meeting_id")
        .eq("id", meetingId)
        .single();

      if (meetingError || !meetingData) throw meetingError || new Error("Meeting not found");

      // Insert new items
      if (newItems.length > 0) {
        const itemsToInsert: AgendaItemInsert[] = newItems.map(item => ({
          series_id: meetingData.recurring_meeting_id,
          title: item.title,
          notes: item.notes || null,
          assigned_to: item.assigned_to,
          time_minutes: item.time_minutes,
          order_index: item.order_index,
          created_by: user.id
        }));

        const { error: insertError } = await supabase
          .from("meeting_series_agenda")
          .insert(itemsToInsert);

        if (insertError) throw insertError;
      }

      // Update existing items
      for (const item of existingItems) {
        const { error } = await supabase
          .from("meeting_series_agenda")
          .update({
            title: item.title,
            notes: item.notes,
            assigned_to: item.assigned_to,
            time_minutes: item.time_minutes,
            order_index: item.order_index
          })
          .eq("id", item.id);

        if (error) throw error;
      }

      state.isEditingAgenda = false;
      state.editingItems = [];
      state.lastSavedAt = Date.now();
      onUpdate();
      
      toast({
        title: "Success",
        description: "Agenda saved successfully",
      });
    } catch (error: unknown) {
      handleError(error);
      throw error;
    } finally {
      state.isSaving = false;
    }
  };

  // Debounced autosave function
  const debouncedSave = useCallback(
    debounce(async () => {
      if (state.isEditingAgenda && validateItems(state.editingItems)) {
        try {
          await saveChanges();
        } catch (error) {
          console.error("Autosave failed:", error);
        }
      }
    }, 2000),
    []
  );

  // Trigger autosave when items change
  useEffect(() => {
    if (state.isEditingAgenda) {
      debouncedSave();
    }
    return () => debouncedSave.cancel();
  }, [state.editingItems, debouncedSave]);

  useImperativeHandle(ref, () => ({
    startEditing: () => {
      actions.updateEditingItems([...items]);
      actions.setEditing(true);
    },
    isEditing: () => state.isEditingAgenda,
    saveChanges,
    cancelEditing: () => {
      actions.updateEditingItems([]);
      actions.setEditing(false);
    },
  }));

  return (
    <AgendaSidebar
      items={items}
      isAdmin={isAdminProp || state.isAdmin}
      isEditingAgenda={state.isEditingAgenda}
      editingItems={state.editingItems}
      actions={actions}
      teamMembers={state.teamMembers}
      systemTemplates={systemTemplates}
      adoptingTemplate={adoptingTemplate}
      adoptSystemTemplate={adoptSystemTemplate}
      startAddingManually={startAddingManually}
      onStartEdit={() => {
        actions.updateEditingItems([...items]);
        actions.setEditing(true);
      }}
      onSaveEdit={async () => {
        try {
          await saveChanges();
        } catch (error) {
          console.error("Error saving changes:", error);
        }
      }}
      onCancelEdit={() => {
        actions.updateEditingItems([]);
        actions.setEditing(false);
      }}
    />
  );
});

MeetingAgenda.displayName = "MeetingAgenda";

export default MeetingAgenda;
