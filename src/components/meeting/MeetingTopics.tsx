import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Trash2, Check, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CommentsDialog from "./CommentsDialog";
import { startOfWeek, endOfWeek, format, getWeek } from "date-fns";

interface MeetingTopicsProps {
  items: any[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
  onAddTopic?: () => void;
}

const MeetingTopics = ({ items, meetingId, teamId, onUpdate, onAddTopic }: MeetingTopicsProps) => {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // New topic form state
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  useEffect(() => {
    if (teamId) {
      fetchMembers();
    }
  }, [teamId]);

  useEffect(() => {
    if (onAddTopic) {
      // Expose startCreating to parent
      (window as any).__startCreatingTopic = startCreating;
    }
  }, [onAddTopic]);

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(id, full_name, avatar_url, red_percentage, blue_percentage, green_percentage, yellow_percentage)
      `)
      .eq("team_id", teamId);
    
    setMembers(data || []);
  };

  const startCreating = async () => {
    setIsCreating(true);
    // Default assignedTo to current user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setAssignedTo(user.id);
    }
  };

  const resetForm = () => {
    setTitle("");
    setOutcome("");
    setAssignedTo("");
    setIsCreating(false);
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
      title: "Topic deleted",
      description: "The topic has been removed from the meeting.",
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
      description: "Topic has been reassigned",
    });

    onUpdate();
  };

  const handleCreateTopic = async () => {
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Title is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in",
          variant: "destructive",
        });
        return;
      }

      // Get next order index
      const nextOrder = items.length > 0 
        ? Math.max(...items.map(i => i.order_index)) + 1 
        : 0;

      const { error } = await supabase.from("meeting_items").insert({
        meeting_id: meetingId,
        type: "topic",
        title: title.trim(),
        outcome: outcome.trim() || null,
        assigned_to: assignedTo || null,
        order_index: nextOrder,
        created_by: user.id,
      });

      if (error) throw error;

      toast({
        title: "Topic added!",
        description: "Your topic has been added to the meeting.",
      });

      resetForm();
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
  const groupedByWeek: Record<string, { weekStart: Date; items: any[] }> = items.reduce((acc, item) => {
    const createdDate = new Date(item.created_at);
    const weekStart = startOfWeek(createdDate, { weekStartsOn: 0 }); // Sunday
    const weekKey = weekStart.toISOString();
    
    if (!acc[weekKey]) {
      acc[weekKey] = {
        weekStart,
        items: [],
      };
    }
    
    acc[weekKey].items.push(item);
    return acc;
  }, {} as Record<string, { weekStart: Date; items: any[] }>);

  // Sort weeks descending (newest first)
  const sortedWeeks = Object.entries(groupedByWeek).sort(
    ([keyA], [keyB]) => new Date(keyB).getTime() - new Date(keyA).getTime()
  );

  const getWeekHeader = (weekStart: Date) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    const weekNumber = getWeek(weekStart);
    const startStr = format(weekStart, "MMMM d");
    const endStr = format(weekEnd, "MMMM d");
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

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 grid grid-cols-[40px_2fr_200px_2fr_80px] gap-4 text-sm font-medium text-muted-foreground">
                <div></div>
                <div>Topic</div>
                <div>Who</div>
                <div>Desired Outcome</div>
                <div></div>
              </div>
              
              {weekItems.map((item) => (
                <div
                  key={item.id}
                  className="px-4 py-3 grid grid-cols-[40px_2fr_200px_2fr_80px] gap-4 items-center border-t hover:bg-muted/30 transition-colors"
                >
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={() => handleToggleComplete(item.id, item.is_completed)}
                  />
                  
                  <div className={`font-medium ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
                    {item.title}
                  </div>

                  <div>
                    <Select 
                      value={item.assigned_to || "none"} 
                      onValueChange={(value) => handleChangeAssignment(item.id, value === "none" ? null : value)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Assign to...">
                          {item.assigned_to_profile ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={item.assigned_to_profile.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {item.assigned_to_profile.full_name?.charAt(0) || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">
                                {(() => {
                                  const names = item.assigned_to_profile.full_name?.split(" ") || [];
                                  const firstName = names[0] || "";
                                  const lastInitial = names.length > 1 ? names[names.length - 1].charAt(0) + "." : "";
                                  return `${firstName} ${lastInitial}`.trim();
                                })()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="none">Unassigned</SelectItem>
                        {members.map((member) => {
                          const names = member.profiles?.full_name?.split(" ") || [];
                          const firstName = names[0] || "";
                          const lastInitial = names.length > 1 ? names[names.length - 1].charAt(0) + "." : "";
                          const displayName = `${firstName} ${lastInitial}`.trim();
                          
                          return (
                            <SelectItem key={member.user_id} value={member.user_id}>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-5 w-5">
                                  <AvatarImage src={member.profiles?.avatar_url} />
                                  <AvatarFallback className="text-xs">
                                    {member.profiles?.full_name?.charAt(0) || "?"}
                                  </AvatarFallback>
                                </Avatar>
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
                    defaultValue={item.outcome || ""}
                    onBlur={(e) => handleUpdateOutcome(item.id, e.target.value)}
                    className="h-8 text-sm"
                  />

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedItem({ id: item.id, title: item.title })}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Inline creation row */}
              {isCreating && (
                <div className="px-4 py-3 grid grid-cols-[40px_2fr_200px_2fr_80px] gap-4 items-center border-t bg-primary/5">
                  <div></div>
                  
                  <Input
                    placeholder="Topic title *"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                    className="h-8"
                  />

                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {members.map((member) => {
                        const names = member.profiles?.full_name?.split(" ") || [];
                        const firstName = names[0] || "";
                        const lastInitial = names.length > 1 ? names[names.length - 1].charAt(0) + "." : "";
                        const displayName = `${firstName} ${lastInitial}`.trim();
                        
                        return (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={member.profiles?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {member.profiles?.full_name?.charAt(0) || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span>{displayName}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Desired outcome..."
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    className="h-8"
                  />

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={resetForm}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleCreateTopic}
                      disabled={loading || !title.trim()}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {items.length === 0 && !isCreating && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            <p className="text-sm">No topics yet. Click "Add Topic" to create one.</p>
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
    </>
  );
};

export default MeetingTopics;
