import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, LogOut, User, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
import Logo from "@/components/Logo";
import FancyAvatar from "@/components/ui/fancy-avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<unknown>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<Record<string, any[]>>({});
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    // Set up real-time subscription for invitations
    const channel = supabase
      .channel('invitations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invitations',
        },
        async (payload) => {
          console.log('Invitation change detected:', payload);
          // Refresh invitations when any change occurs
          await fetchPendingInvitations();
          
          // If an invitation was accepted, also refresh teams
          if (payload.eventType === 'UPDATE' && (payload.new as any).status === 'accepted') {
            await fetchTeams();
          }
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    await fetchPendingInvitations();
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

    // Fetch member counts, team members, and meetings for each team
    const teamsWithData = await Promise.all(
      (data || []).map(async (teamMember) => {
        const { count } = await supabase
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("team_id", teamMember.teams.id);

        // Fetch team members with their profiles
        const { data: teamMembers } = await supabase
          .from("team_members")
          .select(`
            *,
            profiles (
              id,
              full_name,
              avatar_url,
              avatar_name
            )
          `)
          .eq("team_id", teamMember.teams.id);

        // Fetch recurring meetings for this team
        const { data: teamMeetings } = await supabase
          .from("recurring_meetings")
          .select("*")
          .eq("team_id", teamMember.teams.id)
          .order("created_at", { ascending: true });

        // Fetch pending invitations with emails
        const { data: invitations, count: invitedCount } = await supabase
          .from("invitations")
          .select("email", { count: "exact" })
          .eq("team_id", teamMember.teams.id)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString());

        return {
          ...teamMember,
          memberCount: count || 0,
          invitedCount: invitedCount || 0,
          invitedEmails: invitations?.map(inv => inv.email) || [],
          teamMembers: teamMembers || [],
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

  const fetchPendingInvitations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: invitations, error } = await supabase
        .from("invitations")
        .select(`
          *,
          teams:team_id (
            id,
            name,
            abbreviated_name
          ),
          invited_by_profile:invited_by (
            full_name
          )
        `)
        .eq("email", user.email.toLowerCase())
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      if (error) {
        console.error("Error fetching invitations:", error);
        return;
      }

      // Get list of teams user is already a member of
      const { data: memberTeams } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);

      const memberTeamIds = new Set(memberTeams?.map(m => m.team_id) || []);

      // Filter out invitations for teams user is already a member of
      const validInvitations = (invitations || []).filter(
        inv => !memberTeamIds.has(inv.team_id)
      );

      // Fetch meetings for each invited team
      const invitationsWithMeetings = await Promise.all(
        validInvitations.map(async (invitation) => {
          const { data: teamMeetings } = await supabase
            .from("recurring_meetings")
            .select("*")
            .eq("team_id", invitation.team_id)
            .order("created_at", { ascending: true });

          return {
            ...invitation,
            meetings: teamMeetings || [],
          };
        })
      );

      setPendingInvitations(invitationsWithMeetings);
    } catch (error: unknown) {
      console.error("Error in fetchPendingInvitations:", error);
    }
  };

  const handleAcceptInvitation = async (invitation: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from("team_members")
        .select("*")
        .eq("team_id", invitation.team_id)
        .eq("user_id", user.id)
        .single();

      // Only add user to team if they're not already a member
      if (!existingMember) {
        const { error: memberError } = await supabase
          .from("team_members")
          .insert({
            team_id: invitation.team_id,
            user_id: user.id,
            role: "member",
          });

        if (memberError) throw memberError;
      }

      // Update invitation status
      const { error: inviteError } = await supabase
        .from("invitations")
        .update({ status: "accepted" })
        .eq("id", invitation.id);

      if (inviteError) throw inviteError;

      toast({
        title: "Invitation accepted!",
        description: `You've joined ${invitation.teams.name}`,
      });

      // Refresh data
      await Promise.all([fetchTeams(), fetchPendingInvitations()]);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDeclineInvitation = async (invitation: any) => {
    try {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "declined" })
        .eq("id", invitation.id);

      if (error) throw error;

      toast({
        title: "Invitation declined",
        description: `You've declined the invitation to ${invitation.teams.name}`,
      });

      await fetchPendingInvitations();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
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
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="minimal" size="lg" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="ghost" onClick={() => navigate("/profile")}>
              <User className="h-4 w-4 mr-2" />
              {user?.email}
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
          {(teams.length > 0 || pendingInvitations.length > 0) && (
            <Button variant="outline" onClick={handleCreateTeam}>
              <Plus className="h-4 w-4 mr-2" />
              Create New Team
            </Button>
          )}
        </div>

        {teams.length === 0 && pendingInvitations.length === 0 ? (
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
            {/* Pending Invitations as Team Cards */}
            {pendingInvitations.map((invitation) => (
              <div key={`invitation-${invitation.id}`} className="space-y-4">
                <Card className="border-orange-300 bg-orange-50/50 max-w-2xl">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-3">{invitation.teams.name}</CardTitle>
                        <div className="flex items-center gap-1 mb-2">
                          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            Invitation Pending
                          </div>
                          <CardDescription className="text-xs">
                            · Invited by {invitation.invited_by_profile?.full_name || "a team member"}
                          </CardDescription>
                        </div>
                        {invitation.meetings && invitation.meetings.length > 0 && (
                          <CardDescription className="mt-1">
                            {invitation.meetings.length} meeting{invitation.meetings.length > 1 ? 's' : ''}: {invitation.meetings.map((m: any) => m.name).join(', ')}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button
                      onClick={() => handleAcceptInvitation(invitation)}
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      Accept Invitation
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDeclineInvitation(invitation)}
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    >
                      Decline
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ))}

            {/* Regular Teams */}
            {teams.map((teamMember) => {
              const teamMeetings = meetings[teamMember.teams.id] || [];
              const hasNoMeetings = teamMeetings.length === 0;

              return (
                <div key={teamMember.id} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold">
                          {teamMember.teams.name}
                        </h3>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => navigate(`/team/${teamMember.teams.id}/invite?fromDashboard=true`)}
                              >
                                <Settings className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Manage team</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{teamMember.memberCount} active</span>
                        <span>·</span>
                        {teamMember.invitedCount > 0 ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted underline-offset-2">
                                  {teamMember.invitedCount} invited
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold mb-2">Pending invitations:</p>
                                  {teamMember.invitedEmails?.map((email: string, idx: number) => (
                                    <p key={idx} className="text-xs">
                                      {email}
                                    </p>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span>{teamMember.invitedCount} invited</span>
                        )}
                      </div>
                      {teamMember.teamMembers && teamMember.teamMembers.length > 0 && (
                        <div className="mt-2">
                          <AnimatedTooltip 
                            items={teamMember.teamMembers.map((member: any, index: number) => ({
                              id: index,
                              name: member.profiles?.full_name || "Unknown",
                              designation: member.role === "admin" ? "Admin" : "Member",
                              image: member.profiles?.avatar_url || null,
                              avatarName: member.profiles?.avatar_name || member.profiles?.full_name || "Unknown"
                            }))}
                          />
                        </div>
                      )}
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
    </GridBackground>
  );
};

export default Dashboard;
