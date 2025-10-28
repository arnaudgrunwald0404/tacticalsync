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
import { formatNameWithInitial } from "@/lib/nameUtils";
import { Priority, CompletionStatus } from "@/types/priorities";
import { TeamMember } from "@/types/meeting";

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
        <span className="text-sm">{item.outcome}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

const MeetingPriorities = forwardRef<MeetingPrioritiesRef, MeetingPrioritiesProps>(({ items, previousItems = [], meetingId, teamId, onUpdate, onAddPriority, frequency = "weekly", showPreviousPeriod = false }, ref) => {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groupedPriorities, setGroupedPriorities] = useState<{ [key: string]: Priority[] }>({});
  const [groupedPreviousPriorities, setGroupedPreviousPriorities] = useState<{ [key: string]: Priority[] }>({});

  // Debug logging
  console.log('MeetingPriorities received items:', items);
  console.log('MeetingPriorities items length:', items?.length || 0);

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

  const fetchMembers = async () => {
    // Fetch team members first
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("id, team_id, user_id, role, created_at")
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
        team_id: member.team_id,
        user_id: member.user_id,
        role: member.role,
        created_at: member.created_at,
        profiles: profile || null
      };
    });
    
    setMembers(membersWithProfiles);
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

  const handlePreviousPriorityCompletion = async (priorityId: string, status: CompletionStatus) => {
    try {
      const { error } = await supabase
        .from('meeting_instance_priorities')
        .update({ completion_status: status })
        .eq('id', priorityId);
      
      if (error) throw error;
      
      toast({
        title: "Status updated",
        description: `Priority marked as ${status === 'completed' ? 'complete' : 'not complete'}`,
      });
      
      onUpdate(); // Refresh data
    } catch (error) {
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
          
          {/* Display all priorities */}
          {items.length > 0 ? (
            items.map((item, index) => (
              <div key={item.id || index} className={`px-4 py-3 grid ${showPreviousPeriod ? 'grid-cols-[200px_1fr_1fr]' : 'grid-cols-[200px_1fr]'} gap-4 items-center border-t relative z-0`}>
                {/* User Column */}
                <div>
                  {item.assigned_to ? (
                    (() => {
                      const member = members.find(m => m.user_id === item.assigned_to);
                      if (!member?.profiles) return <span className="text-sm text-muted-foreground">Unknown</span>;
                      
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
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </div>

                {/* Previous Period Content */}
                {showPreviousPeriod && (
                  <div className="space-y-2">
                    {(groupedPreviousPriorities[item.assigned_to || 'unassigned'] || []).map((prevPriority) => (
                      <div 
                        key={prevPriority.id}
                        className={cn(
                          "p-3 rounded-md border flex justify-between items-start",
                          prevPriority.completion_status === 'completed' && "bg-green-50 border-green-200",
                          prevPriority.completion_status === 'not_completed' && "bg-red-50 border-red-200",
                          (prevPriority.completion_status === 'pending' || !prevPriority.completion_status) && "bg-gray-50 border-gray-200"
                        )}
                      >
                        <div className="flex-1 pr-3">
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

                {/* Current Period Content - Read-only text */}
                <div className="space-y-1">
                  <div 
                    className="text-sm font-semibold"
                    dangerouslySetInnerHTML={{ __html: htmlToFormattedDisplayItems(item.outcome).map(item => item.content).join('') }}
                  />
                  {item.activities && (
                    <div className="text-sm mt-1 text-muted-foreground">
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
            <div className={`px-4 py-8 text-center text-muted-foreground ${showPreviousPeriod ? 'grid-cols-[200px_1fr_1fr]' : 'grid-cols-[200px_1fr]'} gap-4`}>
              <div className="col-span-full">
                No priorities set yet for this {frequency === "monthly" ? "month" : frequency === "weekly" ? "week" : frequency === "quarter" ? "quarter" : "period"}.
              </div>
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
                    onValueChange={(value) => handleChangeAssignment(item.id, value)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Who?">
                        {item.assigned_to ? (
                          (() => {
                            const member = members.find(m => m.user_id === item.assigned_to);
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
                                    {member.profiles?.first_name?.[0]?.toUpperCase() || member.profiles?.email?.[0]?.toUpperCase() || '?'}
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

                {/* Previous Period Content - Mobile */}
                {showPreviousPeriod && (
                  <div className="space-y-2">
                    {(groupedPreviousPriorities[item.assigned_to || 'unassigned'] || []).map((prevPriority) => (
                      <div 
                        key={prevPriority.id}
                        className={cn(
                          "p-3 rounded-md border flex justify-between items-start",
                          prevPriority.completion_status === 'completed' && "bg-green-50 border-green-200",
                          prevPriority.completion_status === 'not_completed' && "bg-red-50 border-red-200",
                          (prevPriority.completion_status === 'pending' || !prevPriority.completion_status) && "bg-gray-50 border-gray-200"
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
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
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
        existingPriorities={items}
        frequency={frequency}
      />
    </>
  );
});

MeetingPriorities.displayName = "MeetingPriorities";

export default MeetingPriorities;
