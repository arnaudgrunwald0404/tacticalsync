import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, X, Plus, CalendarIcon, GripVertical, Pencil, Check, Trash } from "lucide-react";
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
import { formatMemberNames, getFullNameForAvatar } from "@/lib/nameUtils";
import RichTextEditor from "@/components/ui/rich-text-editor";
import CommentsDialog from "./CommentsDialog";
import { ActionItem, ActionItemInsert } from "@/types/action-items";
// import { TeamMember } from "@/types/common";
import { CompletionStatus } from "@/types/priorities";
import { useMeetingContext } from "@/contexts/MeetingContext";

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
  members: DropdownMember[];
  memberNames: Map<string, string>;
  onDelete: (id: string) => void;
  onSetCompletion: (status: CompletionStatus) => void;
  onRefresh: () => void;
  canModify: boolean;
}

const SortableActionItemRow = ({ item, members, memberNames, onDelete, onSetCompletion, onRefresh, canModify }: SortableActionItemRowProps) => {
  const assignedMember = members.find(m => m.user_id === item.assigned_to);
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

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState({
    title: item.title || "",
    assigned_to: item.assigned_to || null as string | null,
    due_date: item.due_date ? new Date(item.due_date) : null as Date | null,
    notes: item.notes || "",
  });

  useEffect(() => {
    setEditValues({
      title: item.title || "",
      assigned_to: item.assigned_to || null,
      due_date: item.due_date ? new Date(item.due_date) : null,
      notes: item.notes || "",
    });
  }, [item]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("meeting_series_action_items")
        .update({
          title: editValues.title.trim(),
          assigned_to: editValues.assigned_to,
          due_date: editValues.due_date ? format(editValues.due_date, "yyyy-MM-dd") : null,
          notes: editValues.notes || null,
        })
        .eq("id", item.id);
      if (error) throw error;
      setIsEditing(false);
      onRefresh();
    } catch (e) {
      // toast handled in parent generally
    } finally {
      setSaving(false);
    }
  };

  const handleExit = () => {
    setEditValues({
      title: item.title || "",
      assigned_to: item.assigned_to || null,
      due_date: item.due_date ? new Date(item.due_date) : null,
      notes: item.notes || "",
    });
    setIsEditing(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleExit();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-blue-200/50 px-3 py-1 bg-white group",
        isDragging && "shadow-lg"
      )}
    >
      <div className="grid grid-cols-24 gap-4 items-center" onKeyDown={onKeyDown}>
        <div {...attributes} {...listeners} className="col-span-1 cursor-grab hover:text-foreground/80">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="col-span-1">
          <Checkbox
            checked={item.completion_status === 'completed'}
            onCheckedChange={(checked) => canModify ? onSetCompletion(checked ? 'completed' : 'not_completed') : undefined}
            disabled={!canModify}
          />
        </div>
        {isEditing ? (
          <>
            <div className="col-span-9">
              <Input
                autoFocus
                aria-label="Edit action item title"
                value={editValues.title}
                onChange={(e) => setEditValues(v => ({ ...v, title: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="col-span-3">
              <Select
                value={editValues.assigned_to || ""}
                onValueChange={(value) => setEditValues(v => ({ ...v, assigned_to: value }))}
              >
                <SelectTrigger className="h-9" aria-label="Edit assignee">
                  <SelectValue placeholder="Who?" />
                </SelectTrigger>
                <SelectContent>
                  {/* options supplied by parent list, but not available here, so we keep basic UI */}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !editValues.due_date && "text-muted-foreground"
                    )}
                    aria-label="Edit due date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editValues.due_date ? format(editValues.due_date, "MM/dd") : <span>Due Date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editValues.due_date || undefined}
                    onSelect={(date) => setEditValues(v => ({ ...v, due_date: date }))}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="col-span-6">
              <RichTextEditor
                content={editValues.notes}
                onChange={(content) => setEditValues(v => ({ ...v, notes: content }))}
                placeholder="Notes..."
              />
            </div>
            <div className="col-span-1 flex flex-col justify-center items-end gap-0.5">
              <Button aria-label="Save" size="icon" variant="ghost" onClick={handleSave} disabled={saving} className="h-7 w-7 p-0">
                <Check className="h-4 w-4" />
              </Button>
              <Button aria-label="Exit edit" size="icon" variant="ghost" onClick={() => handleExit()} className="h-7 w-7 p-0">
                <X className="h-4 w-4" />
              </Button>
              <Button aria-label="Delete" size="icon" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(item.id)}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={cn("col-span-9 text-base truncate", item.completion_status === 'completed' && "line-through text-muted-foreground")}>{item.title}</div>
            <div className="col-span-3 flex items-center gap-2 min-w-0">
              {item.assigned_to && assignedMember?.profiles ? (
                <>
                {assignedMember.profiles.avatar_name ? (
                  <FancyAvatar 
                    name={assignedMember.profiles.avatar_name} 
                    displayName={getFullNameForAvatar(assignedMember.profiles.first_name, assignedMember.profiles.last_name, assignedMember.profiles.email)}
                    size="sm" 
                  />
                ) : (
                  <Avatar className="h-6 w-6 rounded-full">
                    <AvatarImage src={assignedMember.profiles.avatar_url} />
                    <AvatarFallback className="text-xs">
                      {assignedMember.profiles.first_name?.[0]?.toUpperCase() || assignedMember.profiles.email?.[0]?.toUpperCase() || ''}{assignedMember.profiles.last_name?.[0]?.toUpperCase() || ''}
                    </AvatarFallback>
                  </Avatar>
                )}
                <span className="text-base truncate min-w-0">
                  {memberNames.get(item.assigned_to) || 'Unknown'}
                </span>
                </>
              ) : null}
            </div>
            <div className="col-span-3 flex items-center gap-1.5 text-base whitespace-nowrap">
              <CalendarIcon className="h-4 w-4" />
              <span>{item.due_date ? format(new Date(item.due_date), "MM/dd") : "No date"}</span>
            </div>
            <div className="col-span-6 text-base truncate text-muted-foreground">
              {item.notes ? (
                <div dangerouslySetInnerHTML={{ __html: item.notes }} />
              ) : (
                "No notes"
              )}
            </div>
            <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              <Button aria-label="Edit action item" variant="ghost" size="icon" className="h-7 w-7 p-0" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const MeetingActionItems = forwardRef<MeetingActionItemsRef, MeetingActionItemsProps>(({ items, meetingId, teamId, onUpdate, hasAgendaItems = true }, ref) => {
  const { toast } = useToast();
  const { currentUserId, isSuperAdmin, isTeamAdmin, teamMembers: members, memberNames } = useMeetingContext();
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [newItem, setNewItem] = useState({
    title: "",
    assigned_to: currentUserId || null as string | null,
    notes: "",
    due_date: null as Date | null
  });

  // Update newItem.assigned_to when currentUserId changes
  useEffect(() => {
    if (currentUserId && !newItem.assigned_to) {
      setNewItem(prev => ({ ...prev, assigned_to: currentUserId }));
    }
  }, [currentUserId]);

  useImperativeHandle(ref, () => ({
    startCreating: () => {
      // Focus the title input
      const titleInput = document.getElementById('new-action-item-title');
      if (titleInput) {
        titleInput.focus();
      }
    },
  }));

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

      // Use .select() to get the created item back - avoids unnecessary refetch
      const { data, error } = await supabase
        .from("meeting_series_action_items")
        .insert(actionItemToInsert)
        .select()
        .single();

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

      // Optimistically update local state instead of refetching everything
      // Only call onUpdate() which will refetch just this component's data
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
    const item = items.find(i => i.id === itemId);
    const isOwner = item && (item.assigned_to === currentUserId || item.created_by === currentUserId);
    const canModify = isSuperAdmin || isTeamAdmin || !!isOwner;
    if (!canModify) return;
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
    } else if (email) {
      // Extract the part before @ in email address
      return email.split('@')[0];
    }
    return "Unknown";
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
                    members={members}
                    memberNames={memberNames}
                    onDelete={handleDelete}
                    canModify={isSuperAdmin || isTeamAdmin || item.assigned_to === currentUserId || item.created_by === currentUserId}
                    onSetCompletion={(status) => handleSetCompletion(item.id, status)}
                    onRefresh={onUpdate}
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
            <div className="hidden sm:grid sm:grid-cols-24 gap-3 items-start">
              {/* Title Input */}
              <div className="col-span-8">
                <Input
                  id="new-action-item-title"
                  value={newItem.title}
                  onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Action item"
                  className="h-10"
                />
              </div>

              {/* Who Selector */}
              <div className="col-span-4">
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
                          
                          const displayName = memberNames.get(newItem.assigned_to) || 'Unknown';
                          
                          return (
                            <div className="flex items-center gap-2">
                              {member.profiles.avatar_name ? (
                                <FancyAvatar 
                                  name={member.profiles.avatar_name} 
                                  displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                                  size="sm" 
                                />
                              ) : (
                                <Avatar className="h-6 w-6 rounded-full">
                                  <AvatarImage src={member.profiles.avatar_url} />
                                  <AvatarFallback className="text-xs">
                                    {member.profiles.first_name?.[0]?.toUpperCase() || member.profiles.email?.[0]?.toUpperCase() || ''}{member.profiles.last_name?.[0]?.toUpperCase() || ''}
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
                      const displayName = memberNames.get(member.user_id) || 'Unknown';
                      
                      return (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            {member.profiles?.avatar_name ? (
                              <FancyAvatar 
                                name={member.profiles.avatar_name} 
                                displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                                size="sm" 
                              />
                            ) : (
                              <Avatar className="h-6 w-6 rounded-full">
                                <AvatarImage src={member.profiles?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {member.profiles?.first_name?.[0]?.toUpperCase() || member.profiles?.email?.[0]?.toUpperCase() || ''}{member.profiles?.last_name?.[0]?.toUpperCase() || ''}
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
              <div className="col-span-4 relative">
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
              <div className="col-span-6">
                <RichTextEditor
                  content={newItem.notes}
                  onChange={(content) => setNewItem(prev => ({ ...prev, notes: content }))}
                  placeholder="Notes..."
                />
              </div>

              {/* Add Button */}
              <div className="col-span-2">
                <Button
                  onClick={handleAddItem}
                  disabled={!newItem.title.trim()}
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Add Action Item"
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
                          
                          const displayName = memberNames.get(newItem.assigned_to) || 'Unknown';
                          
                          return (
                            <div className="flex items-center gap-2">
                              {member.profiles.avatar_name ? (
                                <FancyAvatar 
                                  name={member.profiles.avatar_name} 
                                  displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                                  size="sm" 
                                />
                              ) : (
                                <Avatar className="h-6 w-6 rounded-full">
                                  <AvatarImage src={member.profiles.avatar_url} />
                                  <AvatarFallback className="text-xs">
                                    {member.profiles.first_name?.[0]?.toUpperCase() || member.profiles.email?.[0]?.toUpperCase() || ''}{member.profiles.last_name?.[0]?.toUpperCase() || ''}
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
                      const displayName = memberNames.get(member.user_id) || 'Unknown';
                      
                      return (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            {member.profiles?.avatar_name ? (
                              <FancyAvatar 
                                name={member.profiles.avatar_name} 
                                displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                                size="sm" 
                              />
                            ) : (
                              <Avatar className="h-6 w-6 rounded-full">
                                <AvatarImage src={member.profiles?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {member.profiles?.first_name?.[0]?.toUpperCase() || member.profiles?.email?.[0]?.toUpperCase() || ''}{member.profiles?.last_name?.[0]?.toUpperCase() || ''}
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
