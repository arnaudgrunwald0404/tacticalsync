import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { UserProfileHeader } from "@/components/ui/user-profile-header";

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

      // Update any pending invitations for this user's email to "accepted"
      // This prevents duplicate invitation records when joining via invite link
      if (user.email) {
        await supabase
          .from("invitations")
          .update({ status: "accepted" })
          .eq("team_id", team.id)
          .eq("email", user.email.toLowerCase())
          .eq("status", "pending");
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
      <GridBackground inverted className="min-h-screen bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2] overscroll-none">
        <header className="border-b bg-white">
          <div className="container mx-auto px-4 py-4 relative pr-20">
            <Logo variant="minimal" size="lg" />
            <UserProfileHeader />
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
