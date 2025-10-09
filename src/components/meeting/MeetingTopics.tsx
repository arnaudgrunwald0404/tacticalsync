import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Trash2, Check, X, Plus, UserCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CommentsDialog from "./CommentsDialog";
import { startOfWeek, endOfWeek, format, getWeek } from "date-fns";
import { PersonalityHoverCard } from "@/components/PersonalityHoverCard";

interface MeetingTopicsProps {
  items: any[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
}

const MeetingTopics = ({ items, meetingId, teamId, onUpdate }: MeetingTopicsProps) => {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // New topic form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("");

  useEffect(() => {
    if (teamId) {
      fetchMembers();
    }
  }, [teamId]);

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
    setDescription("");
    setOutcome("");
    setAssignedTo("");
    setTimeMinutes("");
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
        description: description.trim() || null,
        outcome: outcome.trim() || null,
        assigned_to: assignedTo || null,
        time_minutes: timeMinutes ? parseInt(timeMinutes) : null,
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
      <div className="space-y-6">
        {sortedWeeks.map(([weekKey, { weekStart, items: weekItems }]) => (
          <div key={weekKey} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {getWeekHeader(weekStart)}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>

            {weekItems.map((item) => (
        <div
          key={item.id}
          className="p-4 rounded-lg border bg-card hover:shadow-medium transition-all space-y-3"
        >
          <div className="flex items-start gap-4">
            <Checkbox
              checked={item.is_completed}
              onCheckedChange={() => handleToggleComplete(item.id, item.is_completed)}
              className="mt-1"
            />
            <div className="flex-1 space-y-2">
              <h3 className={`font-semibold ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
                {item.title}
              </h3>
              {item.description && (
                <p className="text-sm text-muted-foreground">{item.description}</p>
              )}
              {item.outcome && (
                <div className="p-3 rounded bg-muted/50">
                  <p className="text-sm font-medium mb-1">Outcome:</p>
                  <p className="text-sm">{item.outcome}</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  {item.assigned_to_profile ? (
                    <PersonalityHoverCard
                      name={item.assigned_to_profile.full_name}
                      red={item.assigned_to_profile.red_percentage}
                      blue={item.assigned_to_profile.blue_percentage}
                      green={item.assigned_to_profile.green_percentage}
                      yellow={item.assigned_to_profile.yellow_percentage}
                    >
                      <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={item.assigned_to_profile.avatar_url} />
                          <AvatarFallback>
                            {item.assigned_to_profile.full_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground">
                          {item.assigned_to_profile.full_name}
                        </span>
                      </button>
                    </PersonalityHoverCard>
                  ) : (
                    <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                      <UserCircle className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Unassigned</span>
                    </button>
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="end">
                  <div className="space-y-1">
                    <button
                      onClick={() => handleChangeAssignment(item.id, null)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-muted text-left text-sm"
                    >
                      <UserCircle className="h-4 w-4" />
                      <span>Unassigned</span>
                    </button>
                    {members.map((member) => (
                      <PersonalityHoverCard
                        key={member.user_id}
                        name={member.profiles?.full_name || "Unknown"}
                        red={member.profiles?.red_percentage}
                        blue={member.profiles?.blue_percentage}
                        green={member.profiles?.green_percentage}
                        yellow={member.profiles?.yellow_percentage}
                      >
                        <button
                          onClick={() => handleChangeAssignment(item.id, member.user_id)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-muted text-left text-sm"
                        >
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={member.profiles?.avatar_url} />
                            <AvatarFallback className="text-xs">
                              {member.profiles?.full_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span>{member.profiles?.full_name || "Unknown"}</span>
                        </button>
                      </PersonalityHoverCard>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {item.time_minutes && (
                <span className="text-sm text-muted-foreground">
                  {item.time_minutes} min
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedItem({ id: item.id, title: item.title })}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      ))}
          </div>
        ))}

        {/* Inline topic creation row */}
        {isCreating ? (
          <div className="p-4 rounded-lg border-2 border-primary bg-card space-y-3">
            <div className="space-y-3">
              <Input
                placeholder="Topic title *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
              <Textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
              <Textarea
                placeholder="Desired outcome (optional)"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.profiles?.full_name || "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Minutes"
                  value={timeMinutes}
                  onChange={(e) => setTimeMinutes(e.target.value)}
                  className="w-24"
                  min="1"
                  max="60"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetForm}
                disabled={loading}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateTopic}
                disabled={loading || !title.trim()}
              >
                <Check className="h-4 w-4 mr-1" />
                {loading ? "Adding..." : "Add Topic"}
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={startCreating}
            className="w-full p-4 rounded-lg border-2 border-dashed border-muted hover:border-primary hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add new topic
          </button>
        )}

        {items.length === 0 && !isCreating && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No topics yet. Click above to add one.</p>
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
