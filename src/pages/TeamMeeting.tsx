import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Settings, Link as LinkIcon, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MeetingAgenda from "@/components/meeting/MeetingAgenda";
import MeetingTopics from "@/components/meeting/MeetingTopics";
import { format, getWeek, addDays } from "date-fns";

const STATIC_AGENDA = [
  "Opening comments",
  "Review last week's item",
  "Calendar Review",
  "Lightning Round",
  "ELT Scorecard",
  "Employees At-Risk",
];

const TeamMeeting = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [meeting, setMeeting] = useState<any>(null);
  const [allMeetings, setAllMeetings] = useState<any[]>([]);
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

        // Fetch previous meeting to copy values
        const { data: previousMeetings } = await supabase
          .from("weekly_meetings")
          .select(`
            id,
            meeting_items!inner(
              title,
              assigned_to,
              time_minutes,
              type,
              order_index
            )
          `)
          .eq("team_id", teamId)
          .neq("id", newMeeting.id)
          .order("week_start_date", { ascending: false })
          .limit(1);

        const previousItems = previousMeetings?.[0]?.meeting_items || [];
        const itemsMap = new Map(
          previousItems
            .filter((item: any) => item.type === "agenda")
            .map((item: any) => [item.title, item])
        );

        // Create static agenda items with values from previous meeting
        const userId = (await supabase.auth.getUser()).data.user?.id;
        for (let i = 0; i < STATIC_AGENDA.length; i++) {
          const previousItem = itemsMap.get(STATIC_AGENDA[i]);
          await supabase.from("meeting_items").insert({
            meeting_id: newMeeting.id,
            type: "agenda",
            title: STATIC_AGENDA[i],
            order_index: i,
            created_by: userId,
            assigned_to: previousItem?.assigned_to || null,
            time_minutes: previousItem?.time_minutes || null,
          });
        }
      } else if (meetingError) {
        throw meetingError;
      }

      setMeeting(meetingData);
      await fetchAllMeetings(teamId);
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

  const fetchAllMeetings = async (teamId: string) => {
    const { data, error } = await supabase
      .from("weekly_meetings")
      .select("*")
      .eq("team_id", teamId)
      .order("week_start_date", { ascending: false });

    if (error) {
      console.error("Error fetching meetings:", error);
      return;
    }

    setAllMeetings(data || []);
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

  const getFrequencyLabel = () => {
    const freq = team?.frequency || "weekly";
    return freq.charAt(0).toUpperCase() + freq.slice(1);
  };

  const getMeetingPeriodLabel = (weekStartDate: string) => {
    const monday = new Date(weekStartDate);
    const frequency = team?.frequency || "weekly";
    
    let endDate: Date;
    let periodType: string;
    
    switch (frequency) {
      case "daily":
        endDate = monday;
        periodType = "Day";
        break;
      case "bi-weekly":
        endDate = addDays(monday, 11); // 2 weeks - 1 day
        periodType = "Weeks";
        break;
      case "monthly":
        endDate = addDays(monday, 27); // ~4 weeks
        periodType = "Month";
        break;
      default: // weekly
        endDate = addDays(monday, 4);
        periodType = "Week";
        break;
    }
    
    const weekNumber = getWeek(monday);
    const dateRange = `${format(monday, 'M/d')} - ${format(endDate, 'M/d')}`;
    
    return `${periodType} ${weekNumber} (${dateRange})`;
  };

  const handleMeetingChange = async (meetingId: string) => {
    const selectedMeeting = allMeetings.find(m => m.id === meetingId);
    if (selectedMeeting) {
      setMeeting(selectedMeeting);
      await fetchMeetingItems(selectedMeeting.id);
    }
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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                {team?.name} {getFrequencyLabel()} Tactical
              </h1>
              {meeting && allMeetings.length > 0 && (
                <Select value={meeting.id} onValueChange={handleMeetingChange}>
                  <SelectTrigger className="w-[240px] h-9">
                    <SelectValue>
                      {getMeetingPeriodLabel(meeting.week_start_date)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {allMeetings.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {getMeetingPeriodLabel(m.week_start_date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
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
            teamId={teamId}
            onUpdate={() => fetchMeetingItems(meeting?.id)}
          />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Topics</h2>
            <Button 
              onClick={() => (window as any).__startCreatingTopic?.()}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Topic
            </Button>
          </div>
          <MeetingTopics
            items={topicItems}
            meetingId={meeting?.id}
            teamId={teamId}
            onUpdate={() => fetchMeetingItems(meeting?.id)}
            onAddTopic={() => {}}
          />
        </Card>
      </main>
    </div>
  );
};

export default TeamMeeting;
