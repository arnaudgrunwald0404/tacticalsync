import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, LogOut, User, Edit2, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<Record<string, any[]>>({});

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    await fetchTeams();
    setLoading(false);
  };

  const fetchTeams = async () => {
    const { data: userData } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from("team_members")
      .select(`
        *,
        teams:team_id (
          id,
          name,
          created_at,
          invite_code
        )
      `)
      .eq("user_id", userData.user?.id);

    if (error) {
      console.error("Error fetching teams:", error);
      return;
    }

    // Fetch member counts and meetings for each team
    const teamsWithData = await Promise.all(
      (data || []).map(async (teamMember) => {
        const { count } = await supabase
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("team_id", teamMember.teams.id);

        // Fetch recurring meetings for this team
        const { data: teamMeetings } = await supabase
          .from("recurring_meetings")
          .select("*")
          .eq("team_id", teamMember.teams.id)
          .order("created_at", { ascending: true });

        return {
          ...teamMember,
          memberCount: count || 0,
          meetings: teamMeetings || [],
        };
      })
    );

    setTeams(teamsWithData);

    // Organize meetings by team
    const meetingsByTeam: Record<string, any[]> = {};
    teamsWithData.forEach((team) => {
      meetingsByTeam[team.teams.id] = team.meetings;
    });
    setMeetings(meetingsByTeam);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleCreateTeam = () => {
    navigate("/create-team");
  };

  const handleCreateMeeting = (teamId: string) => {
    navigate(`/team/${teamId}/setup-meeting`);
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
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Tactical Mastery
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="ghost" onClick={() => navigate("/profile")}>
              <User className="h-4 w-4 mr-2" />
              Profile
            </Button>
            <Button variant="ghost" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Your Teams</h2>
            <p className="text-muted-foreground">
              Manage your tactical meetings and collaborate with your teams
            </p>
          </div>
          {teams.length > 0 && (
            <Button variant="outline" onClick={handleCreateTeam}>
              <Plus className="h-4 w-4 mr-2" />
              Create New Team
            </Button>
          )}
        </div>

        {teams.length === 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card
              className="border-dashed border-2 hover:border-primary transition-all cursor-pointer group"
              onClick={handleCreateTeam}
            >
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-primary/10 p-4 mb-4 group-hover:bg-primary/20 transition-all">
                  <Plus className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Create New Team</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Start a new tactical meeting
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-8">
            {teams.map((teamMember) => {
              const teamMeetings = meetings[teamMember.teams.id] || [];
              const hasNoMeetings = teamMeetings.length === 0;

              return (
                <div key={teamMember.id} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-primary" />
                          <h3 className="text-xl font-bold">
                            {teamMember.teams.name}
                          </h3>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => navigate(`/team/${teamMember.teams.id}/invite?fromDashboard=true`)}
                          >
                            <Edit2 className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground ml-7">
                          {teamMember.memberCount} member{teamMember.memberCount !== 1 ? 's' : ''} · {teamMember.role === "admin" ? "Admin" : "Member"}
                        </p>
                      </div>
                    </div>
                    {!hasNoMeetings && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleCreateMeeting(teamMember.teams.id)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Recurring Meeting
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {hasNoMeetings ? (
                      <Card
                        className="border-dashed border-2 hover:border-primary transition-all cursor-pointer group"
                        onClick={() => handleCreateMeeting(teamMember.teams.id)}
                      >
                        <CardContent className="flex flex-col items-center justify-center py-8">
                          <div className="rounded-full bg-primary/10 p-3 mb-3 group-hover:bg-primary/20 transition-all">
                            <Plus className="h-6 w-6 text-primary" />
                          </div>
                          <h4 className="text-sm font-semibold mb-1">Create First Meeting</h4>
                          <p className="text-xs text-muted-foreground text-center">
                            Set up a recurring meeting
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      teamMeetings.map((meeting) => (
                        <Card
                          key={meeting.id}
                          className="hover:shadow-large transition-all cursor-pointer group"
                          onClick={() => navigate(`/team/${teamMember.teams.id}/meeting/${meeting.id}`)}
                        >
                          <CardHeader>
                            <CardTitle className="text-base">{meeting.name}</CardTitle>
                            <CardDescription className="capitalize">
                              {meeting.frequency.replace('-', ' ')}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <Button variant="default" size="sm" className="w-full group-hover:bg-primary/90">
                              Open Recurring Meeting →
                            </Button>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
