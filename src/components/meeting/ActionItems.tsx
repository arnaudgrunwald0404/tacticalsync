import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Trash2, Check, X, Plus, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CommentsDialog from "./CommentsDialog";
import AddActionItemsDrawer from "./AddActionItemsDrawer";
import { startOfWeek, endOfWeek, format, getWeek, addDays } from "date-fns";
import { htmlToPlainText } from "@/lib/htmlUtils";
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

interface MeetingActionItemsProps {
  items: unknown[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
  onAddActionItem?: () => void;
  hasAgendaItems?: boolean;
}

export interface MeetingActionItemsRef {
  startCreating: () => void;
}

interface SortableActionItemRowProps {
  item: any;
  members: unknown[];
  onToggleComplete: (itemId: string, currentStatus: boolean) => void;
  onDelete: (itemId: string) => void;
  onChangeAssignment: (itemId: string, newUserId: string | null) => void;
  onUpdateOutcome: (itemId: string, newOutcome: string) => void;
  onOpenComments: (id: string, title: string) => void;
}

const SortableActionItemRow = ({ 
  item, 
  members, 
  onToggleComplete, 
  onDelete, 
  onChangeAssignment, 
  onUpdateOutcome, 
  onOpenComments 
}: SortableActionItemRowProps) => {
  const [comments, setComments] = useState<any[]>([]);
  const [showAllComments, setShowAllComments] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

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

  useEffect(() => {
    fetchComments();
  }, [item.id]);

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select(`
          *,
          profiles:user_id(id, full_name, first_name, last_name, email, avatar_url, avatar_name)
        `)
        .eq("item_id", item.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error: unknown) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoadingComments(false);
    }
  };

  const displayedComments = comments.slice(0, 5);
  const hasMoreComments = comments.length > 5;

  const getDisplayName = (profile: any) => {
    if (!profile) return "Unknown";
    const firstName = profile.first_name || "";
    const lastName = profile.last_name || "";
    const email = profile.email || "";
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else {
      return email;
    }
  };

  const formatCommentDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return format(date, "MMM d");
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-t hover:bg-muted/30 transition-colors"
    >
      <div className="px-4 py-3 grid grid-cols-[40px_40px_2fr_200px_2fr_80px] gap-4 items-center"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      
      <Checkbox
        checked={item.is_completed}
        onCheckedChange={() => onToggleComplete(item.id, item.is_completed)}
      />
      
      <div className={`font-medium ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
        {htmlToPlainText(item.title)}
      </div>

      <div>
        <Select 
          value={item.assigned_to || "none"} 
          onValueChange={(value) => onChangeAssignment(item.id, value === "none" ? null : value)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Assign to...">
              {item.assigned_to_profile ? (
                (() => {
                  const firstName = item.assigned_to_profile.first_name || "";
                  const lastName = item.assigned_to_profile.last_name || "";
                  const email = item.assigned_to_profile.email || "";
                  
                  let displayName = "";
                  if (firstName && lastName) {
                    displayName = `${firstName} ${lastName}`;
                  } else if (firstName) {
                    displayName = firstName;
                  } else {
                    displayName = email;
                  }
                  
                  return (
                    <div className="flex items-center gap-2">
                      {item.assigned_to_profile.avatar_name ? (
                        <FancyAvatar 
                          name={item.assigned_to_profile.avatar_name} 
                          displayName={displayName}
                          size="sm" 
                        />
                      ) : (
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={item.assigned_to_profile.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <span className="text-sm">{displayName}</span>
                    </div>
                  );
                })()
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="none">Unassigned</SelectItem>
            {members.map((member) => {
              const firstName = member.profiles?.first_name || "";
              const lastName = member.profiles?.last_name || "";
              const email = member.profiles?.email || "";
              
              let displayName = "";
              if (firstName && lastName) {
                displayName = `${firstName} ${lastName}`;
              } else if (firstName) {
                displayName = firstName;
              } else {
                displayName = email;
              }
              
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
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={member.profiles?.avatar_url} />
                        <AvatarFallback className="text-xs">
                          {displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <span>{displayName}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <Input
        placeholder="Desired outcome..."
        defaultValue={htmlToPlainText(item.outcome || "")}
        onBlur={(e) => onUpdateOutcome(item.id, e.target.value)}
        className="h-8 text-sm"
      />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            onOpenComments(item.id, item.title);
            // Refresh comments after opening dialog
            setTimeout(() => fetchComments(), 500);
          }}
        >
          <MessageSquare className="h-4 w-4" />
          {comments.length > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {comments.length}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>

    {/* Comments Section */}
    {comments.length > 0 && (
      <div className="px-4 pb-3 ml-[140px] space-y-2">
        {displayedComments.map((comment) => (
          <div key={comment.id} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {getDisplayName(comment.profiles)}
              </span>
              <span className="text-muted-foreground">
                {formatCommentDate(comment.created_at)}
              </span>
            </div>
            <p className="text-muted-foreground break-words mt-1">{comment.content}</p>
          </div>
        ))}
        {hasMoreComments && (
          <button
            onClick={() => {
              setShowAllComments(true);
              onOpenComments(item.id, item.title);
            }}
            className="text-xs text-primary hover:underline"
          >
            See more ({comments.length - 5} more comments)
          </button>
        )}
      </div>
    )}
  </div>
  );
};

const MeetingActionItems = forwardRef<MeetingActionItemsRef, MeetingActionItemsProps>(({ items, meetingId, teamId, onUpdate, onAddActionItem, hasAgendaItems = true }, ref) => {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    if (teamId) {
      fetchMembers();
    }
  }, [teamId]);

  useImperativeHandle(ref, () => ({
    startCreating,
  }));

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(id, full_name, first_name, last_name, email, avatar_url, avatar_name, red_percentage, blue_percentage, green_percentage, yellow_percentage)
      `)
      .eq("team_id", teamId);
    
    setMembers(data || []);
  };

  const startCreating = () => {
    setIsDrawerOpen(true);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent, weekItems: unknown[]) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = weekItems.findIndex((item) => item.id === active.id);
    const newIndex = weekItems.findIndex((item) => item.id === over.id);

    const reorderedItems = arrayMove(weekItems, oldIndex, newIndex);

    // Update order_index for all affected items in the database
    try {
      for (let i = 0; i < reorderedItems.length; i++) {
        const item = reorderedItems[i];
        await supabase
          .from("meeting_items")
          .update({ order_index: i })
          .eq("id", item.id);
      }

      toast({
        title: "ActionItems reordered",
        description: "The action_item order has been updated",
      });

      onUpdate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to reorder action_items",
        variant: "destructive",
      });
    }
  };


  const handleToggleComplete = async (itemId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ is_completed: !currentStatus })
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
      .from("meeting_items")
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
      title: "ActionItem deleted",
      description: "The action_item has been removed from the meeting.",
    });

    onUpdate();
  };

  const handleChangeAssignment = async (itemId: string, newUserId: string | null) => {
    const { error } = await supabase
      .from("meeting_items")
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
      description: "ActionItem has been reassigned",
    });

    onUpdate();
  };


  const handleUpdateOutcome = async (itemId: string, newOutcome: string) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ outcome: newOutcome })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update outcome",
        variant: "destructive",
      });
    }
  };

  // Group items by week
  const groupedByWeek: Record<string, { weekStart: Date; items: unknown[] }> = items.reduce((acc, item) => {
    const createdDate = new Date(item.created_at);
    const weekStart = startOfWeek(createdDate, { weekStartsOn: 1 }); // Monday
    const weekKey = weekStart.toISOString();
    
    if (!acc[weekKey]) {
      acc[weekKey] = {
        weekStart,
        items: [],
      };
    }
    
    acc[weekKey].items.push(item);
    return acc;
  }, {} as Record<string, { weekStart: Date; items: unknown[] }>);

  // Sort weeks descending (newest first)
  const sortedWeeks = Object.entries(groupedByWeek).sort(
    ([keyA], [keyB]) => new Date(keyB).getTime() - new Date(keyA).getTime()
  );

  const getWeekHeader = (weekStart: Date) => {
    // Use Monday-Sunday for full week coverage
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 }); // Monday start
    const sundayEnd = addDays(weekStart, 6); // Monday + 6 days = Sunday
    const weekNumber = getWeek(weekStart);
    const startStr = format(weekStart, "MMM d");
    const endStr = format(sundayEnd, "MMM d");
    return `Week ${weekNumber} (${startStr} - ${endStr})`;
  };

  return (
    <>
      <div className="space-y-4">
        {sortedWeeks.map(([weekKey, { weekStart, items: weekItems }]) => (
          <div key={weekKey} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {getWeekHeader(weekStart)}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 grid grid-cols-[40px_40px_2fr_200px_2fr_80px] gap-4 text-sm font-medium text-muted-foreground">
                <div></div>
                <div></div>
                <div>ActionItem</div>
                <div>Who</div>
                <div>Desired Outcome</div>
                <div></div>
              </div>
              
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, weekItems)}
              >
                <SortableContext
                  items={weekItems.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {weekItems.map((item) => (
                    <SortableActionItemRow
                      key={item.id}
                      item={item}
                      members={members}
                      onToggleComplete={handleToggleComplete}
                      onDelete={handleDelete}
                      onChangeAssignment={handleChangeAssignment}
                      onUpdateOutcome={handleUpdateOutcome}
                      onOpenComments={(id, title) => setSelectedItem({ id, title })}
                    />
                  ))}
                </SortableContext>
              </DndContext>

            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, weekItems)}
              >
                <SortableContext
                  items={weekItems.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {weekItems.map((item) => {
                    const firstName = item.assigned_to_profile?.first_name || "";
                    const lastName = item.assigned_to_profile?.last_name || "";
                    const email = item.assigned_to_profile?.email || "";
                    let displayName = "";
                    if (firstName && lastName) {
                      displayName = `${firstName} ${lastName}`;
                    } else if (firstName) {
                      displayName = firstName;
                    } else if (email) {
                      displayName = email;
                    }

                    return (
                      <div key={item.id} className="border rounded-lg p-4 space-y-3 bg-white">
                        {/* Checkbox and Title */}
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={item.is_completed}
                            onCheckedChange={() => handleToggleComplete(item.id, item.is_completed)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm break-words">{htmlToPlainText(item.title)}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 flex-shrink-0"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        {/* Assigned To */}
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Assigned To</span>
                          <Select
                            value={item.assigned_to || "none"}
                            onValueChange={(value) => handleChangeAssignment(item.id, value === "none" ? null : value)}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue>
                                {!item.assigned_to ? (
                                  <span className="text-muted-foreground">Unassigned</span>
                                ) : displayName ? (
                                  <span>{displayName}</span>
                                ) : (
                                  <span className="text-muted-foreground">Unknown</span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-popover z-50">
                              <SelectItem value="none">Unassigned</SelectItem>
                              {members.map((member) => {
                                const mFirstName = member.profiles?.first_name || "";
                                const mLastName = member.profiles?.last_name || "";
                                const mEmail = member.profiles?.email || "";
                                let mDisplayName = "";
                                if (mFirstName && mLastName) {
                                  mDisplayName = `${mFirstName} ${mLastName}`;
                                } else if (mFirstName) {
                                  mDisplayName = mFirstName;
                                } else {
                                  mDisplayName = mEmail;
                                }
                                return (
                                  <SelectItem key={member.user_id} value={member.user_id}>
                                    {mDisplayName}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Desired Outcome */}
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Desired Outcome</span>
                          <Input
                            placeholder="Desired outcome..."
                            defaultValue={htmlToPlainText(item.outcome || "")}
                            onBlur={(e) => handleUpdateOutcome(item.id, e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>

                        {/* Comments Button */}
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedItem({ id: item.id, title: item.title })}
                            className="text-xs"
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Comments
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            <p className="text-sm">
              {hasAgendaItems 
                ? "No action_items yet. Click \"Add ActionItem\" to create one." 
                : "ActionItems can be added once the agenda for the meeting has been set."
              }
            </p>
          </div>
        )}
      </div>

      {selectedItem && (
        <CommentsDialog
          itemId={selectedItem.id}
          itemTitle={selectedItem.title}
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
        />
      )}

      <AddActionItemsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        meetingId={meetingId}
        teamId={teamId}
        onSave={onUpdate}
        existingActionItems={items}
      />
    </>
  );
});

MeetingActionItems.displayName = "MeetingActionItems";

export default MeetingActionItems;
