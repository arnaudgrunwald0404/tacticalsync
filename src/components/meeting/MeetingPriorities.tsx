import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, X, Plus, GripVertical, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CommentsDialog from "./CommentsDialog";
import AddPrioritiesDrawer from "./AddPrioritiesDrawer";
import { startOfWeek, endOfWeek, format, getWeek, addDays } from "date-fns";
import { htmlToPlainText, htmlToDisplayItems, htmlToFormattedDisplayItems } from "@/lib/htmlUtils";
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
import { formatMemberNames, getFullNameForAvatar } from "@/lib/nameUtils";
import { Priority, CompletionStatus } from "@/types/priorities";
import { TeamMember } from "@/types/meeting";
import { useMeetingContext } from "@/contexts/MeetingContext";

interface MeetingPrioritiesProps {
  items: Priority[];
  previousItems?: Priority[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
  onAddPriority?: () => void;
  hasAgendaItems?: boolean;
  frequency?: "daily" | "weekly" | "bi-weekly" | "monthly" | "quarter";
  showPreviousPeriod?: boolean;
  currentUserId?: string;
  meetingStartDate?: string;
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
          profiles!fk_comments_created_by_profiles(id, full_name, first_name, last_name, email, avatar_url, avatar_name)
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
      <div className="flex items-center gap-2 min-w-0">
        <Avatar className="h-6 w-6">
          <AvatarImage src={item.assigned_to_profile?.avatar_url} />
          <AvatarFallback className="text-xs">
            {item.assigned_to_profile?.first_name?.[0]?.toUpperCase() || item.assigned_to_profile?.email?.[0]?.toUpperCase() || ''}{item.assigned_to_profile?.last_name?.[0]?.toUpperCase() || ''}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm truncate min-w-0">{item.outcome}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

const MeetingPriorities = forwardRef<MeetingPrioritiesRef, MeetingPrioritiesProps>(({ items, previousItems = [], meetingId, teamId, onUpdate, onAddPriority, frequency = "weekly", showPreviousPeriod = false, currentUserId, meetingStartDate }, ref) => {
  const { toast } = useToast();
  const { isSuperAdmin, isTeamAdmin, teamMembers: members, memberNames } = useMeetingContext();
  
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [groupedPriorities, setGroupedPriorities] = useState<{ [key: string]: Priority[] }>({});
  const [groupedPreviousPriorities, setGroupedPreviousPriorities] = useState<{ [key: string]: Priority[] }>({});

  // Debug logging
  console.log('MeetingPriorities received items:', items);
  console.log('MeetingPriorities items length:', items?.length || 0);

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

  useEffect(() => {
    // Group previous priorities by assigned_to
    const grouped = previousItems.reduce((acc, item) => {
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

    setGroupedPreviousPriorities(grouped);
  }, [previousItems]);

  useImperativeHandle(ref, () => ({
    startCreating,
  }));

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

  const handlePreviousPriorityCompletion = async (priorityId: string, status: CompletionStatus) => {
    try {
      console.log('Updating priority:', priorityId, 'to status:', status);
      
      const { data, error } = await supabase
        .from('meeting_instance_priorities')
        .update({ completion_status: status })
        .eq('id', priorityId)
        .select();
      
      if (error) {
        console.error('Update error:', error);
        throw error;
      }
      
      console.log('Update successful:', data);
      
      toast({
        title: "Status updated",
        description: `Priority marked as ${status === 'completed' ? 'complete' : 'not complete'}`,
      });
      
      // Wait a moment to ensure database transaction completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await onUpdate(); // Refresh data
    } catch (error) {
      console.error('Failed to update completion status:', error);
      toast({
        title: "Error",
        description: "Failed to update completion status",
        variant: "destructive",
      });
    }
  };

  // Group items by week
  const groupedByWeek: Record<string, { weekStart: Date; items: Priority[] }> = items.reduce((acc, item) => {
    // Use current date if created_at is missing or invalid
    const createdDate = item.created_at ? new Date(item.created_at) : new Date();
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

        {/* Desktop Table View */}
        <div className="hidden sm:block border rounded-lg overflow-hidden relative">
          <div className="sticky top-0 z-5 bg-background">
            <div className={`bg-muted/50 px-4 py-2 grid ${showPreviousPeriod ? 'grid-cols-[200px_1fr_1fr]' : 'grid-cols-[200px_1fr]'} gap-4 text-sm font-medium text-muted-foreground`}>
              <div>Who</div>
              {showPreviousPeriod && (
                <div>Previous {frequency === "monthly" ? "Month's" : frequency === "weekly" ? "Week's" : frequency === "quarter" ? "Quarter's" : "Period's"} Priorities</div>
              )}
              <div>This {frequency === "monthly" ? "Month's" : frequency === "weekly" ? "Week's" : frequency === "quarter" ? "Quarter's" : "Period's"} Priorities</div>
            </div>
          </div>
          
          {/* Display priorities grouped by person and aligned by index */}
          {Object.keys(groupedPriorities).length > 0 || Object.keys(groupedPreviousPriorities).length > 0 ? (
            (() => {
              const allUserIds = Array.from(new Set([
                ...Object.keys(groupedPriorities),
                ...Object.keys(groupedPreviousPriorities)
              ]));

              const getDisplayName = (userId: string | null) => {
                if (!userId || userId === 'unassigned') return 'Unassigned';
                const member = members.find(m => m.user_id === userId);
                if (!member?.profiles) return 'Unknown';
                return memberNames.get(userId) || 'Unknown';
              };

              const sortedUserIds = allUserIds.sort((a, b) => {
                const nameA = getDisplayName(a).toLowerCase();
                const nameB = getDisplayName(b).toLowerCase();
                return nameA.localeCompare(nameB);
              });

              return (
                <>
                  {sortedUserIds.map((userId) => {
                    const current = (groupedPriorities[userId] || []).sort((a, b) => a.order_index - b.order_index);
                    const previous = (groupedPreviousPriorities[userId] || []).sort((a, b) => a.order_index - b.order_index);
                    const rows = Math.max(current.length, showPreviousPeriod ? previous.length : 0, 1);

                    const member = userId && userId !== 'unassigned' ? members.find(m => m.user_id === userId) : undefined;
                    const displayName = getDisplayName(userId as string);

                    return Array.from({ length: rows }).map((_, i) => {
                      const currItem = current[i];
                      const prevItem = showPreviousPeriod ? previous[i] : undefined;

                      return (
                        <div key={`${userId}-${i}`} className={`px-4 py-3 grid ${showPreviousPeriod ? 'grid-cols-[200px_1fr_1fr]' : 'grid-cols-[200px_1fr]'} gap-4 items-start border-t relative z-0`}>
                          {/* User Column - name shown on every row */}
                          <div>
                            {userId && userId !== 'unassigned' && member?.profiles ? (
                              <div className="flex items-center gap-2 min-w-0">
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
                                <span className="text-sm truncate min-w-0">{displayName}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">{displayName}</span>
                            )}
                          </div>

                          {/* Previous Period Column - single row per index */}
                          {showPreviousPeriod && (
                            <div className="space-y-2">
                        {prevItem ? (
                                <div
                                  className={cn(
                                    "p-3 rounded-md border flex justify-between items-start",
                                    prevItem.completion_status === 'completed' && "bg-green-50 border-green-200",
                                    prevItem.completion_status === 'not_completed' && "bg-red-50 border-red-200"
                                  )}
                                >
                                  <div className="flex-1 pr-3">
                                    <div
                                      className="text-sm"
                                      dangerouslySetInnerHTML={{ __html: htmlToFormattedDisplayItems(prevItem.outcome).map(it => it.content).join('') }}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const canModify = isSuperAdmin || isTeamAdmin || prevItem.assigned_to === currentUserId || prevItem.created_by === currentUserId;
                                        if (canModify) handlePreviousPriorityCompletion(prevItem.id, 'completed');
                                      }}
                                      className={cn(
                                        "h-8 w-8 p-0",
                                        prevItem.completion_status === 'completed'
                                          ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
                                          : (prevItem.completion_status === 'pending' || !prevItem.completion_status)
                                          ? "bg-white border-green-600 hover:bg-green-50 text-green-600"
                                          : "bg-white border-gray-300 hover:bg-gray-50",
                                        !(isSuperAdmin || isTeamAdmin || prevItem.assigned_to === currentUserId || prevItem.created_by === currentUserId) && "opacity-50 cursor-not-allowed"
                                      )}
                                      disabled={!(isSuperAdmin || isTeamAdmin || prevItem.assigned_to === currentUserId || prevItem.created_by === currentUserId)}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const canModify = isSuperAdmin || isTeamAdmin || prevItem.assigned_to === currentUserId || prevItem.created_by === currentUserId;
                                        if (canModify) handlePreviousPriorityCompletion(prevItem.id, 'not_completed');
                                      }}
                                      className={cn(
                                        "h-8 w-8 p-0",
                                        prevItem.completion_status === 'not_completed'
                                          ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                                          : (prevItem.completion_status === 'pending' || !prevItem.completion_status)
                                          ? "bg-white border-red-600 hover:bg-red-50 text-red-600"
                                          : "bg-white border-gray-300 hover:bg-gray-50",
                                        !(isSuperAdmin || isTeamAdmin || prevItem.assigned_to === currentUserId || prevItem.created_by === currentUserId) && "opacity-50 cursor-not-allowed"
                                      )}
                                      disabled={!(isSuperAdmin || isTeamAdmin || prevItem.assigned_to === currentUserId || prevItem.created_by === currentUserId)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-muted-foreground italic text-sm">&nbsp;</div>
                              )}
                            </div>
                          )}

                          {/* Current Period Column - single row per index */}
                          <div className="space-y-1">
                            {currItem ? (
                              <>
                                <div
                                  className="text-sm font-semibold"
                                  dangerouslySetInnerHTML={{ __html: htmlToFormattedDisplayItems(currItem.outcome).map(it => it.content).join('') }}
                                />
                                {currItem.activities && (
                                  <div className="text-sm mt-1 text-muted-foreground">
                                    {htmlToFormattedDisplayItems(currItem.activities).map((displayItem, idx) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        {displayItem.isListItem && <span className="text-muted-foreground">•</span>}
                                        <span
                                          className={displayItem.isListItem ? "" : "block"}
                                          dangerouslySetInnerHTML={{ __html: displayItem.content }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-muted-foreground italic text-sm">&nbsp;</div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })}
                </>
              );
            })()
          ) : (
            <div className="text-center py-8 text-muted-foreground ">
              <p className="text-sm">
                No priorities set yet for this {frequency === "monthly" ? "month" : frequency === "weekly" ? "week" : frequency === "quarter" ? "quarter" : "period"}.
              </p>
            </div>
          )}
        </div>

        {/* Mobile Card View */}
        <div className="sm:hidden space-y-6">
          {items.length > 0 ? (
            items.map((item, index) => (
              <div key={item.id || index} className="border rounded-lg p-4 space-y-3 bg-white">
                {/* User Header */}
                <div className="px-1">
                  <Select
                    value={item.assigned_to || ""}
                    onValueChange={(value) => (currentUserId && item.assigned_to !== currentUserId) ? undefined : handleChangeAssignment(item.id, value)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Who?">
                        {item.assigned_to ? (
                          (() => {
                            const member = members.find(m => m.user_id === item.assigned_to);
                            if (!member?.profiles) return "Unknown";
                            
                            const displayName = memberNames.get(item.assigned_to) || 'Unknown';
                            
                            return (
                              <div className="flex items-center gap-2 min-w-0">
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
                                <span className="text-sm truncate min-w-0">{displayName}</span>
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
                          <SelectItem key={member.user_id} value={member.user_id} disabled={!!(currentUserId && item.assigned_to !== currentUserId)}>
                            <div className="flex items-center gap-2 min-w-0">
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
                              <span className="truncate min-w-0">{displayName}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Previous Period Content - Mobile */}
                {showPreviousPeriod && (
                  <div className="space-y-2">
                    {(groupedPreviousPriorities[item.assigned_to || 'unassigned'] || []).map((prevPriority) => (
                      <div 
                        key={prevPriority.id}
                        className={cn(
                          "p-3 rounded-md border flex justify-between items-start",
                          prevPriority.completion_status === 'completed' && "bg-green-50 border-green-200",
                          prevPriority.completion_status === 'not_completed' && "bg-red-50 border-red-200"
                        )}
                      >
                        <div className="flex-1 pr-3">
                          <div className="text-xs text-muted-foreground mb-1">Previous {frequency === "monthly" ? "Month's" : frequency === "weekly" ? "Week's" : frequency === "quarter" ? "Quarter's" : "Period's"} Priority:</div>
                          <div 
                            className="text-sm" 
                            dangerouslySetInnerHTML={{ __html: htmlToFormattedDisplayItems(prevPriority.outcome).map(item => item.content).join('') }} 
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handlePreviousPriorityCompletion(prevPriority.id, 'completed')}
                            className={cn(
                              "h-8 w-8 p-0",
                              prevPriority.completion_status === 'completed' 
                                ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
                                : (prevPriority.completion_status === 'pending' || !prevPriority.completion_status)
                                ? "bg-white border-green-600 hover:bg-green-50 text-green-600"
                                : "bg-white border-gray-300 hover:bg-gray-50"
                            )}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreviousPriorityCompletion(prevPriority.id, 'not_completed')}
                            className={cn(
                              "h-8 w-8 p-0",
                              prevPriority.completion_status === 'not_completed' 
                                ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                                : (prevPriority.completion_status === 'pending' || !prevPriority.completion_status)
                                ? "bg-white border-red-600 hover:bg-red-50 text-red-600"
                                : "bg-white border-gray-300 hover:bg-gray-50"
                            )}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {!(groupedPreviousPriorities[item.assigned_to || 'unassigned'] || []).length && (
                      <div className="text-muted-foreground italic text-sm">No previous priority</div>
                    )}
                  </div>
                )}

                {/* Priority Content - Read-only text */}
                <div className="space-y-3">
                  <div 
                    className="text-sm font-semibold"
                    dangerouslySetInnerHTML={{ __html: htmlToFormattedDisplayItems(item.outcome).map(item => item.content).join('') }}
                  />
                  {item.activities && (
                    <div className="text-sm text-muted-foreground">
                      {htmlToFormattedDisplayItems(item.activities).map((displayItem, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          {displayItem.isListItem && <span className="text-muted-foreground">•</span>}
                          <span 
                            className={displayItem.isListItem ? "" : "block"}
                            dangerouslySetInnerHTML={{ __html: displayItem.content }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-2 text-muted-foreground mb-4">
              <p className="text-sm">
                No priorities set yet for this {frequency === "monthly" ? "month" : frequency === "weekly" ? "week" : frequency === "quarter" ? "quarter" : "period"}.
              </p>
            </div>
          )}
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

      <AddPrioritiesDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        meetingId={meetingId}
        teamId={teamId}
        onSave={onUpdate}
        existingPriorities={currentUserId ? items.filter(i => i.assigned_to === currentUserId) : items}
        frequency={frequency}
        meetingStartDate={meetingStartDate}
      />
    </>
  );
});

MeetingPriorities.displayName = "MeetingPriorities";

export default MeetingPriorities;
