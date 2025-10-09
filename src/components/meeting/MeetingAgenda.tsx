import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PersonalityHoverCard } from "@/components/PersonalityHoverCard";

interface MeetingAgendaProps {
  items: any[];
  meetingId: string;
  onUpdate: () => void;
}

const MeetingAgenda = ({ items, meetingId, onUpdate }: MeetingAgendaProps) => {
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

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-all"
        >
          <Checkbox
            checked={item.is_completed}
            onCheckedChange={() => handleToggleComplete(item.id, item.is_completed)}
          />
          <div className="flex-1">
            <p className={`font-medium ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
              {item.title}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {item.assigned_to_profile && (
              <PersonalityHoverCard
                name={item.assigned_to_profile.full_name}
                red={item.assigned_to_profile.red_percentage}
                blue={item.assigned_to_profile.blue_percentage}
                green={item.assigned_to_profile.green_percentage}
                yellow={item.assigned_to_profile.yellow_percentage}
              >
                <div className="flex items-center gap-2 cursor-pointer">
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
              </PersonalityHoverCard>
            )}
            {item.time_minutes && (
              <span className="text-sm text-muted-foreground">
                {item.time_minutes} min
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MeetingAgenda;
