import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, X, Plus, GripVertical, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CommentsDialog from "./CommentsDialog";
import AddPrioritiesDrawer from "./AddPrioritiesDrawer";
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
import { cn } from "@/lib/utils";
import { UserDisplay } from "@/components/ui/user-display";
import { formatNameWithInitial } from "@/lib/nameUtils";
import { Priority, CompletionStatus } from "@/types/priorities";
import { TeamMember } from "@/types/meeting";

interface MeetingPrioritiesProps {
  items: Priority[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
  onAddPriority?: () => void;
  hasAgendaItems?: boolean;
  frequency?: "daily" | "weekly" | "bi-weekly" | "monthly" | "quarter";
  showPreviousPeriod?: boolean;
}

export interface MeetingPrioritiesRef {
  startCreating: () => void;
}

interface SortablePriorityRowProps {
  item: Priority;
  members: TeamMember[];
  onSetCompletion: (itemId: string, status: CompletionStatus) => void;
  onDelete: (itemId: string) => void;
  onChangeAssignment: (itemId: string, newUserId: string | null) => void;
  onUpdateOutcome: (itemId: string, newOutcome: string) => void;
  onUpdateActivities: (itemId: string, newActivities: string) => void;
  onOpenComments: (id: string, title: string) => void;
}

const SortablePriorityRow = ({ 
  item, 
  members, 
  onSetCompletion, 
  onDelete, 
  onChangeAssignment, 
  onUpdateOutcome,
  onUpdateActivities,
  onOpenComments 
}: SortablePriorityRowProps) => {
  const [comments, setComments] = useState<any[]>([]);
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
        .eq("item_type", "priority")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error: unknown) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoadingComments(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-muted/30"
    >
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          <AvatarImage src={item.assigned_to_profile?.avatar_url} />
          <AvatarFallback className="text-xs">
            {(item.assigned_to_profile?.first_name || item.assigned_to_profile?.email || '?').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm">{item.title}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

const MeetingPriorities = forwardRef<MeetingPrioritiesRef, MeetingPrioritiesProps>(({ items, meetingId, teamId, onUpdate, onAddPriority, frequency = "weekly", showPreviousPeriod = false }, ref) => {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groupedPriorities, setGroupedPriorities] = useState<{ [key: string]: Priority[] }>({});

  useEffect(() => {
    if (teamId) {
      fetchMembers();
    }
  }, [teamId]);

  useEffect(() => {
    // Group priorities by assigned_to
    const grouped = items.reduce((acc, item) => {
      const assignedTo = item.assigned_to || 'unassigned';
      if (!acc[assignedTo]) {
        acc[assignedTo] = [];
      }
      acc[assignedTo].push(item);
      return acc;
    }, {} as { [key: string]: Priority[] });

    // Sort priorities within each group by order_index
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => a.order_index - b.order_index);
    });

    setGroupedPriorities(grouped);
  }, [items]);

  useImperativeHandle(ref, () => ({
    startCreating,
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
    } else {
      setMembers([]);
    }
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

  const handleDragEnd = async (event: DragEndEvent, weekItems: Priority[]) => {
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
          .from("meeting_instance_priorities")
          .update({ order_index: i })
          .eq("id", item.id);
      }

      toast({
        title: "Priorities reordered",
        description: "The priority order has been updated",
      });

      onUpdate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to reorder priorities",
        variant: "destructive",
      });
    }
  };

  const handleSetCompletion = async (itemId: string, status: CompletionStatus) => {
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
        .from('meeting_instance_priorities')
        .update({
          completion_status: status
        })
        .eq('id', itemId);

      if (error) throw error;

      toast({
        title: "Status updated",
        description: `Priority marked as ${status}`,
      });

      onUpdate();
    } catch (error: any) {
      console.error('Error updating completion status:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update completion status",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (itemId: string) => {
    const { error } = await supabase
      .from("meeting_instance_priorities")
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
      title: "Priority deleted",
      description: "The priority has been removed from the meeting.",
    });

    onUpdate();
  };

  const handleChangeAssignment = async (itemId: string, newUserId: string | null) => {
    const { error } = await supabase
      .from("meeting_instance_priorities")
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
      description: "Priority has been reassigned",
    });

    onUpdate();
  };

  const handleUpdateOutcome = async (itemId: string, newOutcome: string) => {
    const { error } = await supabase
      .from("meeting_instance_priorities")
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

  const handleUpdateActivities = async (itemId: string, newActivities: string) => {
    // Format activities as bullet points
    const formattedActivities = newActivities
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .map(line => line.startsWith('•') ? line : `• ${line}`)
      .join('\n');

    const { error } = await supabase
      .from("meeting_instance_priorities")
      .update({ activities: formattedActivities })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update activities",
        variant: "destructive",
      });
    }
  };

  // Group items by week
  const groupedByWeek: Record<string, { weekStart: Date; items: Priority[] }> = items.reduce((acc, item) => {
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
  }, {} as Record<string, { weekStart: Date; items: Priority[] }>);

  // Sort weeks descending (newest first)
  const sortedWeeks = Object.entries(groupedByWeek).sort(
    ([keyA], [keyB]) => new Date(keyB).getTime() - new Date(keyA).getTime()
  );

  return (
    <>
      <div className="space-y-4">
        {sortedWeeks.map(([weekKey, { weekStart, items: weekItems }]) => (
          <div key={weekKey} className="space-y-3">
            {/* Desktop Table View */}
            <div className="hidden sm:block border rounded-lg overflow-hidden relative">
              <div className="sticky top-0 z-20 bg-background">
                <div className={`bg-muted/50 px-4 py-2 grid ${showPreviousPeriod ? 'grid-cols-[200px_1fr_1fr]' : 'grid-cols-[200px_1fr]'} gap-4 text-sm font-medium text-muted-foreground`}>
                  <div>Who</div>
                  {showPreviousPeriod && (
                    <div>Previous {frequency === "monthly" ? "Month's" : frequency === "weekly" ? "Week's" : frequency === "quarter" ? "Quarter's" : "Period's"} Priorities</div>
                  )}
                  <div>This {frequency === "monthly" ? "Month's" : frequency === "weekly" ? "Week's" : frequency === "quarter" ? "Quarter's" : "Period's"} Priorities</div>
                </div>
              </div>
              
              {members.map((member) => {
                const userPriorities = weekItems.filter(item => item.assigned_to === member.user_id);
                const priorities = ['P1', 'P2', 'P3'];
              
                return priorities.map((priority, index) => {
                  const item = userPriorities[index];
                  return (
                    <div key={`${member.user_id}-${priority}`} className={`px-4 py-3 grid ${showPreviousPeriod ? 'grid-cols-[200px_1fr_1fr]' : 'grid-cols-[200px_1fr]'} gap-4 items-center border-t relative z-0`}>
                      {/* User Column */}
                      <div className="flex items-center gap-2">
                        <UserDisplay user={member} />
                      </div>

                      {/* Previous Period Content */}
                      {showPreviousPeriod && (
                        <div className="space-y-1">
                          {item ? (
                            <div className="flex gap-3">
                              {/* Completion Buttons */}
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => handleSetCompletion(item.id, 'completed')}
                                  className={`w-8 h-8 border border-gray-300 rounded-md flex items-center justify-center transition-colors ${
                                    item.completion_status === 'completed'
                                      ? 'bg-green-600 text-white hover:bg-green-700'
                                      : 'text-muted-foreground hover:border-green-700 hover:bg-green-50 hover:text-green-700'
                                  }`}
                                >
                                  <Check className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handleSetCompletion(item.id, 'not_completed')}
                                  className={`w-8 h-8 border border-gray-300 rounded-md flex items-center justify-center transition-colors ${
                                    item.completion_status === 'not_completed'
                                      ? 'bg-red-600 text-white hover:bg-red-700'
                                      : 'text-muted-foreground hover:border-red-700 hover:bg-red-50 hover:text-red-700'
                                  }`}
                                >
                                  <X className="h-5 w-5" />
                                </button>
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1">
                                <div className="font-bold">
                                  {htmlToPlainText(item.outcome)}
                                </div>
                                {item.activities && (
                                  <div className="pl-4 space-y-1 text-sm mt-1">
                                    {item.activities.split('\n').filter(line => line.trim()).map((line, idx) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        <span className="text-muted-foreground">•</span>
                                        <span>{line.trim()}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted-foreground italic text-sm">No priority set</div>
                          )}
                        </div>
                      )}

                      {/* This Period */}
                      <div className="space-y-3">
                        {item?.isEditing ? (
                          <>
                            <Input
                              placeholder="Desired Outcome"
                              defaultValue={htmlToPlainText(item.outcome)}
                              onBlur={async (e) => {
                                await handleUpdateOutcome(item.id, e.target.value);
                                onUpdate();
                              }}
                              className="h-8 text-sm"
                              autoFocus
                            />
                            <Input
                              placeholder="Supporting Activities"
                              defaultValue={htmlToPlainText(item.activities || "")}
                              onBlur={async (e) => {
                                await handleUpdateActivities(item.id, e.target.value);
                                onUpdate();
                              }}
                              className="h-8 text-sm"
                            />
                          </>
                        ) : (
                          <div 
                            className="space-y-2 cursor-pointer hover:bg-muted/30 p-2 rounded-md transition-colors"
                            onClick={() => {
                              const updatedItem = { ...item, isEditing: true };
                              const updatedItems = weekItems.map(i => i.id === item.id ? updatedItem : i);
                              onUpdate();
                            }}
                          >
                            {item?.outcome ? (
                              <div className="font-bold">{htmlToPlainText(item.outcome)}</div>
                            ) : (
                              <div className="text-muted-foreground italic text-sm">Click to add desired outcome</div>
                            )}
                            {item?.activities ? (
                              <div className="pl-4 space-y-1 text-sm">
                                {item.activities.split('\n').filter(line => line.trim()).map((line, idx) => (
                                  <div key={idx} className="flex items-start gap-2">
                                    <span className="text-muted-foreground">•</span>
                                    <span>{line.trim()}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-muted-foreground italic text-sm pl-4">Click to add supporting activities</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })}
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-6">
              {members.map((member) => {
                const userPriorities = weekItems.filter(item => item.assigned_to === member.user_id);
                const priorities = ['P1', 'P2', 'P3'];

                return (
                  <div key={member.user_id} className="space-y-3">
                    {/* User Header */}
                    <div className="flex items-center gap-2 px-1">
                      <UserDisplay user={member} />
                    </div>

                    {/* Priorities */}
                    {priorities.map((priority, index) => {
                      const item = userPriorities[index];
                      return (
                        <div key={priority} className="border rounded-lg p-4 space-y-3 bg-white">
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-sm">{priority}</div>
                            {item && (
                              <div className="flex items-center gap-2">
                                {/* Done Status */}
                                <div className="flex flex-col items-center gap-1">
                                  <div className="text-xs font-medium text-muted-foreground">Done</div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleSetCompletion(item.id, 'not_completed')}
                                      className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                                        item.completion_status === 'not_completed'
                                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                          : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                      }`}
                                    >
                                      <X className="h-5 w-5" />
                                    </button>
                                    <button
                                      onClick={() => handleSetCompletion(item.id, 'completed')}
                                      className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                                        item.completion_status === 'completed'
                                          ? 'bg-green-50 text-green-600 hover:bg-green-100'
                                          : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                      }`}
                                    >
                                      <Check className="h-5 w-5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-4">
                            {/* Previous Period */}
                            {showPreviousPeriod && (
                              item ? (
                                <div className="space-y-2">
                                  <div className="text-sm font-medium text-muted-foreground">Previous Period</div>
                                  <div className={cn(
                                    "rounded-md transition-colors",
                                    item.completion_status === 'completed' && "bg-green-50",
                                    item.completion_status === 'not_completed' && "bg-red-50",
                                    "p-3"
                                  )}>
                                    <div className="flex items-start gap-4">
                                      {/* Completion Buttons */}
                                      <div className="flex flex-col gap-2 pt-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleSetCompletion(item.id, 'completed')}
                                          className={`h-8 w-8 ${
                                            item.completion_status === 'completed'
                                              ? 'bg-green-600 text-white hover:bg-green-700'
                                              : 'text-muted-foreground hover:bg-green-50 hover:text-green-700'
                                          }`}
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleSetCompletion(item.id, 'not_completed')}
                                          className={`h-8 w-8 ${
                                            item.completion_status === 'not_completed'
                                              ? 'bg-red-600 text-white hover:bg-red-700'
                                              : 'text-muted-foreground hover:bg-red-50 hover:text-red-700'
                                          }`}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>

                                      {/* Content */}
                                      <div className="flex-1">
                                        <div className="font-bold">
                                          {htmlToPlainText(item.outcome)}
                                        </div>
                                        {item.activities && (
                                          <div className="pl-4 space-y-1 text-sm">
                                            {item.activities.split('\n').filter(line => line.trim()).map((line, idx) => (
                                              <div key={idx} className="flex items-start gap-2">
                                                <span className="text-muted-foreground">•</span>
                                                <span>{line.trim()}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-muted-foreground italic text-sm">No priority set</div>
                              )
                            )}

                            {/* This Period */}
                            <div className="space-y-3">
                              <div className="text-sm font-medium text-muted-foreground">This Period</div>
                              <Input
                                placeholder="Desired Outcome"
                                defaultValue={htmlToPlainText(item?.outcome || "")}
                                onBlur={(e) => handleUpdateOutcome(item?.id, e.target.value)}
                                className="h-8 text-sm"
                              />
                              <Input
                                placeholder="Supporting Activities"
                                defaultValue={htmlToPlainText(item?.activities || "")}
                                onBlur={(e) => handleUpdateActivities(item?.id, e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            <p className="text-sm">
              No priorities set yet for this {frequency === "monthly" ? "month" : frequency === "weekly" ? "week" : frequency === "quarter" ? "quarter" : "period"}.
            </p>
          </div>
        )}
      </div>

      {selectedItem && (
        <CommentsDialog
          itemId={selectedItem.id}
          itemTitle={selectedItem.title}
          itemType="priority"
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
        />
      )}

      <AddPrioritiesDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        meetingId={meetingId}
        teamId={teamId}
        onSave={onUpdate}
        existingPriorities={items}
      />
    </>
  );
});

MeetingPriorities.displayName = "MeetingPriorities";

export default MeetingPriorities;
