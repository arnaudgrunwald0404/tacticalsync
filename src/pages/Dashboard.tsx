import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, LogOut, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);

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

    // Fetch member counts for each team
    const teamsWithCounts = await Promise.all(
      (data || []).map(async (teamMember) => {
        const { count } = await supabase
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("team_id", teamMember.teams.id);

        return {
          ...teamMember,
          memberCount: count || 0,
        };
      })
    );

    setTeams(teamsWithCounts);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleCreateTeam = () => {
    navigate("/create-team");
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
            Weekly Tactical
          </h1>
          <div className="flex items-center gap-2">
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
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Your Teams</h2>
          <p className="text-muted-foreground">
            Manage your weekly tactical meetings and collaborate with your teams
          </p>
        </div>

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
                Start a new weekly tactical team
              </p>
            </CardContent>
          </Card>

          {teams.map((teamMember) => (
            <Card
              key={teamMember.id}
              className="hover:shadow-large transition-all cursor-pointer group"
              onClick={() => navigate(`/team/${teamMember.teams.id}`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  {teamMember.teams.name}
                </CardTitle>
                <CardDescription>
                  {teamMember.role === "admin" ? "Team Admin" : "Team Member"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Members:</span>
                  <span className="font-medium">{teamMember.memberCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Created:</span>
                  <span className="font-medium">
                    {new Date(teamMember.teams.created_at).toLocaleDateString()}
                  </span>
                </div>
                <Button variant="default" className="w-full group-hover:bg-primary/90">
                  View Meeting →
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {teams.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              You haven't joined any teams yet. Create one to get started!
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
