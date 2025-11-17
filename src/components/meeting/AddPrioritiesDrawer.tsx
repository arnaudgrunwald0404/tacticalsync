import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Plus, Save, X } from "lucide-react";
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

const AddPrioritiesDrawer = ({ 
  isOpen, 
  onClose, 
  meetingId, 
  teamId, 
  onSave, 
  existingPriorities = [],
  frequency = "weekly"
}: AddPrioritiesDrawerProps) => {
  const { toast } = useToast();
  const { currentUserId, teamMembers } = useMeetingContext();
  
  // Initialize with 3 empty rows to avoid flash of empty state
  const [priorities, setPriorities] = useState<PriorityRow[]>([
    { id: 'new-1', priority: "", assigned_to: "", activities: "", time_minutes: null },
    { id: 'new-2', priority: "", assigned_to: "", activities: "", time_minutes: null },
    { id: 'new-3', priority: "", assigned_to: "", activities: "", time_minutes: null }
  ]);
  const [saving, setSaving] = useState(false);
  const [newTopic, setNewTopic] = useState({
    title: "",
    assigned_to: "",
    time_minutes: 5,
    notes: ""
  });

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
            time_minutes: null
          }));
          
          // Ensure we have at least 3 rows for consistency
          while (existingPriorityRows.length < 3) {
            existingPriorityRows.push({
              id: `new-${existingPriorityRows.length + 1}`,
              priority: "",
              assigned_to: defaultAssignee,
              activities: "",
              time_minutes: null
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

  const addPriorityRow = () => {
    const newId = `temp-${Date.now()}-${priorities.length + 1}`;
    setPriorities([...priorities, { 
      id: newId, 
      priority: "", 
      assigned_to: currentUserId || "", 
      activities: "", 
      time_minutes: null 
    }]);
  };
  
  // Derive current user object from context data
  const currentUser = teamMembers.find(m => m.user_id === currentUserId) || null;

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

  const updatePriority = (id: string, field: keyof PriorityRow, value: string) => {
    setPriorities(priorities.map(priority => 
      priority.id === id ? { ...priority, [field]: value } : priority
    ));
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
      }
      
      if (totalChanges > 0) {
        toast({
          title: "Priorities updated!",
          description: `${totalChanges} change${totalChanges > 1 ? 's' : ''} saved successfully`,
        });
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
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:w-[75vw] sm:max-w-[75vw] flex flex-col h-full">
        <SheetHeader className="pb-4 flex-none">
          <SheetTitle className="text-xl sm:text-2xl">{`Edit This ${frequency === "monthly" ? "Month's" : frequency === "weekly" ? "Week's" : frequency === "quarter" ? "Quarter's" : "Period's"} Priorities`}</SheetTitle>
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
              <div className="bg-muted/50 px-4 py-2 grid grid-cols-[200px_2fr_2fr_300px_80px] gap-4 text-sm font-medium text-muted-foreground">
                <div>Who</div>
                <div>Desired Outcome</div>
                <div>Supporting Activities</div>
                <div>Link to Strategy</div>
                <div></div>
              </div>
              
              {priorities.length > 0 ? priorities.map((priority) => (
                <div key={priority.id} className="px-4 py-3 border-t grid grid-cols-[200px_2fr_2fr_300px_80px] gap-4 items-start">
                  <PriorityForm
                    priority={priority}
                    teamMembers={teamMembers}
                    currentUser={currentUser}
                    teamId={teamId}
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
          <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} className="text-sm">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addPriorityRow}
              disabled={priorities.length >= 3}
              className="text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              {priorities.length === 0 ? "Add Priority" : "Add Another Priority"}
            </Button>
            </div>
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