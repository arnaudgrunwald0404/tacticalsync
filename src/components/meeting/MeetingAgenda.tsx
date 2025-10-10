import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PersonalityHoverCard } from "@/components/PersonalityHoverCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

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

  const handleUpdateNotes = async (itemId: string, notes: string) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ notes })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update notes",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="w-[200px]">Who</TableHead>
            <TableHead className="w-[100px]">Time</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="h-12">
              <TableCell className="py-2">
                <Checkbox
                  checked={item.is_completed}
                  onCheckedChange={() => handleToggleComplete(item.id, item.is_completed)}
                />
              </TableCell>
              <TableCell className={`py-2 font-medium ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
                {item.title}
              </TableCell>
              <TableCell className="py-2">
                {item.assigned_to_profile && (
                  <PersonalityHoverCard
                    name={item.assigned_to_profile.full_name}
                    red={item.assigned_to_profile.red_percentage}
                    blue={item.assigned_to_profile.blue_percentage}
                    green={item.assigned_to_profile.green_percentage}
                    yellow={item.assigned_to_profile.yellow_percentage}
                  >
                    <div className="flex items-center gap-2 cursor-pointer">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={item.assigned_to_profile.avatar_url} />
                        <AvatarFallback className="text-xs">
                          {item.assigned_to_profile.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">
                        {item.assigned_to_profile.full_name}
                      </span>
                    </div>
                  </PersonalityHoverCard>
                )}
              </TableCell>
              <TableCell className="py-2">
                <span className="text-sm">
                  {item.time_minutes ? `${item.time_minutes} min` : "-"}
                </span>
              </TableCell>
              <TableCell className="py-2">
                <Input
                  placeholder="Add notes..."
                  defaultValue={item.notes || ""}
                  onBlur={(e) => handleUpdateNotes(item.id, e.target.value)}
                  className="h-8 text-sm"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default MeetingAgenda;
