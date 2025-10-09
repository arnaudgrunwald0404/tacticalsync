import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Trash2, Check, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CommentsDialog from "./CommentsDialog";

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
        profiles:user_id(id, full_name)
      `)
      .eq("team_id", teamId);
    
    setMembers(data || []);
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

  return (
    <>
      <div className="space-y-4">
        {items.map((item) => (
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
              {item.assigned_to_profile && (
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={item.assigned_to_profile.avatar_url} />
                    <AvatarFallback>
                      {item.assigned_to_profile.full_name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">
                    {item.assigned_to_profile.full_name}
                  </span>
                </div>
              )}
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
            onClick={() => setIsCreating(true)}
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
