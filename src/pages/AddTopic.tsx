import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AddTopic = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("");

  useEffect(() => {
    if (teamId) {
      fetchData();
    }
  }, [teamId]);

  const fetchData = async () => {
    try {
      // Get current meeting
      const today = new Date();
      const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
      const weekStartStr = weekStart.toISOString().split("T")[0];

      const { data: meetingData } = await supabase
        .from("weekly_meetings")
        .select("id")
        .eq("team_id", teamId)
        .eq("week_start_date", weekStartStr)
        .single();

      if (meetingData) {
        setMeetingId(meetingData.id);
      }

      // Fetch team members
      const { data: membersData } = await supabase
        .from("team_members")
        .select(`
          id,
          user_id,
          profiles:user_id(id, full_name)
        `)
        .eq("team_id", teamId);

      setMembers(membersData || []);
    } catch (error: any) {
      console.error("Error fetching data:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!meetingId) {
      toast({
        title: "Error",
        description: "No active meeting found",
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
      const { data: existingItems } = await supabase
        .from("meeting_items")
        .select("order_index")
        .eq("meeting_id", meetingId)
        .eq("type", "topic")
        .order("order_index", { ascending: false })
        .limit(1);

      const nextOrder = existingItems && existingItems.length > 0 
        ? existingItems[0].order_index + 1 
        : 0;

      const { error } = await supabase.from("meeting_items").insert({
        meeting_id: meetingId,
        type: "topic",
        title,
        description: description || null,
        outcome: outcome || null,
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

      navigate(`/team/${teamId}`);
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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate(`/team/${teamId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Meeting
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Add New Topic</CardTitle>
            <CardDescription>
              Create a new discussion topic for this week's meeting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Topic Title *</Label>
                <Input
                  id="title"
                  placeholder="What would you like to discuss?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Provide context and background information..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  Help the team understand what needs to be discussed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="outcome">Desired Outcome</Label>
                <Textarea
                  id="outcome"
                  placeholder="What decision or action do you hope to achieve?"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  Define what success looks like for this discussion
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="assigned">Assign To</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger id="assigned">
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.profiles?.full_name || "Unknown"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time">Time (minutes)</Label>
                  <Input
                    id="time"
                    type="number"
                    placeholder="5"
                    value={timeMinutes}
                    onChange={(e) => setTimeMinutes(e.target.value)}
                    min="1"
                    max="60"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Adding..." : "Add Topic"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AddTopic;