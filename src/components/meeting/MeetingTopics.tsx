import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, X, Plus, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatNameWithInitial } from "@/lib/nameUtils";
import RichTextEditor from "@/components/ui/rich-text-editor";
import CommentsDialog from "./CommentsDialog";
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
import { CSS } from "@dnd-kit/utilities";
import { Topic, TopicInsert } from "@/types/topics";
import { TeamMember } from "@/types/meeting";
import { CompletionStatus } from "@/types/priorities";

interface MeetingTopicsProps {
  items: Topic[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
  hasAgendaItems?: boolean;
}

export interface MeetingTopicsRef {
  startCreating: () => void;
}

interface SortableTopicRowProps {
  item: Topic;
  members: TeamMember[];
  onSetCompletion: (itemId: string, status: CompletionStatus) => void;
  onDelete: (itemId: string) => void;
  onChangeAssignment: (itemId: string, newUserId: string | null) => void;
  onUpdateNotes: (itemId: string, notes: string) => void;
  onOpenComments: (id: string, title: string) => void;
}

const SortableTopicRow = ({ 
  item, 
  members, 
  onSetCompletion, 
  onDelete, 
  onChangeAssignment, 
  onUpdateNotes, 
  onOpenComments 
}: SortableTopicRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-muted/30"
    >
      <div className="flex items-center gap-2">
        <div {...attributes} {...listeners} className="cursor-grab hover:text-foreground/80">
          <GripVertical className="h-4 w-4" />
        </div>
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
          <Avatar className="h-8 w-8">
            <AvatarImage src={item.assigned_to_profile?.avatar_url} />
            <AvatarFallback>
              {(item.assigned_to_profile?.first_name || item.assigned_to_profile?.email || '?').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        <span className="text-sm">{item.title}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

const MeetingTopics = forwardRef<MeetingTopicsRef, MeetingTopicsProps>(({ items, meetingId, teamId, onUpdate, hasAgendaItems = true }, ref) => {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    title: "",
    assigned_to: null as string | null,
    notes: "",
    time_minutes: 5
  });

  useEffect(() => {
    if (teamId) {
      fetchMembers();
      fetchCurrentUser();
    }
  }, [teamId]);

  useImperativeHandle(ref, () => ({
    startCreating: () => {
      // Focus the title input
      const titleInput = document.getElementById('new-topic-title');
      if (titleInput) {
        titleInput.focus();
      }
    },
  }));

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(id, full_name, first_name, last_name, email, avatar_url, avatar_name)
      `)
      .eq("team_id", teamId);
    
    if (data) {
      setMembers(data);
    }
  };

  const fetchCurrentUser = async () => {
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
  };

  const getDisplayName = (member: TeamMember) => {
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddItem = async () => {
    if (!newItem.title.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const topicToInsert: TopicInsert = {
        instance_id: meetingId,
        title: newItem.title.trim(),
        notes: newItem.notes.trim(),
        assigned_to: newItem.assigned_to,
        time_minutes: newItem.time_minutes,
        completion_status: 'not_completed',
        order_index: items.length,
        created_by: user.id
      };

      const { error } = await supabase
        .from("meeting_instance_topics")
        .insert(topicToInsert);

      if (error) throw error;

      toast({
        title: "Topic added",
        description: "The topic has been added successfully.",
      });

      // Reset form
      setNewItem({
        title: "",
        assigned_to: currentUserId,
        notes: "",
        time_minutes: 5
      });

      onUpdate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add topic",
        variant: "destructive",
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    const reorderedItems = arrayMove(items, oldIndex, newIndex);

    // Update order_index for all affected items in the database
    try {
      for (let i = 0; i < reorderedItems.length; i++) {
        const item = reorderedItems[i];
        await supabase
          .from("meeting_instance_topics")
          .update({ order_index: i })
          .eq("id", item.id);
      }

      toast({
        title: "Topics reordered",
        description: "The topic order has been updated",
      });

      onUpdate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to reorder topics",
        variant: "destructive",
      });
    }
  };

  const handleSetCompletion = async (itemId: string, status: CompletionStatus) => {
    const { error } = await supabase
      .from("meeting_instance_topics")
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
      .from("meeting_instance_topics")
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
      title: "Topic deleted",
      description: "The topic has been removed from the meeting.",
    });

    onUpdate();
  };

  const handleChangeAssignment = async (itemId: string, newUserId: string | null) => {
    const { error } = await supabase
      .from("meeting_instance_topics")
      .update({ assigned_to: newUserId })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update assignment",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Assignment updated",
      description: "Topic has been reassigned",
    });

    onUpdate();
  };

  const handleUpdateNotes = async (itemId: string, notes: string) => {
    const { error } = await supabase
      .from("meeting_instance_topics")
      .update({ notes })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update notes",
        variant: "destructive",
      });
      return;
    }

    onUpdate();
  };

  return (
    <>
      <div className="space-y-4 -mx-4">
        {/* Add New Topic Form */}
        {hasAgendaItems && (
          <div className="px-4 py-3 border-y bg-background">
            <div className="flex items-center gap-3">
              {/* Title Input */}
              <div className="flex-[2]">
                <Input
                  id="new-topic-title"
                  value={newItem.title}
                  onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Topic title"
                  className="h-10"
                />
              </div>

              {/* Who Selector */}
              <div className="w-[180px]">
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
                                <Avatar className="h-6 w-6">
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
                    {members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        <div className="flex items-center gap-2">
                          {member.profiles?.avatar_name ? (
                            <FancyAvatar 
                              name={member.profiles.avatar_name} 
                              displayName={getDisplayName(member)}
                              size="sm" 
                            />
                          ) : (
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={member.profiles?.avatar_url} />
                              <AvatarFallback className="text-xs">
                                {getDisplayName(member).charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <span className="truncate">{getDisplayName(member)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes Input */}
              <div className="flex-1">
                <RichTextEditor
                  content={newItem.notes}
                  onChange={(content) => setNewItem(prev => ({ ...prev, notes: content }))}
                  placeholder="Notes..."
                  className="min-h-[32px] overflow-hidden"
                />
              </div>

              {/* Add Button */}
              <Button
                onClick={handleAddItem}
                disabled={!newItem.title.trim()}
                size="icon"
                className="h-10 w-10 shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Topics List */}
        <div className="space-y-0">
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
                <SortableTopicRow
                  key={item.id}
                  item={item}
                  members={members}
                  onSetCompletion={handleSetCompletion}
                  onDelete={handleDelete}
                  onChangeAssignment={handleChangeAssignment}
                  onUpdateNotes={handleUpdateNotes}
                  onOpenComments={(id, title) => setSelectedItem({ id, title })}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border-y">
            <p className="text-sm">
              {hasAgendaItems 
                ? "No topics yet. Add your first topic above." 
                : "Topics can be added once the agenda for the meeting has been set."
              }
            </p>
          </div>
        )}
      </div>

      {selectedItem && (
        <CommentsDialog
          itemId={selectedItem.id}
          itemTitle={selectedItem.title}
          itemType="topic"
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
        />
      )}
    </>
  );
});

MeetingTopics.displayName = "MeetingTopics";

export default MeetingTopics;
