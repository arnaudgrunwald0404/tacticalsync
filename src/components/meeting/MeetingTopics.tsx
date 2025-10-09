import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MeetingTopicsProps {
  items: any[];
  meetingId: string;
  onUpdate: () => void;
}

const MeetingTopics = ({ items, meetingId, onUpdate }: MeetingTopicsProps) => {
  const { toast } = useToast();

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

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No topics yet. Click "Add Topic" to create one.</p>
      </div>
    );
  }

  return (
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
              <Button variant="ghost" size="icon">
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
  );
};

export default MeetingTopics;
