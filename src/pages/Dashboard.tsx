import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, LogOut, Settings, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
import Logo from "@/components/Logo";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { ProfileCompletionModal } from "@/components/ui/ProfileCompletionModal";
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
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedMeetingNavigation, setSelectedMeetingNavigation] = useState<{
    teamId: string;
    meetingId: string;
  } | null>(null);
  interface UserProfile {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    avatar_name?: string;
    avatar_url?: string;
    email?: string;
  }
  
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

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
     
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);

    // Fetch or create user profile
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("first_name, last_name, full_name, avatar_name, avatar_url, email")
      .eq("id", session.user.id)
      .maybeSingle();

    let profile = profileData;

    if (profileError) {
      console.error("Error fetching profile:", profileError);
    }

    if (!profile) {
      // Create minimal profile if missing (helps in local/dev when DB trigger isn't installed)
      const userMeta: Record<string, any> = (session.user as any).user_metadata || {};
      const firstName = (userMeta.given_name || "").toString();
      const lastName = (userMeta.family_name || "").toString();
      const fullName = (userMeta.full_name || `${firstName} ${lastName}`.trim() || session.user.email || "").toString();
      const avatarUrl = (userMeta.avatar_url || userMeta.picture || "").toString();

      const { error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: session.user.id,
          email: session.user.email,
          full_name: fullName,
          first_name: firstName || null,
          last_name: lastName || null,
          avatar_url: avatarUrl || null,
        });

      if (insertError) {
        console.error("Error creating profile:", insertError);
      } else {
        const { data: newProfile } = await supabase
          .from("profiles")
          .select("first_name, last_name, full_name, avatar_name, avatar_url, email")
          .eq("id", session.user.id)
          .maybeSingle();
        profile = newProfile || null;
      }
    }

    if (profile) {
      setUserProfile(profile);
      // Also set profile for the header avatar
      setProfile(profile);
    }

    // Check if user is super admin or has teams
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.id) {
      // Check if user is super admin
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", userData.user.id)
        .single();
      
      const isSuperAdmin = !profileError && (profileData as any)?.is_super_admin === true;
      
      if (isSuperAdmin) {
        // Super admin can see all teams
        await fetchPendingInvitations();
        await fetchTeams();
      } else {
        // Regular user - check if they have teams
        const { data: userTeams } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", userData.user.id);
        
        // Always fetch invitations for all users, even if they have no teams
        await fetchPendingInvitations();
        
        if (userTeams && userTeams.length > 0) {
          await fetchTeams();
        } else {
          // User has no teams, set empty arrays
          setTeams([]);
          setMeetings({});
        }
      }
    }
    setLoading(false);
  };

  const fetchTeams = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      if (!userData.user?.id) {
        setTeams([]);
        return;
      }

      // Check if user is super admin
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", userData.user.id)
        .single();
      
      const isSuperAdmin = !profileError && (profileData as any)?.is_super_admin === true;

      let data;
      let error;

      if (isSuperAdmin) {
        // Super admin: fetch all teams directly
        const result = await supabase
          .from("teams")
          .select(`
            id,
            name,
            created_at,
            invite_code
          `);
        
        data = result.data;
        error = result.error;

        if (!error && data) {
          // Transform data to match expected format (wrap in team_members structure)
          data = data.map(team => ({
            team_id: team.id,
            user_id: userData.user.id,
            role: 'admin', // Super admin has admin access to all teams
            teams: team
          }));
        }
      } else {
        // Regular user: use existing team_members query
        const result = await supabase
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
          .eq("user_id", userData.user.id);
        
        data = result.data;
        error = result.error;
        console.log("Regular user teams query result:", { data, error });
      }

      if (error) {
        console.error("Error fetching teams:", error);
        setTeams([]);
        return;
      }

      if (!data || data.length === 0) {
        setTeams([]);
        return;
      }

      // Fetch member counts, team members, and meetings for each team
      const teamsWithData = await Promise.all(
        data.map(async (teamMember) => {
          try {
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

            // Fetch meeting series for this team
            const { data: teamMeetings } = await supabase
              .from("meeting_series")
              .select("*")
              .eq("team_id", teamMember.teams.id)
              .order("created_at", { ascending: true });

            // Fetch pending invitations with emails (handle errors gracefully)
            let invitations = [];
            let invitedCount = 0;
            try {
              const { data: invitationsData, count: invitedCountData } = await supabase
                .from("invitations")
                .select("email", { count: "exact" })
                .eq("team_id", teamMember.teams.id)
                .eq("status", "pending")
                .gt("expires_at", new Date().toISOString());
              
              invitations = invitationsData || [];
              invitedCount = invitedCountData || 0;
            } catch (invitationError) {
              console.warn("Error fetching invitations for team:", teamMember.teams.id, invitationError);
            }

            return {
              ...teamMember,
              memberCount: count || 0,
              invitedCount: invitedCount,
              invitedEmails: invitations.map(inv => inv.email) || [],
              teamMembers: teamMembers || [],
              meetings: teamMeetings || [],
            };
          } catch (error) {
            console.error("Error processing team member:", teamMember.teams.id, error);
            return {
              ...teamMember,
              memberCount: 0,
              invitedCount: 0,
              invitedEmails: [],
              teamMembers: [],
              meetings: [],
            };
          }
        })
      );

      setTeams(teamsWithData);

      // Organize meetings by team
      const meetingsByTeam: Record<string, any[]> = {};
      teamsWithData.forEach((team) => {
        meetingsByTeam[team.teams.id] = team.meetings;
      });
      setMeetings(meetingsByTeam);
    } catch (error: unknown) {
      console.error("Error in fetchTeams:", error);
      setTeams([]);
    }
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

  const isProfileComplete = () => {
    console.log("Checking profile completion:", {
      userProfile,
      first_name: userProfile?.first_name?.trim(),
      last_name: userProfile?.last_name?.trim(),
      avatar_name: userProfile?.avatar_name?.trim()
    });
    return !!(
      userProfile?.first_name?.trim() &&
      userProfile?.last_name?.trim() &&
      userProfile?.avatar_name?.trim()
    );
  };

  const handleMeetingAccess = (teamId: string, meetingId: string) => {
    if (!isProfileComplete()) {
      setSelectedMeetingNavigation({ teamId, meetingId });
      setShowProfileModal(true);
    } else {
      navigate(`/team/${teamId}/meeting/${meetingId}`);
    }
  };

  const handleProfileComplete = () => {
    setShowProfileModal(false);
    if (selectedMeetingNavigation) {
      navigate(`/team/${selectedMeetingNavigation.teamId}/meeting/${selectedMeetingNavigation.meetingId}`);
      setSelectedMeetingNavigation(null);
    }
  };

  const fetchPendingInvitations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setPendingInvitations([]);
        return;
      }

      console.log("Fetching invitations for email:", user.email);

      // First check if invitations table exists and has data
      const { data: invitations, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      console.log("All pending invitations:", invitations);
      console.log("Filtering for email:", user.email.toLowerCase());

      if (error) {
        console.error("Error fetching invitations:", error);
        setPendingInvitations([]);
        return;
      }

      // Filter invitations by email (case-insensitive)
      const matchingInvitations = invitations?.filter(inv => 
        inv.email.toLowerCase() === user.email.toLowerCase()
      ) || [];

      console.log("Matching invitations:", matchingInvitations);

      // If no matching invitations, set empty array and return
      if (matchingInvitations.length === 0) {
        setPendingInvitations([]);
        return;
      }

      // Get list of teams user is already a member of
      const { data: memberTeams } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);

      const memberTeamIds = new Set(memberTeams?.map(m => m.team_id) || []);

      // Filter out invitations for teams user is already a member of
      const validInvitations = matchingInvitations.filter(
        inv => !memberTeamIds.has(inv.team_id)
      );

      console.log("Valid invitations (not already member):", validInvitations);

      // If no valid invitations, set empty array
      if (validInvitations.length === 0) {
        setPendingInvitations([]);
        return;
      }

      // Fetch meetings for each invited team
      const invitationsWithMeetings = await Promise.all(
        validInvitations.map(async (invitation) => {
          // Fetch team info
          const { data: teamData } = await supabase
            .from("teams")
            .select("*")
            .eq("id", invitation.team_id)
            .single();

          const { data: teamMeetings } = await supabase
            .from("meeting_series")
            .select("*")
            .eq("team_id", invitation.team_id)
            .order("created_at", { ascending: true });

          return {
            ...invitation,
            teams: teamData,
            meetings: teamMeetings || [],
          };
        })
      );

      setPendingInvitations(invitationsWithMeetings);
    } catch (error: unknown) {
      console.error("Error in fetchPendingInvitations:", error);
      setPendingInvitations([]);
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
      <header className="border-b bg-card/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          
          {/* Avatar positioned absolutely to avoid clipping */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 cursor-pointer hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-2 transition-colors">
                  <FancyAvatar 
                    name={(profile?.avatar_name && profile.avatar_name.trim())
                      || `${(profile?.first_name || '')} ${(profile?.last_name || '')}`.trim()
                      || (profile?.full_name || '')
                      || (profile?.email || 'User')}
                    displayName={`${(profile?.first_name || '')} ${(profile?.last_name || '')}`.trim() || (profile?.email?.split('@')[0] || 'U')}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <div className="flex flex-col items-start">
                    <span className="text-sm leading-none">
                      {`${profile?.first_name || profile?.email || ''} ${profile?.last_name || ''}`.trim()}
                    </span>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Your Teams</h2>
            
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage your tactical meetings and collaborate with your teams
            </p>
          </div>
          {(teams.length > 0 || pendingInvitations.length > 0) && (
            <Button variant="outline" onClick={handleCreateTeam} size="sm" className="w-full sm:w-auto">
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
                <Card className="border-orange-300 bg-orange-50/50 max-w-full sm:max-w-2xl">
                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg sm:text-xl mb-3">{invitation.teams.name}</CardTitle>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1 mb-2">
                          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200 w-fit">
                            Invitation Pending
                          </div>
                          <CardDescription className="text-xs">
                            <span className="hidden sm:inline">·</span> Invited by {invitation.invited_by_profile?.full_name || "a team member"}
                          </CardDescription>
                        </div>
                        {invitation.meetings && invitation.meetings.length > 0 && (
                          <CardDescription className="mt-1 text-xs sm:text-sm">
                            {invitation.meetings.length} meeting{invitation.meetings.length > 1 ? 's' : ''}: {invitation.meetings.map((m: any) => m.name).join(', ')}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col sm:flex-row gap-2 p-4 sm:p-6 pt-0">
                    <Button
                      onClick={() => handleAcceptInvitation(invitation)}
                      className="bg-orange-500 hover:bg-orange-600 text-white w-full sm:w-auto"
                      size="sm"
                    >
                      Accept Invitation
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDeclineInvitation(invitation)}
                      className="border-orange-300 text-orange-700 hover:bg-orange-50 w-full sm:w-auto"
                      size="sm"
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
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex flex-col gap-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg sm:text-xl font-bold">
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
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
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
                        className="w-full sm:w-auto text-xs sm:text-sm"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        <span className="hidden md:inline">Add Another Recurring Meeting</span>
                        <span className="md:hidden">Add Meeting</span>
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {hasNoMeetings ? (
                      <Card
                        className="border-dashed border-2 hover:border-primary transition-all cursor-pointer group"
                        onClick={() => handleCreateMeeting(teamMember.teams.id)}
                        data-testid="create-meeting-card"
                      >
                        <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
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
                          onClick={() => handleMeetingAccess(teamMember.teams.id, meeting.id)}
                        >
                          <CardHeader className="p-4 sm:p-6">
                            <CardTitle className="text-sm sm:text-base">{meeting.name}</CardTitle>
                            <CardDescription className="capitalize text-xs sm:text-sm">
                              {meeting.frequency.replace('-', ' ')}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 sm:p-6 pt-0">
                            <Button variant="default" size="sm" className="w-full group-hover:bg-primary/90 text-xs sm:text-sm">
                              Access Meeting →
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

      <ProfileCompletionModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onComplete={handleProfileComplete}
        initialData={{
          firstName: userProfile?.first_name || "",
          lastName: userProfile?.last_name || "",
          avatarName: userProfile?.avatar_name || ""
        }}
      />
    </GridBackground>
  );
};

export default Dashboard;
