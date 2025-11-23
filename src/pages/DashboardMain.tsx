import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, GripVertical, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRoles } from "@/hooks/useRoles";
import { ProfileCompletionModal } from "@/components/ui/ProfileCompletionModal";
import { getFullNameForAvatar } from "@/lib/nameUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Sortable Team Item Component
function SortableTeamItem({ 
  teamMember, 
  teamMeetings, 
  hasNoMeetings, 
  onMeetingAccess, 
  onCreateMeeting,
  navigate,
  teamIndex,
  totalTeams
}: {
  teamMember: any;
  teamMeetings: any[];
  hasNoMeetings: boolean;
  onMeetingAccess: (teamId: string, meetingId: string) => void;
  onCreateMeeting: (teamId: string) => void;
  navigate: (path: string) => void;
  teamIndex: number;
  totalTeams: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: teamMember.teams.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {teamIndex > 0 && (
        <div className="mb-2 border-t border-border/50"></div>
      )}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              {teamMember.teams.name}
              {teamMember.role === "admin" && (
                <button
                  onClick={() => navigate(`/team/${teamMember.teams.id}/invite?fromDashboard=true`)}
                  className="p-1 hover:bg-accent rounded transition-colors"
                  aria-label="Manage team"
                >
                  <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </h3>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 sm:p-4 space-y-2.5">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-muted-foreground ml-[32px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground/70">{teamMember.memberCount} active</span>
                  <span className="text-muted-foreground/50">·</span>
                  {teamMember.invitedCount > 0 ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted underline-offset-2 font-medium text-foreground/70">
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
                    <span className="font-medium text-foreground/70">{teamMember.invitedCount} invited</span>
                  )}
                </div>
                {teamMember.teamMembers && teamMember.teamMembers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <AnimatedTooltip 
                      items={teamMember.teamMembers.map((member: any, index: number) => ({
                        id: index,
                        name: member.profile?.display_name || member.profile?.full_name || "Unknown",
                        designation: member.role === "admin" ? "Admin" : "Member",
                        image: member.profile?.avatar_url || null,
                        avatarName: member.profile?.avatar_name || member.profile?.email || "Unknown",
                        displayName: getFullNameForAvatar(
                          member.profile?.first_name,
                          member.profile?.last_name,
                          member.profile?.email
                        )
                      }))}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="w-full lg:w-2/3">
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {hasNoMeetings ? (
              <Card
                className="border-dashed border-2 hover:border-primary hover:shadow-md transition-all cursor-pointer group bg-muted/20"
                onClick={() => onCreateMeeting(teamMember.teams.id)}
                data-testid="create-meeting-card"
              >
                <CardContent className="flex flex-col items-center justify-center py-8 sm:py-10 px-4">
                  <div className="rounded-full bg-primary/10 p-4 mb-4 group-hover:bg-primary/20 transition-all">
                    <Plus className="h-7 w-7 text-primary" />
                  </div>
                  <h4 className="text-base font-semibold mb-1.5">Create First Meeting</h4>
                  <p className="text-sm text-muted-foreground text-center">
                    Set up a recurring meeting
                  </p>
                </CardContent>
              </Card>
            ) : (
              teamMeetings.map((meeting) => (
                <Card
                  key={meeting.id}
                  className="hover:shadow-lg hover:border-slate-200 bg-slate-300/50 backdrop-blur-sm hover:bg-slate-400/30 transition-all duration-200 cursor-pointer group border border-slate-300/50"
                  onClick={() => onMeetingAccess(teamMember.teams.id, meeting.id)}
                >
                  <CardHeader className="p-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <Badge className="capitalize text-[11px] px-2 py-1 rounded-full font-medium bg-slate-600 text-white w-fit">
                          {meeting.frequency.replace('-', ' ')}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="group-hover:bg-transparent text-md sm:text-md text-blue-600 hover:text-blue-700 font-semibold shrink-0 h-auto py-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMeetingAccess(teamMember.teams.id, meeting.id);
                          }}
                        >
                          Go →
                        </Button>
                      </div>
                      <CardTitle className="text-base sm:text-lg font-semibold">{meeting.name}</CardTitle>
                    </div>
                  </CardHeader>
                  
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const DashboardMain = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isSuperAdmin } = useRoles();
  const isMobile = useIsMobile();
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = teams.findIndex((team) => team.teams.id === active.id);
    const newIndex = teams.findIndex((team) => team.teams.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reorderedTeams = arrayMove(teams, oldIndex, newIndex);
    setTeams(reorderedTeams);

    // Save order to localStorage
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.id) {
      const storageKey = `team-order-${userData.user.id}`;
      const orderArray = reorderedTeams.map(team => team.teams.id);
      localStorage.setItem(storageKey, JSON.stringify(orderArray));
    }

    toast({
      title: "Teams reordered",
      description: "Your team order has been saved",
    });
  };

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
          await fetchPendingInvitations();
          
          if (payload.eventType === 'UPDATE' && (payload.new as any).status === 'accepted') {
            await fetchTeams();
          }
        }
      )
      .subscribe();

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

    // Fetch user profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("first_name, last_name, full_name, avatar_name, avatar_url, email")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileData) {
      setUserProfile(profileData);
    }

    // Check if user is super admin or has teams
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.id) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", userData.user.id)
        .single();
      
      const isSuperAdmin = !profileError && (profileData as any)?.is_super_admin === true;
      
      if (isSuperAdmin) {
        await fetchPendingInvitations();
        await fetchTeams();
      } else {
        const { data: userTeams } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", userData.user.id);
        
        await fetchPendingInvitations();
        
        if (userTeams && userTeams.length > 0) {
          await fetchTeams();
        } else {
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

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", userData.user.id)
        .single();
      
      const isSuperAdmin = !profileError && (profileData as any)?.is_super_admin === true;

      let data;
      let error;

      if (isSuperAdmin) {
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
          data = data.map(team => ({
            team_id: team.id,
            user_id: userData.user.id,
            role: 'admin',
            teams: team
          }));
        }
      } else {
        const result = await supabase
          .from("team_members")
          .select(`
            *,
            teams!inner (
              id,
              name,
              created_at,
              invite_code
            )
          `)
          .eq("user_id", userData.user.id);
        
        data = result.data;
        error = result.error;
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

      const teamIds = data.map(teamMember => teamMember.teams.id);

      // Fetch all team members
      const { data: allTeamMembers } = await supabase
        .from("team_members")
        .select("*")
        .in("team_id", teamIds);

      // Get unique user IDs and fetch all profiles
      const userIds = Array.from(new Set(allTeamMembers?.map(member => member.user_id) || []));
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, email, avatar_url, avatar_name")
        .in("id", userIds);

      const profilesById = allProfiles?.reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
      }, {} as Record<string, any>) || {};

      // Fetch all meeting series
      const { data: allMeetingSeries } = await supabase
        .from("meeting_series")
        .select("*")
        .in("team_id", teamIds)
        .order("created_at", { ascending: true });

      // Fetch all invitations
      let allInvitations: any[] = [];
      try {
        const { data: invitationsData } = await supabase
          .from("invitations")
          .select("email, team_id")
          .in("team_id", teamIds)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString());
        allInvitations = invitationsData || [];
      } catch (invitationError) {
        console.warn("Error fetching invitations:", invitationError);
      }

      // Group data by team
      const membersByTeam = (allTeamMembers || []).reduce((acc, member) => {
        if (!acc[member.team_id]) acc[member.team_id] = [];
        acc[member.team_id].push(member);
        return acc;
      }, {} as Record<string, any[]>);

      const meetingsByTeam = (allMeetingSeries || []).reduce((acc, meeting) => {
        if (!acc[meeting.team_id]) acc[meeting.team_id] = [];
        acc[meeting.team_id].push(meeting);
        return acc;
      }, {} as Record<string, any[]>);

      const invitationsByTeam = allInvitations.reduce((acc, invitation) => {
        if (!acc[invitation.team_id]) acc[invitation.team_id] = [];
        acc[invitation.team_id].push(invitation);
        return acc;
      }, {} as Record<string, any[]>);

      // Map teams with their data
      const teamsWithData = data.map((teamMember) => {
        const teamId = teamMember.teams.id;
        const teamMembers = membersByTeam[teamId] || [];
        
        const teamMembersWithProfiles = teamMembers.map(member => {
          const p = profilesById[member.user_id] || null;
          const displayName = (p?.full_name && p.full_name.trim())
            || `${(p?.first_name || "")} ${(p?.last_name || "")}`.trim()
            || (p?.email ? (p.email.split("@")[0] || "") : "")
            || (p?.avatar_name || "");
          return {
            ...member,
            profile: p ? { ...p, display_name: displayName } : null,
          };
        });

        const invitations = invitationsByTeam[teamId] || [];
        
        return {
          ...teamMember,
          memberCount: teamMembers.length,
          invitedCount: invitations.length,
          invitedEmails: invitations.map(inv => inv.email),
          teamMembers: teamMembersWithProfiles,
          meetings: meetingsByTeam[teamId] || [],
        };
      });

      // Apply saved order from localStorage
      const { data: userDataForOrder } = await supabase.auth.getUser();
      const storageKey = `team-order-${userDataForOrder.user?.id}`;
      const savedOrder = localStorage.getItem(storageKey);
      
      let orderedTeams = teamsWithData;
      if (savedOrder) {
        try {
          const orderArray = JSON.parse(savedOrder) as string[];
          // Create a map for quick lookup
          const teamsMap = new Map(teamsWithData.map(t => [t.teams.id, t]));
          // Reorder based on saved order, then append any new teams
          const ordered: any[] = [];
          const seen = new Set<string>();
          
          orderArray.forEach(teamId => {
            const team = teamsMap.get(teamId);
            if (team) {
              ordered.push(team);
              seen.add(teamId);
            }
          });
          
          // Add any teams not in the saved order (new teams)
          teamsWithData.forEach(team => {
            if (!seen.has(team.teams.id)) {
              ordered.push(team);
            }
          });
          
          orderedTeams = ordered;
        } catch (e) {
          console.warn("Failed to parse saved team order:", e);
        }
      }

      setTeams(orderedTeams);

      const meetingsForState: Record<string, any[]> = {};
      orderedTeams.forEach((team) => {
        meetingsForState[team.teams.id] = team.meetings;
      });
      setMeetings(meetingsForState);
    } catch (error: unknown) {
      console.error("Error in fetchTeams:", error);
      setTeams([]);
    }
  };

  const handleCreateTeam = () => {
    navigate("/create-team");
  };

  const handleCreateMeeting = (teamId: string) => {
    navigate(`/team/${teamId}/setup-meeting`);
  };

  const isProfileComplete = () => {
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

      const { data: invitations, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      if (error) {
        console.error("Error fetching invitations:", error);
        setPendingInvitations([]);
        return;
      }

      const matchingInvitations = invitations?.filter(inv => 
        inv.email.toLowerCase() === user.email.toLowerCase()
      ) || [];

      if (matchingInvitations.length === 0) {
        setPendingInvitations([]);
        return;
      }

      const { data: memberTeams } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);

      const memberTeamIds = new Set(memberTeams?.map(m => m.team_id) || []);

      const validInvitations = matchingInvitations.filter(
        inv => !memberTeamIds.has(inv.team_id)
      );

      if (validInvitations.length === 0) {
        setPendingInvitations([]);
        return;
      }

      const invitationsWithMeetings = await Promise.all(
        validInvitations.map(async (invitation) => {
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

      const { data: existingMember, error: checkError } = await supabase
        .from("team_members")
        .select("*")
        .eq("team_id", invitation.team_id)
        .eq("user_id", user.id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

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

      const { error: inviteError } = await supabase
        .from("invitations")
        .update({ status: "accepted" })
        .eq("id", invitation.id);

      if (inviteError) throw inviteError;

      toast({
        title: "Invitation accepted!",
        description: `You've joined ${invitation.teams.name}`,
      });

      await Promise.all([fetchTeams(), fetchPendingInvitations()]);
    } catch (error: unknown) {
      console.error("Error accepting invitation:", error);
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
    <main className="container mx-auto px-4 py-6 sm:py-8">
      <div className={`mb-8 sm:mb-10 grid grid-cols-1 lg:grid-cols-2 gap-6 ${isMobile ? 'sticky top-0 z-50 bg-background/95 backdrop-blur-sm pb-4 pt-4 -mx-4 px-4 border-b shadow-sm' : ''}`}>
        {/* Your Teams Section */}
        <div>
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">My Cadenced Meetings</h2>
            
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Run your recurring meetings with discipline that makes all the difference.
              <br />
              {(isAdmin || isSuperAdmin) ? (
                <>
                  Don't see a team that you would like to see here?{' '}
                  <a 
                    href="/create-team" 
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/create-team");
                    }}
                    className="text-primary hover:underline cursor-pointer font-medium"
                  >
                    Create it now!</a>
                </>
              ) : (
                "Don't see a team that you would like to see here? Ask an admin to invite you to it!"
              )}
            </p>
          </div>
        </div>

      </div>

      {teams.length === 0 && pendingInvitations.length === 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {false && (isAdmin || isSuperAdmin) ? (
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
          ) : (
            <Card className="border-2 border-muted">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-muted/50 p-4 mb-4">
                  <Mail className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-center">Waiting for an Invitation</h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  You'll need to wait for an admin to invite you to a team.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-10 sm:space-y-12">
          {/* Pending Invitations */}
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
                          <span className="hidden sm:inline">·</span> <span>Invited by<br />{invitation.invited_by_profile?.full_name || "a team member"}</span>
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

          {/* Main Content Grid: Teams and Actions */}
          <div className="gap-4">
            {/* Teams Section */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={teams.map(team => team.teams.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-10 sm:space-y-12">
                  {teams.map((teamMember, teamIndex) => {
                    const teamMeetings = meetings[teamMember.teams.id] || [];
                    const hasNoMeetings = teamMeetings.length === 0;

                    return (
                      <SortableTeamItem
                        key={teamMember.teams.id}
                        teamMember={teamMember}
                        teamMeetings={teamMeetings}
                        hasNoMeetings={hasNoMeetings}
                        onMeetingAccess={handleMeetingAccess}
                        onCreateMeeting={handleCreateMeeting}
                        navigate={navigate}
                        teamIndex={teamIndex}
                        totalTeams={teams.length}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

          </div>
        </div>
      )}

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
    </main>
  );
};

export default DashboardMain;

