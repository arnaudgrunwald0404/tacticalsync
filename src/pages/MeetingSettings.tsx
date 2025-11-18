import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, Save, UserPlus, Link as LinkIcon } from "lucide-react";
import FancyAvatar from "@/components/ui/fancy-avatar";
import Logo from "@/components/Logo";
import GridBackground from "@/components/ui/grid-background";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MeetingSettings = () => {
  const { teamId, meetingId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [team, setTeam] = useState<unknown>(null);
  const [recurringMeeting, setRecurringMeeting] = useState<unknown>(null);
  const [meetingName, setMeetingName] = useState("");
  
  const [currentMembers, setCurrentMembers] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [sendingInvites, setSendingInvites] = useState(false);

  useEffect(() => {
    if (teamId && meetingId) {
      fetchData();
    }
  }, [teamId, meetingId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch team
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single();

      if (teamError) throw teamError;
      setTeam(teamData);

      // Fetch meeting series
      const { data: meetingData, error: meetingError } = await supabase
        .from("meeting_series")
        .select("*")
        .eq("id", meetingId)
        .single();

      if (meetingError) throw meetingError;
      setRecurringMeeting(meetingData);
      setMeetingName(meetingData.name);

      // Fetch team members
      await fetchCurrentMembers();
      await fetchPendingInvitations();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentMembers = async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select(`
        id,
        role,
        title,
        profiles!fk_team_members_user_id_profiles (
          id,
          email,
          first_name,
          last_name,
          avatar_url,
          avatar_name
        )
      `)
      .eq("team_id", teamId);

    if (!error && data) {
      setCurrentMembers(data);
    }
  };

  const fetchPendingInvitations = async () => {
    const { data, error } = await supabase
      .from("invitations")
      .select("*")
      .eq("team_id", teamId)
      .eq("status", "pending");

    if (!error && data) {
      setPendingInvitations(data);
    }
  };

  const handleSaveMeetingName = async () => {
    if (!meetingName.trim()) {
      toast({
        title: "Meeting name required",
        description: "Please enter a name for your meeting",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("meeting_series")
        .update({ name: meetingName })
        .eq("id", meetingId)
        .select();

      if (error) throw error;

      toast({
        title: "Meeting name updated!",
        description: "Your changes have been saved",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const parseEmails = (input: string): string[] => {
    const emails = input
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes("@"));

    // Filter out existing members and pending invitations
    const existingEmails = currentMembers.map((m: any) => m.profiles?.email?.toLowerCase());
    const pendingEmails = pendingInvitations.map((i) => i.email.toLowerCase());
    
    return emails.filter(
      (email) => !existingEmails.includes(email) && !pendingEmails.includes(email)
    );
  };

  const handleSendInvites = async () => {
    const emails = parseEmails(emailInput);
    
    if (emails.length === 0) {
      toast({
        title: "No valid emails",
        description: "Please enter valid email addresses that aren't already members or invited",
        variant: "destructive",
      });
      return;
    }

    setSendingInvites(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user's name for the email
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const invitations = emails.map((email) => ({
        team_id: teamId,
        email,
        invited_by: user.id,
        role: 'member' as const,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }));

      const { error } = await supabase.from("invitations").insert(invitations);

      if (error) throw error;

      // Send invitation emails via Edge Function
      const inviteLink = `${window.location.origin}/join/${team.invite_code}`;
      
      const emailPromises = emails.map(email =>
        supabase.functions.invoke('send-invitation-email', {
          body: {
            email,
            teamName: team.name,
            inviterName: profile?.full_name || 'A teammate',
            inviteLink,
          },
        })
      );

      await Promise.all(emailPromises);

      toast({
        title: "Invitations sent!",
        description: `Sent ${emails.length} invitation${emails.length > 1 ? "s" : ""}`,
      });

      setEmailInput("");
      await fetchPendingInvitations();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSendingInvites(false);
    }
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/join/${team.invite_code}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "Invite link copied!",
      description: "Share this link with team members to invite them.",
    });
  };

  const handleDeleteMeeting = async () => {
    setDeleting(true);
    try {
      // Delete the meeting series (cascade will delete all meeting_instances and related items)
      const { error } = await supabase
        .from("meeting_series")
        .delete()
        .eq("id", meetingId);

      if (error) throw error;

      toast({
        title: "Meeting deleted",
        description: "The meeting and all its iterations have been permanently deleted",
      });

      // Navigate back to dashboard
      navigate("/dashboard");
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <GridBackground inverted className="min-h-screen bg-blue-50 overscroll-none">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/team/${teamId}/meeting/${meetingId}`)}
              className="h-8 sm:h-10 px-2 sm:px-4"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Back to Meeting</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          </div>
        </div>
      </header>
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Meeting Settings</h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2">
            Manage your meeting configuration and team members
          </p>
        </div>

        {/* Meeting Details */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Meeting Details</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Update the name and configuration of this meeting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
            <div className="space-y-2">
              <Label htmlFor="meetingName" className="text-sm sm:text-base">Meeting Name</Label>
              <Input
                id="meetingName"
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                placeholder="e.g., Weekly Tactical"
                className="h-10 sm:h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm sm:text-base">Frequency</Label>
              <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md">
                {recurringMeeting?.frequency || "weekly"}
              </div>
              <p className="text-xs text-slate-500">
                Frequency cannot be changed after creation
              </p>
            </div>

            <Button onClick={handleSaveMeetingName} disabled={saving} size="sm" className="w-full sm:w-auto">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-lg sm:text-xl">Team Members</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Invite people to join {team?.name}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={copyInviteLink} size="sm" className="w-full sm:w-auto">
                <LinkIcon className="h-4 w-4 mr-2" />
                Copy Invite Link
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-4 sm:p-6 pt-0">
            {/* Current Members */}
            <div className="space-y-3">
              <Label className="text-sm sm:text-base">Current Members ({currentMembers.length})</Label>
              <div className="space-y-2">
                {currentMembers.map((member: unknown) => {
                  const fullDisplayName = member.profiles?.first_name && member.profiles?.last_name
                    ? `${member.profiles.first_name} ${member.profiles.last_name}`
                    : member.profiles?.first_name || member.profiles?.email?.split('@')[0] || "Unknown User";
                  
                  return (
                    <div
                      key={member.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-50 rounded-lg"
                    >
                      <FancyAvatar 
                        name={member.profiles?.avatar_name || member.profiles?.email || 'Unknown'} 
                        displayName={fullDisplayName}
                        avatarUrl={member.profiles?.avatar_url}
                        size="sm" 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 text-sm sm:text-base">
                          {fullDisplayName}
                        </div>
                        <div className="text-xs sm:text-sm text-slate-600 truncate">
                          {member.profiles?.email}
                        </div>
                      </div>
                      <Badge variant={member.role === "admin" ? "default" : "secondary"} className="text-xs w-fit">
                        {member.role}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending Invitations */}
            {pendingInvitations.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm sm:text-base">Pending Invitations ({pendingInvitations.length})</Label>
                <div className="space-y-2">
                  {pendingInvitations.map((invitation: any) => (
                    <div
                      key={invitation.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 text-sm sm:text-base truncate">
                          {invitation.email}
                        </div>
                        <div className="text-xs sm:text-sm text-slate-600">
                          Invited {new Date(invitation.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 text-xs w-fit">
                        Pending
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite New Members */}
            <div className="space-y-3">
              <Label htmlFor="emailInput" className="text-sm sm:text-base">Invite New Members</Label>
              <Textarea
                id="emailInput"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Enter email addresses (one per line or comma-separated)"
                rows={4}
                className="text-sm"
              />
              <Button onClick={handleSendInvites} disabled={sendingInvites} size="sm" className="w-full sm:w-auto">
                <UserPlus className="h-4 w-4 mr-2" />
                {sendingInvites ? "Sending..." : "Send Invitations"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-red-900 text-lg sm:text-xl">Danger Zone</CardTitle>
            <CardDescription className="text-red-700 text-xs sm:text-sm">
              Irreversible actions that will permanently delete data
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting} size="sm" className="w-full sm:w-auto">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Meeting
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{recurringMeeting?.name}</strong> and all of its iterations, including:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>All meeting instances (past and future)</li>
                      <li>All agenda items</li>
                      <li>All topics and discussions</li>
                      <li>All comments and notes</li>
                    </ul>
                    <p className="mt-3 font-semibold text-red-600">
                      This action cannot be undone.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteMeeting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete Permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </GridBackground>
  );
};

export default MeetingSettings;
