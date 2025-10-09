import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Settings, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MeetingAgenda from "@/components/meeting/MeetingAgenda";
import MeetingTopics from "@/components/meeting/MeetingTopics";

const STATIC_AGENDA = [
  "Opening comments",
  "Action item accountability",
  "Last weeks items",
  "Rest of the year calendar review",
  "Lightning round",
  "Employee ELT scorecard and employee at risk",
];

const TeamMeeting = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [meeting, setMeeting] = useState<any>(null);
  const [agendaItems, setAgendaItems] = useState<any[]>([]);
  const [topicItems, setTopicItems] = useState<any[]>([]);

  useEffect(() => {
    if (teamId) {
      fetchTeamAndMeeting();
    }
  }, [teamId]);

  const fetchTeamAndMeeting = async () => {
    try {
      // Fetch team
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single();

      if (teamError) throw teamError;
      setTeam(teamData);

      // Get or create current week's meeting
      const today = new Date();
      const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
      const weekStartStr = weekStart.toISOString().split("T")[0];

      let { data: meetingData, error: meetingError } = await supabase
        .from("weekly_meetings")
        .select("*")
        .eq("team_id", teamId)
        .eq("week_start_date", weekStartStr)
        .single();

      if (meetingError && meetingError.code === "PGRST116") {
        // Create new meeting
        const { data: newMeeting, error: createError } = await supabase
          .from("weekly_meetings")
          .insert({ team_id: teamId, week_start_date: weekStartStr })
          .select()
          .single();

        if (createError) throw createError;
        meetingData = newMeeting;

        // Create static agenda items
        for (let i = 0; i < STATIC_AGENDA.length; i++) {
          await supabase.from("meeting_items").insert({
            meeting_id: newMeeting.id,
            type: "agenda",
            title: STATIC_AGENDA[i],
            order_index: i,
            created_by: (await supabase.auth.getUser()).data.user?.id,
          });
        }
      } else if (meetingError) {
        throw meetingError;
      }

      setMeeting(meetingData);
      await fetchMeetingItems(meetingData.id);
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

  const fetchMeetingItems = async (meetingId: string) => {
    const { data, error } = await supabase
      .from("meeting_items")
      .select(`
        *,
        assigned_to_profile:assigned_to(full_name, avatar_url, red_percentage, blue_percentage, green_percentage, yellow_percentage),
        created_by_profile:created_by(full_name, avatar_url, red_percentage, blue_percentage, green_percentage, yellow_percentage)
      `)
      .eq("meeting_id", meetingId)
      .order("order_index");

    if (error) {
      console.error("Error fetching items:", error);
      return;
    }

    setAgendaItems(data.filter((item) => item.type === "agenda"));
    setTopicItems(data.filter((item) => item.type === "topic"));
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/join/${team.invite_code}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "Invite link copied!",
      description: "Share this link with team members to invite them.",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">
              {team?.name} Weekly Tactical
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={copyInviteLink}>
              <LinkIcon className="h-4 w-4 mr-2" />
              Copy Invite Link
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate(`/team/${teamId}/settings`)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Agenda</h2>
          </div>
          <MeetingAgenda
            items={agendaItems}
            meetingId={meeting?.id}
            onUpdate={() => fetchMeetingItems(meeting?.id)}
          />
        </Card>

        <Card className="p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Topics</h2>
          </div>
          <MeetingTopics
            items={topicItems}
            meetingId={meeting?.id}
            teamId={teamId}
            onUpdate={() => fetchMeetingItems(meeting?.id)}
          />
        </Card>
      </main>
    </div>
  );
};

export default TeamMeeting;
