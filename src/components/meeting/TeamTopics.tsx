import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, Clock, X, GripVertical, Pencil, Trash } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Arrow } from "@radix-ui/react-tooltip";
import { formatMemberNames, getFullNameForAvatar } from "@/lib/nameUtils";
import { cn } from "@/lib/utils";
import { Topic } from "@/types/topics";
import { CompletionStatus } from "@/types/priorities";
import { useMeetingContext } from "@/contexts/MeetingContext";
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

interface TeamTopicsProps {
  items: Topic[];
  meetingId: string;
  teamId: string;
  teamName: string;
  onUpdate: () => void;
}

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

interface SortableTopicRowProps {
  item: TeamTopicsProps['items'][0];
  members: DropdownMember[];
  memberNames: Map<string, string>;
  onToggleComplete: (checked: boolean) => void;
  canModify: boolean;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  isLast: boolean;
}

const SortableTopicRow = ({ item, members, memberNames, onToggleComplete, onDelete, onRefresh, canModify, isLast }: SortableTopicRowProps) => {
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
    assigned_to: item.assigned_to || "",
    time_minutes: item.time_minutes || 5,
    notes: item.notes || "",
  });

  useEffect(() => {
    setEditValues({
      title: item.title || "",
      assigned_to: item.assigned_to || "",
      time_minutes: item.time_minutes || 5,
      notes: item.notes || "",
    });
  }, [item]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("meeting_instance_topics")
        .update({
          title: editValues.title.trim(),
          assigned_to: editValues.assigned_to || null,
          time_minutes: Number(editValues.time_minutes) || 5,
          notes: editValues.notes || null,
        })
        .eq("id", item.id);
      if (error) throw error;
      setIsEditing(false);
      onRefresh();
    } catch (e) {
      // handled at parent via onUpdate toast patterns typically
    } finally {
      setSaving(false);
    }
  };

  const handleExit = () => {
    setEditValues({
      title: item.title || "",
      assigned_to: item.assigned_to || "",
      time_minutes: item.time_minutes || 5,
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

  const assignedMember = members.find(m => m.user_id === item.assigned_to);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "px-3 py-1 bg-white group",
        !isLast && "border-b border-blue-200/50",
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
            onCheckedChange={(checked) => canModify ? onToggleComplete(checked === true) : undefined}
            disabled={!canModify}
          />
        </div>
        {isEditing ? (
          <>
            <div className="col-span-9">
              <Input
                autoFocus
                aria-label="Edit topic title"
                value={editValues.title}
                onChange={(e) => setEditValues(v => ({ ...v, title: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="col-span-3">
              <Select
                value={editValues.assigned_to}
                onValueChange={(value) => setEditValues(v => ({ ...v, assigned_to: value }))}
              >
                <SelectTrigger className="h-9" aria-label="Edit assignee">
                  <SelectValue placeholder="Who?" />
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
            <div className="col-span-3 relative">
              <Input
                type="number"
                aria-label="Edit duration in minutes"
                value={editValues.time_minutes}
                onChange={(e) => setEditValues(v => ({ ...v, time_minutes: parseInt(e.target.value) || 5 }))}
                className="h-9 pr-10"
                min="1"
                max="60"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">min</span>
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
              <Button aria-label="Exit edit" size="icon" variant="ghost" onClick={handleExit} className="h-7 w-7 p-0">
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
              {item.assigned_to && assignedMember ? (
                <>
                  {assignedMember.profiles?.avatar_name ? (
                    <FancyAvatar 
                      name={assignedMember.profiles.avatar_name} 
                      displayName={getFullNameForAvatar(assignedMember.profiles.first_name, assignedMember.profiles.last_name, assignedMember.profiles.email)}
                      size="sm" 
                    />
                  ) : (
                    <Avatar className="h-6 w-6 rounded-full">
                      <AvatarImage src={assignedMember.profiles?.avatar_url} />
                      <AvatarFallback className="text-xs">
                        {assignedMember.profiles?.first_name?.[0]?.toUpperCase() || assignedMember.profiles?.email?.[0]?.toUpperCase() || ''}{assignedMember.profiles?.last_name?.[0]?.toUpperCase() || ''}
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
              <Clock className="h-4 w-4" />
              <span>{item.time_minutes} min</span>
            </div>
            <div className="col-span-6 text-base truncate text-muted-foreground">
              {item.notes ? (
                <div dangerouslySetInnerHTML={{ __html: item.notes }} />
              ) : (
                "No notes"
              )}
            </div>
            <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                aria-label="Edit topic"
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const TeamTopics = ({ items, meetingId, teamId, teamName, onUpdate }: TeamTopicsProps) => {
  const { toast } = useToast();
  const { currentUserId, isSuperAdmin, isTeamAdmin, teamMembers: members, memberNames } = useMeetingContext();
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const [newTopic, setNewTopic] = useState({
    title: "",
    assigned_to: currentUserId || null as string | null,
    time_minutes: 5,
    notes: ""
  });
  const [adding, setAdding] = useState(false);

  // Update newTopic.assigned_to when currentUserId changes
  useEffect(() => {
    if (currentUserId && !newTopic.assigned_to) {
      setNewTopic(prev => ({ ...prev, assigned_to: currentUserId }));
    }
  }, [currentUserId]);

  const handleAdd = async () => {
    if (!newTopic.title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic title",
        variant: "destructive",
      });
      return;
    }

    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("meeting_instance_topics")
        .insert({
          instance_id: meetingId,
          title: newTopic.title,
          assigned_to: newTopic.assigned_to || null,
          time_minutes: newTopic.time_minutes,
          notes: newTopic.notes || null,
          order_index: items.length,
          created_by: user.id,
        })
        .select();

      if (error) {
        console.error("Error adding topic:", error);
        throw error;
      }

      console.log("Topic added successfully:", data);

      toast({
        title: "Topic added!",
        description: "The team topic has been added to the meeting",
      });

      // Reset form but keep the current user assigned
      setNewTopic({
        title: "",
        assigned_to: currentUserId,
        time_minutes: 5,
        notes: ""
      });

      // Wait a moment to ensure the database transaction is complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await onUpdate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add topic",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    const { error } = await supabase
      .from("meeting_instance_topics")
      .delete()
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete topic",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Topic deleted",
      description: "The team topic has been removed",
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
    const updates = reorderedItems.map((item, index) => ({
      id: item.id,
      order_index: index
    }));

    // Update each item individually
    for (const update of updates) {
      const { error } = await supabase
        .from("meeting_instance_topics")
        .update({ order_index: update.order_index })
        .eq("id", update.id);
      
      if (error) {
        throw error;
      }
    }

    onUpdate();
  };

  const getDisplayName = (member: DropdownMember) => {
    const firstName = member.profiles?.first_name || "";
    const lastName = member.profiles?.last_name || "";
    const email = member.profiles?.email || "";
    
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
      {/* Existing Topics */}
      {items.length > 0 && (
        <div className="space-y-2 mb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item, index) => (
                <SortableTopicRow
                  key={item.id}
                  item={item}
                  members={members}
                  memberNames={memberNames}
                  canModify={isSuperAdmin || isTeamAdmin || item.assigned_to === currentUserId || item.created_by === currentUserId}
                  onToggleComplete={async (checked) => {
                    const canModify = isSuperAdmin || isTeamAdmin || item.assigned_to === currentUserId || item.created_by === currentUserId;
                    if (!canModify) return;
                    const { error } = await supabase
                      .from("meeting_instance_topics")
                      .update({ completion_status: checked ? 'completed' : 'not_completed' })
                      .eq("id", item.id);
                    
                    if (!error) {
                      onUpdate();
                    }
                  }}
                  onDelete={handleDelete}
                  onRefresh={onUpdate}
                  isLast={index === items.length - 1}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-2 text-muted-foreground mb-4">
          <p className="text-sm">No team topics yet for this meeting.</p>
        </div>
      )}

      {/* Add New Topic Form */}
      <div className="bg-blue-200 pt-4 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6">
        
        {/* Desktop Layout */}
        <div className="hidden sm:grid sm:grid-cols-24 gap-3 items-start px-4 sm:px-6 pb-4 sm:pb-4">
          <div className="col-span-8">
            <Input
              placeholder="Add new topic here..."
              value={newTopic.title}
              onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
              className="h-10"
            />
          </div>
          <div className="col-span-4">
            <Select
              value={newTopic.assigned_to}
              onValueChange={(value) => setNewTopic({ ...newTopic, assigned_to: value })}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Who?">
                  {newTopic.assigned_to && members.find(m => m.user_id === newTopic.assigned_to) && (
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => {
                        const member = members.find(m => m.user_id === newTopic.assigned_to);
                        if (!member?.profiles) return null;
                        
                        const displayName = memberNames.get(newTopic.assigned_to) || 'Unknown';

                        return (
                          <>
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
                            <span className="truncate min-w-0">{displayName}</span>
                          </>
                        );
                      })()}
                    </div>
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
          <div className="col-span-4 relative">
            <Input
              type="number"
              placeholder="Duration"
              value={newTopic.time_minutes}
              onChange={(e) => setNewTopic({ ...newTopic, time_minutes: parseInt(e.target.value) || 5 })}
              className="h-10 pr-12"
              min="1"
              max="60"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              min
            </span>
          </div>
          {/* Notes field for desktop */}
        <div className="col-span-6 hidden sm:block">
          <RichTextEditor
            content={newTopic.notes}
            onChange={(content) => setNewTopic({ ...newTopic, notes: content })}
            placeholder="Notes..."
          />
        </div>
          <div className="col-span-2">
            <Button
              onClick={handleAdd}
              disabled={adding || !newTopic.title.trim()}
              className="h-10 w-full"
              size="sm"
              aria-label="Add Topic"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="sm:hidden space-y-3 px-4 sm:px-6 pb-4 sm:pb-6">
          <Input
            placeholder="Topic title..."
            value={newTopic.title}
            onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
            className="h-10"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={newTopic.assigned_to}
              onValueChange={(value) => setNewTopic({ ...newTopic, assigned_to: value })}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Who?">
                  {newTopic.assigned_to && members.find(m => m.user_id === newTopic.assigned_to) && (
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => {
                        const member = members.find(m => m.user_id === newTopic.assigned_to);
                        if (!member?.profiles) return null;
                        
                        const displayName = memberNames.get(newTopic.assigned_to) || 'Unknown';

                        return (
                          <>
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
                            <span className="truncate min-w-0">{displayName}</span>
                          </>
                        );
                      })()}
                    </div>
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
            <div className="relative">
              <Input
                type="number"
                placeholder="Minutes"
                value={newTopic.time_minutes}
                onChange={(e) => setNewTopic({ ...newTopic, time_minutes: parseInt(e.target.value) || 5 })}
                className="h-10 pr-12"
                min="1"
                max="60"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                min
              </span>
            </div>
          </div>
          <RichTextEditor
            content={newTopic.notes}
            onChange={(content) => setNewTopic({ ...newTopic, notes: content })}
            placeholder="Notes..."
          />
          <Button
            onClick={handleAdd}
            disabled={adding || !newTopic.title.trim()}
            className="h-10 w-10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Topic
          </Button>
        </div>

        
      </div>
    </>
  );
};

export default TeamTopics;


