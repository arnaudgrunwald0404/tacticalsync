import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Save, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PriorityForm } from "./PriorityForm";
import { TopicForm } from "./TopicForm";
import { htmlToPlainText } from "@/lib/htmlUtils";
import { 
  PriorityRow,
  AddPrioritiesDrawerProps 
} from "@/types/priorities";
// Team member shape used locally for dropdowns
import { TeamMember } from "@/types/meeting";
import { useMeetingContext } from "@/contexts/MeetingContext";
import { useActiveDOs } from "@/hooks/useActiveDOs";
import { useActiveInitiatives } from "@/hooks/useActiveInitiatives";
import { getWeek, format, startOfWeek, startOfMonth, endOfWeek, endOfMonth, startOfQuarter, endOfQuarter } from "date-fns";
import { getMeetingEndDate } from "@/lib/dateUtils";

const AddPrioritiesDrawer = ({ 
  isOpen, 
  onClose, 
  meetingId, 
  teamId, 
  onSave, 
  existingPriorities = [],
  frequency = "weekly",
  meetingStartDate
}: AddPrioritiesDrawerProps) => {
  const { toast } = useToast();
  const { currentUserId, teamMembers } = useMeetingContext();
  
  // Fetch DOs and SIs once at the parent level to avoid duplicate API calls
  console.log('🔵 AddPrioritiesDrawer - teamId prop:', teamId);
  const { dos: activeDOs } = useActiveDOs();
  const { initiatives: activeSIs, loading: siLoading, error: siError } = useActiveInitiatives(teamId);
  
  // Debug: Log to verify SIs are loading
  useEffect(() => {
    console.log('🔵 AddPrioritiesDrawer - activeDOs:', activeDOs.length);
    console.log('🔵 AddPrioritiesDrawer - activeSIs:', activeSIs.length, activeSIs);
    console.log('🔵 AddPrioritiesDrawer - siLoading:', siLoading);
    console.log('🔵 AddPrioritiesDrawer - siError:', siError);
  }, [activeDOs, activeSIs, siLoading, siError]);
  
  // Initialize with 3 empty rows to avoid flash of empty state
  const [priorities, setPriorities] = useState<PriorityRow[]>([
    { id: 'new-1', priority: "", assigned_to: "", activities: "", time_minutes: null, pendingLink: null },
    { id: 'new-2', priority: "", assigned_to: "", activities: "", time_minutes: null, pendingLink: null },
    { id: 'new-3', priority: "", assigned_to: "", activities: "", time_minutes: null, pendingLink: null }
  ]);
  const [saving, setSaving] = useState(false);
  const [newTopic, setNewTopic] = useState({
    title: "",
    assigned_to: "",
    time_minutes: 5,
    notes: ""
  });

  // Fetch existing links for priorities
  useEffect(() => {
    const fetchPriorityLinks = async () => {
      if (!isOpen || existingPriorities.length === 0) return;

      try {
        // Fetch all links for existing priorities
        const priorityIds = existingPriorities.map(p => p.id);
        const { data: links, error } = await supabase
          .from('rc_links')
          .select('*')
          .eq('kind', 'meeting_priority')
          .in('ref_id', priorityIds);

        if (error) {
          console.error('Error fetching priority links:', error);
          return;
        }

        // Create a map of priority ID to link
        const linkMap = new Map<string, { type: 'do' | 'initiative'; id: string }>();
        links?.forEach(link => {
          linkMap.set(link.ref_id, {
            type: link.parent_type as 'do' | 'initiative',
            id: link.parent_id
          });
        });

        // Update priorities with their links
        setPriorities(prevPriorities => {
          return prevPriorities.map(priority => {
            // Only update if this is an existing priority (not a temp ID)
            if (!priority.id.startsWith('new-') && !priority.id.startsWith('temp-')) {
              const link = linkMap.get(priority.id);
              if (link) {
                return {
                  ...priority,
                  pendingLink: link
                };
              }
            }
            return priority;
          });
        });
      } catch (err) {
        console.error('Error in fetchPriorityLinks:', err);
      }
    };

    fetchPriorityLinks();
  }, [isOpen, existingPriorities]);

  // Load from local storage when drawer opens
  useEffect(() => {
    if (!isOpen || !meetingId) return;

    try {
      const storageKey = `priority-links-${meetingId}`;
      const storedLinks = localStorage.getItem(storageKey);
      if (storedLinks) {
        const links = JSON.parse(storedLinks);
        setPriorities(prevPriorities => {
          return prevPriorities.map(priority => {
            // Only apply local storage links to temp/new priorities
            if (priority.id.startsWith('new-') || priority.id.startsWith('temp-')) {
              const storedLink = links[priority.id];
              if (storedLink && !priority.pendingLink) {
                return {
                  ...priority,
                  pendingLink: storedLink
                };
              }
            }
            return priority;
          });
        });
      }
    } catch (err) {
      console.error('Error loading from local storage:', err);
    }
  }, [isOpen, meetingId]);

  // Initialize priorities when drawer opens AND current user is available
  useEffect(() => {
    console.log('Priority init useEffect triggered:', { isOpen, currentUserId: !!currentUserId, existingPrioritiesLength: existingPriorities.length });
    if (isOpen && currentUserId) {
      console.log('Initializing priorities with currentUserId:', currentUserId);
      const defaultAssignee = currentUserId;
      
      // Always update all empty assigned_to fields with current user
      setPriorities(prevPriorities => {
        console.log('prevPriorities:', prevPriorities);
        // If we have existing priorities from the database, use those
        if (existingPriorities.length > 0) {
          const existingPriorityRows = existingPriorities.map((priority) => ({
            id: priority.id,
            priority: htmlToPlainText(priority.outcome || ""),
            assigned_to: priority.assigned_to || defaultAssignee,
            activities: priority.activities || "",
            time_minutes: null,
            pendingLink: null // Will be populated by fetchPriorityLinks effect
          }));
          
          // Ensure we have at least 3 rows for consistency
          while (existingPriorityRows.length < 3) {
            existingPriorityRows.push({
              id: `new-${existingPriorityRows.length + 1}`,
              priority: "",
              assigned_to: defaultAssignee,
              activities: "",
              time_minutes: null,
              pendingLink: null
            });
          }
          
          console.log('Returning existing priority rows:', existingPriorityRows);
          return existingPriorityRows;
        } else {
          // Update the initial 3 rows with the current user as assignee
          const updatedRows = prevPriorities.map(priority => ({
            ...priority,
            assigned_to: priority.assigned_to || defaultAssignee
          }));
          console.log('Returning updated rows:', updatedRows);
          return updatedRows;
        }
      });
    }
  }, [isOpen, currentUserId, existingPriorities]);

  // Derive current user object from context data
  const currentUser = teamMembers.find(m => m.user_id === currentUserId) || null;

  // Format the title with week/month number and date range
  const getPrioritiesTitle = (): string => {
    if (!meetingStartDate) {
      // Fallback to old format if no date available
      return `Edit This ${frequency === "monthly" ? "Month's" : frequency === "weekly" ? "Week's" : frequency === "quarter" ? "Quarter's" : "Period's"} Priorities`;
    }

    try {
      // Parse the meeting start date
      const [year, month, day] = meetingStartDate.split('-').map(Number);
      const startDate = new Date(year, month - 1, day);
      
      let periodType: string;
      let periodNumber: string;
      let actualStartDate: Date;
      let endDate: Date;

      switch (frequency) {
        case 'weekly':
          actualStartDate = startOfWeek(startDate, { weekStartsOn: 1 });
          endDate = getMeetingEndDate('weekly', actualStartDate);
          periodType = 'week';
          periodNumber = getWeek(actualStartDate).toString();
          break;
        
        case 'bi-weekly':
          actualStartDate = startOfWeek(startDate, { weekStartsOn: 1 });
          endDate = getMeetingEndDate('bi-weekly', actualStartDate);
          periodType = 'bi-week';
          periodNumber = getWeek(actualStartDate).toString();
          break;
        
        case 'monthly':
          actualStartDate = startOfMonth(startDate);
          endDate = getMeetingEndDate('monthly', actualStartDate);
          periodType = 'month';
          periodNumber = format(actualStartDate, 'MMM yyyy');
          break;
        
        case 'quarter':
          actualStartDate = startOfQuarter(startDate);
          endDate = getMeetingEndDate('quarterly', actualStartDate);
          periodType = 'quarter';
          const quarter = Math.floor((startDate.getMonth() + 3) / 3);
          periodNumber = `Q${quarter}`;
          break;
        
        default:
          actualStartDate = startOfWeek(startDate, { weekStartsOn: 1 });
          endDate = getMeetingEndDate('weekly', actualStartDate);
          periodType = 'week';
          periodNumber = getWeek(actualStartDate).toString();
      }

      const dateRange = `${format(actualStartDate, 'M/d')} - ${format(endDate, 'M/d')}`;
      
      // Format: "Priorities this week 47 (11/17 - 11/23)"
      if (periodType === 'month') {
        return `Priorities this ${periodType} ${periodNumber} (${dateRange})`;
      }
      
      return `Priorities this ${periodType} ${periodNumber} (${dateRange})`;
    } catch (error) {
      console.error('Error formatting priorities title:', error);
      // Fallback to old format on error
      return `Edit This ${frequency === "monthly" ? "Month's" : frequency === "weekly" ? "Week's" : frequency === "quarter" ? "Quarter's" : "Period's"} Priorities`;
    }
  };

  const removePriorityRow = (id: string) => {
    // Always keep at least 3 rows
    if (priorities.length <= 3) {
      return;
    }
    setPriorities(priorities.filter(priority => priority.id !== id));
  };

  // Check if all priorities have been used (have content)
  const allPrioritiesUsed = () => {
    return priorities.every(priority => priority.priority.trim() !== "");
  };

  const updatePriority = (id: string, field: keyof PriorityRow, value: string | null) => {
    setPriorities(priorities.map(priority => {
      if (priority.id === id) {
        if (field === 'pendingLink') {
          // Handle pendingLink specially - it can be a JSON string or null
          if (!value || value === '') {
            return { ...priority, pendingLink: null };
          }
          try {
            const parsed = JSON.parse(value);
            return { ...priority, pendingLink: parsed };
          } catch {
            return { ...priority, pendingLink: null };
          }
        }
        return { ...priority, [field]: value };
      }
      return priority;
    }));
  };

  const handleAddTopic = async () => {
    if (!newTopic.title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic title",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("meeting_instance_topics")
        .insert({
          instance_id: meetingId,
          title: newTopic.title,
          assigned_to: newTopic.assigned_to || null,
          time_minutes: newTopic.time_minutes,
          notes: newTopic.notes || null,
          order_index: 0,
          created_by: user.id,
        });

      if (error) throw error;

      toast({
        title: "Topic added!",
        description: "The team topic has been added to the meeting",
      });

      // Reset form
      setNewTopic({
        title: "",
        assigned_to: "",
        time_minutes: 5,
        notes: ""
      });

      onSave();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add topic",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Only save priorities that have content
      const filledPriorities = priorities.filter(p => p.priority.trim());
      console.log('Priorities to save:', filledPriorities);

      // Separate existing priorities (with real IDs) from new ones (with temp IDs)
      const currentExistingPriorities = filledPriorities.filter(p => !p.id.startsWith('temp-') && !p.id.startsWith('new-'));
      const newPriorities = filledPriorities.filter(p => p.id.startsWith('temp-') || p.id.startsWith('new-'));

      // Find deleted priorities (original existing priorities that are no longer in the current list)
      const currentExistingIds = currentExistingPriorities.map(p => p.id);
      const deletedPriorities = existingPriorities.filter(p => !currentExistingIds.includes(p.id));

      let totalChanges = 0;

      // Delete removed priorities
      for (const priority of deletedPriorities) {
        const { error } = await supabase
          .from("meeting_instance_priorities")
          .delete()
          .eq("id", priority.id);

        if (error) {
          console.error('Delete error for priority', priority.id, ':', error);
          throw error;
        }
        totalChanges++;
      }

      // Update existing priorities
      for (const priority of currentExistingPriorities) {
        const { error } = await supabase
          .from("meeting_instance_priorities")
          .update({
            title: priority.priority,
            outcome: priority.priority,
            activities: priority.activities || "",
            assigned_to: priority.assigned_to || null,
          })
          .eq("id", priority.id);

        if (error) {
          console.error('Update error for priority', priority.id, ':', error);
          throw error;
        }
        totalChanges++;
      }

      // Insert new priorities
      if (newPriorities.length > 0) {
        const prioritiesToInsert = newPriorities.map((priority, index) => ({
          instance_id: meetingId,
          title: priority.priority,
          outcome: priority.priority,
          activities: priority.activities || "",
          assigned_to: priority.assigned_to || null,
          completion_status: 'pending' as const,
          order_index: currentExistingPriorities.length + index,
          created_by: user.id
        }));

        console.log('Inserting priorities with meetingId:', meetingId);
        console.log('Priorities to insert:', prioritiesToInsert);

        const { data: insertedData, error } = await supabase
          .from("meeting_instance_priorities")
          .insert(prioritiesToInsert)
          .select();
        
        if (error) {
          console.error('Insert error:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          throw error;
        }
        
        console.log('Successfully inserted priorities:', insertedData);
        totalChanges += insertedData.length;
        
        // Create links for newly inserted priorities that have pending links
        if (insertedData && insertedData.length > 0) {
          for (let i = 0; i < newPriorities.length; i++) {
            const newPriority = newPriorities[i];
            const insertedPriority = insertedData[i];
            
            if (newPriority.pendingLink && insertedPriority) {
              try {
                // Check if link already exists before creating
                const { data: existingLink } = await supabase
                  .from('rc_links')
                  .select('id')
                  .eq('parent_type', newPriority.pendingLink.type === 'do' ? 'do' : 'initiative')
                  .eq('parent_id', newPriority.pendingLink.id)
                  .eq('kind', 'meeting_priority')
                  .eq('ref_id', insertedPriority.id)
                  .maybeSingle();

                if (existingLink) {
                  // Link already exists, skip creation
                  continue;
                }

                if (newPriority.pendingLink.type === 'do') {
                  const { error: linkError } = await supabase
                    .from('rc_links')
                    .insert({
                      parent_type: 'do',
                      parent_id: newPriority.pendingLink.id,
                      kind: 'meeting_priority',
                      ref_id: insertedPriority.id,
                      created_by: user.id
                    });
                  
                  if (linkError) {
                    // Ignore duplicate key errors
                    if (linkError.code !== '23505' && !linkError.message?.includes('duplicate key')) {
                      console.error('Error creating DO link:', linkError);
                    }
                  }
                } else if (newPriority.pendingLink.type === 'initiative') {
                  const { error: linkError } = await supabase
                    .from('rc_links')
                    .insert({
                      parent_type: 'initiative',
                      parent_id: newPriority.pendingLink.id,
                      kind: 'meeting_priority',
                      ref_id: insertedPriority.id,
                      created_by: user.id
                    });
                  
                  if (linkError) {
                    // Ignore duplicate key errors
                    if (linkError.code !== '23505' && !linkError.message?.includes('duplicate key')) {
                      console.error('Error creating Initiative link:', linkError);
                    }
                  }
                }
              } catch (linkErr: any) {
                // Ignore duplicate key errors
                if (linkErr?.code !== '23505' && !linkErr?.message?.includes('duplicate key')) {
                  console.error('Error creating link for priority:', linkErr);
                }
                // Don't throw - link creation failure shouldn't block priority save
              }
            }
          }
        }
      }
      
      if (totalChanges > 0) {
        toast({
          title: "Priorities updated!",
          description: `${totalChanges} change${totalChanges > 1 ? 's' : ''} saved successfully`,
        });
      }

      // Clear local storage after successful save
      if (meetingId) {
        try {
          const storageKey = `priority-links-${meetingId}`;
          localStorage.removeItem(storageKey);
        } catch (err) {
          console.error('Error clearing local storage:', err);
        }
      }

      await onSave();
      // Small delay to ensure state updates propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      onClose();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save priorities";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet 
      open={isOpen} 
      onOpenChange={(open) => {
        // Only close if explicitly set to false, not on any change
        // This prevents the drawer from closing when Select dropdown opens/closes
        if (!open && isOpen) {
          onClose();
        }
      }}
    >
      <SheetContent className="w-full sm:w-[75vw] sm:max-w-[75vw] flex flex-col h-full">
        <SheetHeader className="pb-4 flex-none">
          <SheetTitle className="text-xl sm:text-2xl">{getPrioritiesTitle()}</SheetTitle>
          <SheetDescription className="text-sm sm:text-base">
            Edit your priorities for the current period. Start with three, add more if needed.
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto min-h-0 pr-6">
          <div className="space-y-4">
            {/* Debug info */}
            <div className="text-xs text-muted-foreground">Priorities count: {priorities.length}</div>
            
            {/* Desktop Table View */}
            <div className="hidden sm:block border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 grid grid-cols-[60px_2fr_2fr_120px_80px] gap-4 text-sm font-medium text-muted-foreground">
                <div>Who</div>
                <div>Desired Outcome</div>
                <div>Supporting Activities</div>
                <div>Link to Strategy</div>
                <div></div>
              </div>
              
              {priorities.length > 0 ? priorities.map((priority) => (
                <div key={priority.id} className="px-4 py-3 border-t grid grid-cols-[60px_2fr_2fr_120px_80px] gap-4 items-start">
                  <PriorityForm
                    priority={priority}
                    teamMembers={teamMembers}
                    currentUser={currentUser}
                    teamId={teamId}
                    meetingId={meetingId}
                    activeDOs={activeDOs}
                    activeSIs={activeSIs}
                    onUpdate={updatePriority}
                    onRemove={() => removePriorityRow(priority.id)}
                    showRemove={priorities.length > 3}
                  />
              </div>
            )) : <div className="p-4 text-muted-foreground">No priorities in array</div>}
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-3">
              {priorities.map((priority) => (
                <div key={priority.id} className="border rounded-lg p-4 space-y-3 bg-white">
                  <PriorityForm
                    priority={priority}
                    teamMembers={teamMembers}
                    currentUser={currentUser}
                    teamId={teamId}
                    meetingId={meetingId}
                    activeDOs={activeDOs}
                    activeSIs={activeSIs}
                    onUpdate={updatePriority}
                    onRemove={() => removePriorityRow(priority.id)}
                    showRemove={priorities.length > 3}
                  />
                </div>
              ))}
            </div>
          </div>
          </div>
          
        {/* Fixed Footer */}
        <div className="flex-none mt-6 pt-6 border-t">
          <div className="flex items-center justify-end gap-2 mb-6">
            <Button variant="outline" onClick={onClose} className="text-sm">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="text-sm">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : existingPriorities.length > 0 ? "Save Changes" : `Save ${priorities.filter(t => t.priority.trim()).length} ${priorities.filter(t => t.priority.trim()).length === 1 ? 'Priority' : 'Priorities'}`}
            </Button>
          </div>
          
          {/* Topic Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Thinking of a Topic?</h3>
            <div className="border-2 border-dashed border-blue-300 bg-background bg-blue-50 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Add Topic</h4>
              
              {/* Desktop Layout */}
              <div className="hidden sm:block">
                <TopicForm
                  topic={newTopic}
                  teamMembers={teamMembers}
                  onUpdate={(updates) => setNewTopic(prev => ({ ...prev, ...updates }))}
                  onSubmit={handleAddTopic}
                  isDesktop={true}
                />
              </div>

              {/* Mobile Layout */}
              <div className="sm:hidden">
                <TopicForm
                  topic={newTopic}
                  teamMembers={teamMembers}
                  onUpdate={(updates) => setNewTopic(prev => ({ ...prev, ...updates }))}
                  onSubmit={handleAddTopic}
                  isDesktop={false}
                />
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddPrioritiesDrawer;