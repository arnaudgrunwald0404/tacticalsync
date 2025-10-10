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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  
  const [team, setTeam] = useState<any>(null);
  const [recurringMeeting, setRecurringMeeting] = useState<any>(null);
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

      // Fetch recurring meeting
      const { data: meetingData, error: meetingError } = await supabase
        .from("recurring_meetings")
        .select("*")
        .eq("id", meetingId)
        .single();

      if (meetingError) throw meetingError;
      setRecurringMeeting(meetingData);
      setMeetingName(meetingData.name);

      // Fetch team members
      await fetchCurrentMembers();
      await fetchPendingInvitations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
        profiles:user_id (
          id,
          email,
          first_name,
          last_name,
          avatar_url
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
      const { error } = await supabase
        .from("recurring_meetings")
        .update({ name: meetingName })
        .eq("id", meetingId);

      if (error) throw error;

      toast({
        title: "Meeting name updated!",
        description: "Your changes have been saved",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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

      const invitations = emails.map((email) => ({
        team_id: teamId,
        email,
        invited_by: user.id,
        status: "pending",
      }));

      const { error } = await supabase.from("invitations").insert(invitations);

      if (error) throw error;

      toast({
        title: "Invitations sent!",
        description: `Sent ${emails.length} invitation${emails.length > 1 ? "s" : ""}`,
      });

      setEmailInput("");
      await fetchPendingInvitations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
      // Delete the recurring meeting (cascade will delete all weekly_meetings and meeting_items)
      const { error } = await supabase
        .from("recurring_meetings")
        .delete()
        .eq("id", meetingId);

      if (error) throw error;

      toast({
        title: "Meeting deleted",
        description: "The meeting and all its iterations have been permanently deleted",
      });

      // Navigate back to dashboard
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/team/${teamId}/meeting/${meetingId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Meeting
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-slate-900">Meeting Settings</h1>
          <p className="text-slate-600 mt-2">
            Manage your meeting configuration and team members
          </p>
        </div>

        {/* Meeting Details */}
        <Card>
          <CardHeader>
            <CardTitle>Meeting Details</CardTitle>
            <CardDescription>
              Update the name and configuration of this meeting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meetingName">Meeting Name</Label>
              <Input
                id="meetingName"
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                placeholder="e.g., Weekly Tactical"
              />
            </div>

            <div className="space-y-2">
              <Label>Frequency</Label>
              <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md">
                {recurringMeeting?.frequency || "weekly"}
              </div>
              <p className="text-xs text-slate-500">
                Frequency cannot be changed after creation
              </p>
            </div>

            <Button onClick={handleSaveMeetingName} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  Invite people to join {team?.name}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={copyInviteLink}>
                <LinkIcon className="h-4 w-4 mr-2" />
                Copy Invite Link
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Members */}
            <div className="space-y-3">
              <Label>Current Members ({currentMembers.length})</Label>
              <div className="space-y-2">
                {currentMembers.map((member: any) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.profiles?.avatar_url} />
                      <AvatarFallback>
                        {member.profiles?.first_name?.[0]}
                        {member.profiles?.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        {member.profiles?.first_name} {member.profiles?.last_name}
                      </div>
                      <div className="text-sm text-slate-600">
                        {member.profiles?.email}
                      </div>
                    </div>
                    <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                      {member.role}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Invitations */}
            {pendingInvitations.length > 0 && (
              <div className="space-y-3">
                <Label>Pending Invitations ({pendingInvitations.length})</Label>
                <div className="space-y-2">
                  {pendingInvitations.map((invitation: any) => (
                    <div
                      key={invitation.id}
                      className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">
                          {invitation.email}
                        </div>
                        <div className="text-sm text-slate-600">
                          Invited {new Date(invitation.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                        Pending
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite New Members */}
            <div className="space-y-3">
              <Label htmlFor="emailInput">Invite New Members</Label>
              <Textarea
                id="emailInput"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Enter email addresses (one per line or comma-separated)"
                rows={4}
              />
              <Button onClick={handleSendInvites} disabled={sendingInvites}>
                <UserPlus className="h-4 w-4 mr-2" />
                {sendingInvites ? "Sending..." : "Send Invitations"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Danger Zone</CardTitle>
            <CardDescription className="text-red-700">
              Irreversible actions that will permanently delete data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
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
    </div>
  );
};

export default MeetingSettings;
