import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";

interface TeamTopicsProps {
  items: any[];
  meetingId: string;
  teamId: string;
  teamName: string;
  onUpdate: () => void;
}

interface TeamMember {
  user_id: string;
  profiles?: {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    avatar_url?: string;
    avatar_name?: string;
  };
}

const TeamTopics = ({ items, meetingId, teamId, teamName, onUpdate }: TeamTopicsProps) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [newTopic, setNewTopic] = useState({
    title: "",
    assigned_to: "",
    time_minutes: 5,
    notes: ""
  });
  const [adding, setAdding] = useState(false);

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
        profiles:user_id(id, full_name, first_name, last_name, email, avatar_url, avatar_name)
      `)
      .eq("team_id", teamId);
    
    setMembers(data || []);
  };

  const handleAdd = async () => {
    if (!newTopic.title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic title",
        variant: "destructive",
      });
      return;
    }

    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("meeting_items")
        .insert({
          meeting_id: meetingId,
          type: "team_topic",
          title: newTopic.title,
          assigned_to: newTopic.assigned_to || null,
          time_minutes: newTopic.time_minutes,
          notes: newTopic.notes || null,
          order_index: items.length,
          created_by: user.id,
        });

      if (error) throw error;

      toast({
        title: "Topic added!",
        description: "The team topic has been added to the meeting",
      });

      // Reset form
      setNewTopic({
        title: "",
        assigned_to: "",
        time_minutes: 5,
        notes: ""
      });

      onUpdate();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add topic",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    const { error } = await supabase
      .from("meeting_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete topic",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Topic deleted",
      description: "The team topic has been removed",
    });

    onUpdate();
  };

  const getDisplayName = (member: TeamMember) => {
    const firstName = member.profiles?.first_name || "";
    const lastName = member.profiles?.last_name || "";
    const email = member.profiles?.email || "";
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else {
      return email;
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing Topics */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const assignedMember = members.find(m => m.user_id === item.assigned_to);
            const displayName = assignedMember ? getDisplayName(assignedMember) : "Unassigned";

            return (
              <div key={item.id} className="border rounded-lg p-4 bg-white space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.title}</p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>👤 {displayName}</span>
                  <span>⏱️ {item.time_minutes} min</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Topic Form */}
      <div className="border-2 border-dashed rounded-lg p-4 space-y-3 bg-muted/20">
        <h4 className="text-sm font-medium text-muted-foreground">Add New Topic</h4>
        
        {/* Desktop Layout */}
        <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_100px_80px] gap-3 items-start">
          <div>
            <Input
              placeholder="Topic title..."
              value={newTopic.title}
              onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
              className="h-10"
            />
          </div>
          <div>
            <Select
              value={newTopic.assigned_to}
              onValueChange={(value) => setNewTopic({ ...newTopic, assigned_to: value })}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Who?" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {getDisplayName(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input
              type="number"
              placeholder="Duration"
              value={newTopic.time_minutes}
              onChange={(e) => setNewTopic({ ...newTopic, time_minutes: parseInt(e.target.value) || 5 })}
              className="h-10"
              min="1"
              max="60"
            />
          </div>
          <div>
            <Button
              onClick={handleAdd}
              disabled={adding || !newTopic.title.trim()}
              className="h-10 w-full"
              size="sm"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="sm:hidden space-y-3">
          <Input
            placeholder="Topic title..."
            value={newTopic.title}
            onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
            className="h-10"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={newTopic.assigned_to}
              onValueChange={(value) => setNewTopic({ ...newTopic, assigned_to: value })}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Who?" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {getDisplayName(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Minutes"
              value={newTopic.time_minutes}
              onChange={(e) => setNewTopic({ ...newTopic, time_minutes: parseInt(e.target.value) || 5 })}
              className="h-10"
              min="1"
              max="60"
            />
          </div>
          <Textarea
            placeholder="Notes (optional)..."
            value={newTopic.notes}
            onChange={(e) => setNewTopic({ ...newTopic, notes: e.target.value })}
            className="min-h-[60px] text-sm"
          />
          <Button
            onClick={handleAdd}
            disabled={adding || !newTopic.title.trim()}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Topic
          </Button>
        </div>

        {/* Notes field for desktop */}
        <div className="hidden sm:block">
          <Textarea
            placeholder="Notes (optional)..."
            value={newTopic.notes}
            onChange={(e) => setNewTopic({ ...newTopic, notes: e.target.value })}
            className="min-h-[60px] text-sm"
          />
        </div>
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No team topics yet. Add one above to get started.</p>
        </div>
      )}
    </div>
  );
};

export default TeamTopics;

