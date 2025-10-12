import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";

const JoinTeam = () => {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    handleInvite();
  }, [inviteCode]);

  const handleInvite = async () => {
    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Store invite code in localStorage before redirecting
        if (inviteCode) {
          localStorage.setItem('pendingInviteCode', inviteCode);
        }
        // Redirect to auth page with invite code
        navigate(`/auth?invite=${inviteCode}`);
        return;
      }

      // Look up team by invite code
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id, name")
        .eq("invite_code", inviteCode)
        .single();

      if (teamError || !team) {
        toast({
          title: "Invalid invite code",
          description: "This invite link is not valid",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", team.id)
        .eq("user_id", user.id)
        .single();

      if (existingMember) {
        toast({
          title: "Already a member",
          description: `You're already a member of ${team.name}`,
        });
        navigate(`/team/${team.id}`);
        return;
      }

      // Add user to team
      const { error: insertError } = await supabase
        .from("team_members")
        .insert({
          team_id: team.id,
          user_id: user.id,
          role: "member",
        });

      if (insertError) {
        throw insertError;
      }

      toast({
        title: "Welcome to the team!",
        description: `You've successfully joined ${team.name}`,
      });

      navigate(`/team/${team.id}`);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <GridBackground inverted className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <header className="border-b bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <Logo variant="minimal" size="lg" />
          </div>
        </header>
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="text-lg text-muted-foreground mb-2">Joining team...</div>
            <div className="text-sm text-muted-foreground">Please wait</div>
          </div>
        </div>
      </GridBackground>
    );
  }

  return null;
};

export default JoinTeam;
