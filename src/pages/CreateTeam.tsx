import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { useRoles } from "@/hooks/useRoles";

const CreateTeam = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const { isAdmin, isSuperAdmin, loading: rolesLoading } = useRoles();

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    
    setLoading(true);

    try {
      // First, refresh the session to ensure we have a valid token
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error("Failed to refresh session:", refreshError);
        toast({
          title: "Session expired",
          description: "Please sign in again",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "Please sign in again",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      console.log("Creating team with user:", user.id);

      // Create team
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({ 
          name: teamName.trim(),
          created_by: user.id 
        })
        .select()
        .single();

      if (teamError) {
        console.error("Team creation error:", teamError);
        throw teamError;
      }

      console.log("Team created:", team.id);

      // Add creator as admin
      const { error: memberError } = await supabase
        .from("team_members")
        .insert({
          team_id: team.id,
          user_id: user.id,
          role: "admin",
        });

      if (memberError) {
        console.error("Team member creation error:", memberError);
        throw memberError;
      }

      console.log("Team member added successfully");

      toast({
        title: "Team created!",
        description: "Your team has been created successfully.",
      });

      navigate(`/team/${team.id}/invite`);
    } catch (error: unknown) {
      console.error("Full error:", error);
      toast({
        title: "Error creating team",
        description: error instanceof Error ? error.message : "Failed to create team",
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
            Back
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create New Team</CardTitle>
          </CardHeader>
          <CardContent>
            {rolesLoading ? (
              <div className="text-sm text-muted-foreground">Loading permissions...</div>
            ) : isAdmin || isSuperAdmin ? (
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="teamName">Team Name</Label>
                  <Input
                    id="teamName"
                    placeholder="Enter your team name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" disabled={loading || !teamName.trim()} className="w-full">
                  {loading ? "Creating..." : "Create Team"}
                </Button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  You don’t have permission to create teams. Please contact a super admin to grant you admin access.
                </div>
                <div>
                  <Button variant="secondary" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </GridBackground>
  );
};

export default CreateTeam;