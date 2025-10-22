import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, X, Plus, CalendarIcon, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatNameWithInitial } from "@/lib/nameUtils";
import RichTextEditor from "@/components/ui/rich-text-editor";
import CommentsDialog from "./CommentsDialog";
import { ActionItem, ActionItemInsert } from "@/types/action-items";
// import { TeamMember } from "@/types/common";
import { CompletionStatus } from "@/types/priorities";

interface DropdownMember {
  id: string;
  user_id: string;
  profiles?: {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    avatar_url?: string;
    avatar_name?: string;
  };
}

interface MeetingActionItemsProps {
  items: ActionItem[];
  meetingId: string;  // This is actually series_id for action items
  teamId: string;
  onUpdate: () => void;
  hasAgendaItems?: boolean;
}

export interface MeetingActionItemsRef {
  startCreating: () => void;
}

interface SortableActionItemRowProps {
  item: ActionItem;
  onDelete: (id: string) => void;
  onSetCompletion: (status: CompletionStatus) => void;
}

const SortableActionItemRow = ({ item, onDelete, onSetCompletion }: SortableActionItemRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border rounded-lg p-3 bg-white",
        isDragging && "shadow-lg"
      )}
    >
      <div className="grid grid-cols-[auto_auto_2fr_auto_auto_2fr_auto] gap-4 items-center">
        <div {...attributes} {...listeners} className="cursor-grab hover:text-foreground/80">
          <GripVertical className="h-4 w-4" />
        </div>
        <Checkbox
          checked={item.completion_status === 'completed'}
          onCheckedChange={(checked) => onSetCompletion(checked ? 'completed' : 'not_completed')}
        />
        <div className="text-base truncate">{item.title}</div>
        <div className="flex items-center gap-2">
          {item.assigned_to_profile?.avatar_name ? (
            <FancyAvatar 
              name={item.assigned_to_profile.avatar_name} 
              displayName={formatNameWithInitial(
                item.assigned_to_profile.first_name,
                item.assigned_to_profile.last_name,
                item.assigned_to_profile.email
              )}
              size="sm" 
            />
          ) : (
            <Avatar className="h-6 w-6 rounded-full">
              <AvatarImage src={item.assigned_to_profile?.avatar_url} />
              <AvatarFallback className="text-xs">
                {(item.assigned_to_profile?.first_name || item.assigned_to_profile?.email || '?').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="text-base">{item.assigned_to_profile?.first_name || "Unassigned"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-base whitespace-nowrap">
          <CalendarIcon className="h-4 w-4" />
          <span>{item.due_date ? format(new Date(item.due_date), "MM/dd") : "No date"}</span>
        </div>
        <div className="text-base truncate text-muted-foreground">
          {item.notes ? (
            <div dangerouslySetInnerHTML={{ __html: item.notes }} />
          ) : (
            "No notes"
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(item.id)}
          className="text-destructive hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const MeetingActionItems = forwardRef<MeetingActionItemsRef, MeetingActionItemsProps>(({ items, meetingId, teamId, onUpdate, hasAgendaItems = true }, ref) => {
  const { toast } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [members, setMembers] = useState<DropdownMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    title: "",
    assigned_to: null as string | null,
    notes: "",
    due_date: null as Date | null
  });

  useImperativeHandle(ref, () => ({
    startCreating: () => {
      // Focus the title input
      const titleInput = document.getElementById('new-action-item-title');
      if (titleInput) {
        titleInput.focus();
      }
    },
  }));

  const fetchMembers = useCallback(async () => {
    // Fetch team members first
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("id, user_id")
      .eq("team_id", teamId);
    
    if (!teamMembers || teamMembers.length === 0) {
      setMembers([]);
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
    
    setMembers(membersWithProfiles);
  }, [teamId]);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        setNewItem(prev => ({ ...prev, assigned_to: user.id }));
      }
    } catch (error) {
      console.error("Error fetching current user:", error);
      toast({
        title: "Error",
        description: "Failed to fetch current user",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (teamId) {
      fetchMembers();
      fetchCurrentUser();
    }
  }, [teamId, fetchMembers, fetchCurrentUser]);

  const handleAddItem = async () => {
    if (!newItem.title.trim()) return;
    if (!meetingId) {
      toast({
        title: "Error",
        description: "No meeting selected",
        variant: "destructive",
      });
      return;
    }

    // Check if due date is in the past
    if (newItem.due_date && newItem.due_date < new Date()) {
      toast({
        title: "Invalid Due Date",
        description: "Action items cannot be set for a past date",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const actionItemToInsert: ActionItemInsert = {
        series_id: meetingId,
        title: newItem.title.trim(),
        notes: newItem.notes.trim(),
        assigned_to: newItem.assigned_to,
        due_date: newItem.due_date ? format(newItem.due_date, "yyyy-MM-dd") : null,
        completion_status: 'not_completed',
        order_index: items.length,
        created_by: user.id
      };

      const { error } = await supabase
        .from("meeting_series_action_items")
        .insert(actionItemToInsert);

      if (error) {
        console.error("Error adding action item:", error);
        throw error;
      }

      toast({
        title: "Action item added",
        description: "The action item has been added successfully.",
      });

      // Reset form
      setNewItem({
        title: "",
        assigned_to: currentUserId,
        notes: "",
        due_date: null
      });

      onUpdate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add action item",
        variant: "destructive",
      });
    }
  };

  const handleSetCompletion = async (itemId: string, status: CompletionStatus) => {
    const { error } = await supabase
      .from("meeting_series_action_items")
      .update({ completion_status: status })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
      return;
    }

    onUpdate();
  };

  const handleDelete = async (itemId: string) => {
    const { error } = await supabase
      .from("meeting_series_action_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Action item deleted",
      description: "The action item has been removed.",
    });

    onUpdate();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reorderedItems = arrayMove(items, oldIndex, newIndex);

    // Update order_index for all affected items
    try {
      for (let i = 0; i < reorderedItems.length; i++) {
        const item = reorderedItems[i];
        await supabase
          .from("meeting_series_action_items")
          .update({ order_index: i })
          .eq("id", item.id);
      }

      toast({
        title: "Action items reordered",
        description: "The action item order has been updated",
      });

      onUpdate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to update item order",
        variant: "destructive",
      });
    }
  };

  const getDisplayName = (member: DropdownMember) => {
    if (!member.profiles) return "Unknown";
    const firstName = member.profiles.first_name || "";
    const lastName = member.profiles.last_name || "";
    const email = member.profiles.email || "";
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else {
      return email;
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Action Items List */}
        {items.length > 0 && (
          <div className="space-y-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableActionItemRow
                    key={item.id}
                    item={item}
                    onDelete={handleDelete}
                    onSetCompletion={(status) => handleSetCompletion(item.id, status)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}

        {items.length === 0 && (
          <div className="text-center py-2 text-muted-foreground">
            <p className="text-sm">No action items yet.</p>
          </div>
        )}

        {/* Add New Action Item Form */}
        <div className="border-2 border-dashed border-blue-300 bg-background bg-blue-50 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Add Action Item</h4>
            
            {/* Desktop Layout */}
            <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_2fr_40px] gap-3 items-start">
              {/* Title Input */}
              <div>
                <Input
                  id="new-action-item-title"
                  value={newItem.title}
                  onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Action item"
                  className="h-10"
                />
              </div>

              {/* Who Selector */}
              <div>
                <Select 
                  value={newItem.assigned_to || ""} 
                  onValueChange={(value) => setNewItem(prev => ({ ...prev, assigned_to: value }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Who?">
                      {newItem.assigned_to ? (
                        (() => {
                          const member = members.find(m => m.user_id === newItem.assigned_to);
                          if (!member?.profiles) return "Unknown";
                          
                          const displayName = formatNameWithInitial(
                            member.profiles.first_name,
                            member.profiles.last_name,
                            member.profiles.email
                          );
                          
                          return (
                            <div className="flex items-center gap-2">
                              {member.profiles.avatar_name ? (
                                <FancyAvatar 
                                  name={member.profiles.avatar_name} 
                                  displayName={displayName}
                                  size="sm" 
                                />
                              ) : (
                                <Avatar className="h-6 w-6 rounded-full">
                                  <AvatarImage src={member.profiles.avatar_url} />
                                  <AvatarFallback className="text-xs">
                                    {member.profiles.first_name?.[0]?.toUpperCase() || member.profiles.email?.[0]?.toUpperCase() || '?'}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <span className="text-sm truncate">{displayName}</span>
                            </div>
                          );
                        })()
                      ) : (
                        "Who?"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => {
                      const displayName = formatNameWithInitial(
                        member.profiles?.first_name,
                        member.profiles?.last_name,
                        member.profiles?.email
                      );
                      
                      return (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            {member.profiles?.avatar_name ? (
                              <FancyAvatar 
                                name={member.profiles.avatar_name} 
                                displayName={displayName}
                                size="sm" 
                              />
                            ) : (
                              <Avatar className="h-6 w-6 rounded-full">
                                <AvatarImage src={member.profiles?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {(member.profiles?.first_name || member.profiles?.email || '?').charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <span className="truncate">{displayName}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Due Date Picker */}
              <div className="relative">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal h-10",
                        !newItem.due_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newItem.due_date ? format(newItem.due_date, "MM/dd") : <span>Due Date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newItem.due_date || undefined}
                      onSelect={(date) => setNewItem(prev => ({ ...prev, due_date: date }))}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Notes Input */}
              <div>
                <RichTextEditor
                  content={newItem.notes}
                  onChange={(content) => setNewItem(prev => ({ ...prev, notes: content }))}
                  placeholder="Notes..."
                  className="min-h-[100px]"
                />
              </div>

              {/* Add Button */}
              <div>
                <Button
                  onClick={handleAddItem}
                  disabled={!newItem.title.trim()}
                  size="icon"
                  className="h-10 w-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Mobile Layout */}
            <div className="sm:hidden space-y-3">
              <Input
                id="new-action-item-title"
                value={newItem.title}
                onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Action item title"
                className="h-10"
              />
              <div className="grid grid-cols-2 gap-3">
                <Select 
                  value={newItem.assigned_to || ""} 
                  onValueChange={(value) => setNewItem(prev => ({ ...prev, assigned_to: value }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Who?">
                      {newItem.assigned_to ? (
                        (() => {
                          const member = members.find(m => m.user_id === newItem.assigned_to);
                          if (!member?.profiles) return "Unknown";
                          
                          const displayName = formatNameWithInitial(
                            member.profiles.first_name,
                            member.profiles.last_name,
                            member.profiles.email
                          );
                          
                          return (
                            <div className="flex items-center gap-2">
                              {member.profiles.avatar_name ? (
                                <FancyAvatar 
                                  name={member.profiles.avatar_name} 
                                  displayName={displayName}
                                  size="sm" 
                                />
                              ) : (
                                <Avatar className="h-6 w-6 rounded-full">
                                  <AvatarImage src={member.profiles.avatar_url} />
                                  <AvatarFallback className="text-xs">
                                    {member.profiles.first_name?.[0]?.toUpperCase() || member.profiles.email?.[0]?.toUpperCase() || '?'}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <span className="text-sm truncate">{displayName}</span>
                            </div>
                          );
                        })()
                      ) : (
                        "Who?"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => {
                      const displayName = formatNameWithInitial(
                        member.profiles?.first_name,
                        member.profiles?.last_name,
                        member.profiles?.email
                      );
                      
                      return (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            {member.profiles?.avatar_name ? (
                              <FancyAvatar 
                                name={member.profiles.avatar_name} 
                                displayName={displayName}
                                size="sm" 
                              />
                            ) : (
                              <Avatar className="h-6 w-6 rounded-full">
                                <AvatarImage src={member.profiles?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {(member.profiles?.first_name || member.profiles?.email || '?').charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <span className="truncate">{displayName}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal h-10",
                        !newItem.due_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newItem.due_date ? format(newItem.due_date, "MM/dd") : <span>Due Date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newItem.due_date || undefined}
                      onSelect={(date) => setNewItem(prev => ({ ...prev, due_date: date }))}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <RichTextEditor
                content={newItem.notes}
                onChange={(content) => setNewItem(prev => ({ ...prev, notes: content }))}
                placeholder="Notes..."
                className="min-h-[100px]"
              />
              <Button
                onClick={handleAddItem}
                disabled={!newItem.title.trim()}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Action Item
              </Button>
            </div>
          </div>
      </div>

      {selectedItem && (
        <CommentsDialog
          itemId={selectedItem.id}
          itemTitle={selectedItem.title}
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
        />
      )}
    </>
  );
});

MeetingActionItems.displayName = "MeetingActionItems";

export default MeetingActionItems;
