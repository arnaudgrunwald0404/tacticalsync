import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";

const CreateTeam = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState("");
  const [abbreviatedName, setAbbreviatedName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please sign in to create a team",
          variant: "destructive",
        });
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate, toast]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get fresh session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) throw sessionError;
      if (!session) {
        toast({
          title: "Session expired",
          description: "Please sign in again",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const userId = session.user.id;

      // Create team
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({ 
          name: teamName,
          abbreviated_name: abbreviatedName || null,
          created_by: userId 
        })
        .select()
        .single();

      if (teamError) {
        console.error("Team creation error:", teamError);
        throw new Error(teamError.message);
      }

      // Add creator as admin
      const { error: memberError } = await supabase
        .from("team_members")
        .insert({
          team_id: team.id,
          user_id: userId,
          role: "admin",
        });

      if (memberError) {
        console.error("Member creation error:", memberError);
        throw new Error(memberError.message);
      }

      toast({
        title: "Team created!",
        description: "Your team has been created successfully.",
      });

      navigate(`/team/${team.id}/invite`);
    } catch (error: unknown) {
      console.error("Full error:", error);
      toast({
        title: "Error creating team",
        description: error instanceof Error ? error.message : "An error occurred" || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="minimal" size="lg" />
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Create New Team</CardTitle>
            <CardDescription>
              Set up a new team for your tactical meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamName">Team Name</Label>
                <Input
                  id="teamName"
                  placeholder="e.g., Executive Leadership Team"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  required
                />

              </div>

              <div className="space-y-2">
                <Label htmlFor="abbreviatedName">Short Name (Optional)</Label>
                <Input
                  id="abbreviatedName"
                  placeholder="e.g., ELT"
                  value={abbreviatedName}
                  onChange={(e) => setAbbreviatedName(e.target.value)}
                  maxLength={10}
                />

              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Creating..." : "Create Team"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </GridBackground>
  );
};

export default CreateTeam;
