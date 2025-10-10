import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PersonalityHoverCard } from "@/components/PersonalityHoverCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";

interface MeetingAgendaProps {
  items: any[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
}

const MeetingAgenda = ({ items, meetingId, teamId, onUpdate }: MeetingAgendaProps) => {
  const { toast } = useToast();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  useEffect(() => {
    fetchTeamMembers();
  }, [teamId]);

  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(full_name, avatar_url, red_percentage, blue_percentage, green_percentage, yellow_percentage)
      `)
      .eq("team_id", teamId);

    if (error) {
      console.error("Error fetching team members:", error);
      return;
    }

    setTeamMembers(data || []);
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

  const handleUpdateAssignedTo = async (itemId: string, userId: string | null) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ assigned_to: userId })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update assignment",
        variant: "destructive",
      });
      return;
    }

    onUpdate();
  };

  const handleUpdateTime = async (itemId: string, minutes: string) => {
    const timeValue = minutes ? parseInt(minutes) : null;
    
    // Validate that time is a positive whole number
    if (timeValue !== null && (timeValue < 0 || !Number.isInteger(timeValue))) {
      toast({
        title: "Invalid time",
        description: "Time must be a positive whole number",
        variant: "destructive",
      });
      return;
    }
    
    const { error } = await supabase
      .from("meeting_items")
      .update({ time_minutes: timeValue })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update time",
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
            <TableRow key={item.id}>
              <TableCell className="py-2">
                <Checkbox
                  checked={item.is_completed}
                  onCheckedChange={() => handleToggleComplete(item.id, item.is_completed)}
                />
              </TableCell>
              <TableCell className="py-2 font-medium">
                {item.title}
              </TableCell>
              <TableCell className="py-2">
                <Select
                  value={item.assigned_to || "none"}
                  onValueChange={(value) => handleUpdateAssignedTo(item.id, value === "none" ? null : value)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Assign to...">
                      {item.assigned_to_profile ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={item.assigned_to_profile.avatar_url} />
                            <AvatarFallback className="text-xs">
                              {item.assigned_to_profile.full_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">
                            {item.assigned_to_profile.full_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Assign to...</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={member.profiles?.avatar_url} />
                            <AvatarFallback className="text-xs">
                              {member.profiles?.full_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span>{member.profiles?.full_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="py-2">
                <Input
                  type="number"
                  placeholder="Min"
                  defaultValue={item.time_minutes || ""}
                  onBlur={(e) => handleUpdateTime(item.id, e.target.value)}
                  className="h-8 text-sm w-20"
                  min="0"
                  step="1"
                />
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
