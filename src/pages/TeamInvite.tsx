import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Users, Copy, Check, ArrowLeft, Trash2, AlertTriangle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
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

const TeamInvite = () => {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const fromDashboard = searchParams.get("fromDashboard") === "true";
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [abbreviatedName, setAbbreviatedName] = useState("");
  const [originalTeamName, setOriginalTeamName] = useState("");
  const [originalAbbreviatedName, setOriginalAbbreviatedName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);
  const [currentMembers, setCurrentMembers] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<string[]>([]);

  useEffect(() => {
    fetchTeam();
  }, [teamId]);

  const fetchTeam = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: team, error } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single();

      if (error) throw error;

      setTeamName(team.name);
      setAbbreviatedName(team.abbreviated_name || "");
      setOriginalTeamName(team.name);
      setOriginalAbbreviatedName(team.abbreviated_name || "");
      setInviteCode(team.invite_code);

      // Fetch current team members
      await fetchCurrentMembers();
      
      // Fetch pending invitations (we'll need to create this functionality)
      await fetchPendingInvitations();
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

  const handleTeamNameChange = async (newName: string, newAbbreviatedName: string) => {
    console.log("handleTeamNameChange called with:", { 
      newName, 
      newAbbreviatedName, 
      originalTeamName, 
      originalAbbreviatedName,
      currentTeamName: teamName, 
      currentAbbreviatedName: abbreviatedName 
    });
    
    if (!newName.trim()) {
      console.log("Skipping update: empty name");
      return;
    }
    
    // Compare against original values from database, not current state
    if (newName === originalTeamName && newAbbreviatedName === originalAbbreviatedName) {
      console.log("Skipping update: no changes from original values");
      return;
    }
    
    console.log("Updating team:", { teamId, newName, newAbbreviatedName });
    
    setUpdatingName(true);
    try {
      // Check current user and their role
      const { data: { user } } = await supabase.auth.getUser();
      console.log("Current user:", user?.id);
      
      // Check user's role in this team
      const { data: teamMember, error: memberError } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", user?.id)
        .single();
      
      console.log("User role in team:", { teamMember, memberError });
      
      const { data, error } = await supabase
        .from("teams")
        .update({ 
          name: newName,
          abbreviated_name: newAbbreviatedName || null
        })
        .eq("id", teamId)
        .select();

      console.log("Update result:", { data, error });

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      setTeamName(newName);
      setAbbreviatedName(newAbbreviatedName);
      setOriginalTeamName(newName);
      setOriginalAbbreviatedName(newAbbreviatedName);
      toast({
        title: "Team updated",
        description: "Team name has been updated successfully",
      });
    } catch (error: unknown) {
      console.error("Update failed:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred" || "Failed to update team",
        variant: "destructive",
      });
    } finally {
      setUpdatingName(false);
    }
  };

  const fetchCurrentMembers = async () => {
    try {
      const { data: members, error } = await supabase
        .from("team_members")
        .select(`
          id,
          user_id,
          role,
          profiles:user_id(id, full_name, email, avatar_url)
        `)
        .eq("team_id", teamId);

      if (error) throw error;

      setCurrentMembers(members || []);
    } catch (error: unknown) {
      console.error("Error fetching current members:", error);
    }
  };

  const fetchPendingInvitations = async () => {
    try {
      const { data: invitations, error } = await supabase
        .from("invitations")
        .select("email, created_at, expires_at")
        .eq("team_id", teamId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      const pendingEmails = invitations?.map(inv => inv.email) || [];
      setPendingInvitations(pendingEmails);
    } catch (error: unknown) {
      console.error("Error fetching pending invitations:", error);
    }
  };

  const parseEmails = (input: string) => {
    // Split by comma, semicolon, or newline
    const parsed = input
      .split(/[,;\n]+/)
      .map(email => email.trim())
      .filter(email => email.length > 0);
    
    // Basic email validation
    const validEmails = parsed.filter(email => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    });

    // Filter out emails that are already members or pending invitations
    const currentMemberEmails = currentMembers.map(member => member.profiles?.email).filter(Boolean);
    const alreadyInvitedEmails = pendingInvitations;
    const allExistingEmails = [...currentMemberEmails, ...alreadyInvitedEmails];
    
    const newEmails = validEmails.filter(email => 
      !allExistingEmails.includes(email.toLowerCase())
    );

    return newEmails;
  };

  const handleEmailInputChange = (value: string) => {
    setEmailInput(value);
    const parsedEmails = parseEmails(value);
    setEmails(parsedEmails);
  };

  const handleSendInvites = async () => {
    if (emails.length === 0) {
      toast({
        title: "No emails",
        description: "Please enter at least one email address",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user's name for the email
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      // Separate new emails from already invited ones
      const alreadyInvited: string[] = [];
      const newEmails: string[] = [];
      
      emails.forEach(email => {
        if (pendingInvitations.includes(email.toLowerCase())) {
          alreadyInvited.push(email);
        } else {
          newEmails.push(email);
        }
      });

      // If all emails are already invited, show a message
      if (newEmails.length === 0 && alreadyInvited.length > 0) {
        toast({
          title: "Already invited",
          description: `${alreadyInvited.join(', ')} ${alreadyInvited.length > 1 ? 'have' : 'has'} already been invited. Use the "Resend" button to send a reminder.`,
          variant: "destructive",
        });
        setSending(false);
        return;
      }

      // Create invitation records only for new emails
      if (newEmails.length > 0) {
        const invitations = newEmails.map(email => ({
          team_id: teamId,
          email: email.toLowerCase(),
          invited_by: user.id,
          role: 'member' as const,
          status: 'pending' as const,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
        }));

        const { error } = await supabase
          .from("invitations")
          .insert(invitations);

        if (error) throw error;

        // Send invitation emails via Edge Function
        const inviteLink = `${window.location.origin}/join/${inviteCode}`;
        
        const emailPromises = newEmails.map(email =>
          supabase.functions.invoke('send-invitation-email', {
            body: {
              email,
              teamName,
              inviterName: profile?.full_name || 'A teammate',
              inviteLink,
            },
          })
        );

        await Promise.all(emailPromises);
      }

      // Show appropriate toast message
      let message = "";
      if (newEmails.length > 0 && alreadyInvited.length > 0) {
        message = `Invited ${newEmails.length} new member${newEmails.length > 1 ? 's' : ''}. ${alreadyInvited.length} email${alreadyInvited.length > 1 ? 's were' : ' was'} already invited.`;
      } else if (newEmails.length > 0) {
        message = `Invitation email sent to ${newEmails.length} team member${newEmails.length > 1 ? 's' : ''}`;
      }

      toast({
        title: "Invites sent!",
        description: message,
      });
      
      setEmailInput("");
      setEmails([]);
      
      // Refresh current members and pending invitations
      await fetchCurrentMembers();
      await fetchPendingInvitations();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleResendInvitation = async (email: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user's name for the email
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      // Send reminder email via Edge Function
      const inviteLink = `${window.location.origin}/join/${inviteCode}`;
      
      await supabase.functions.invoke('send-invitation-email', {
        body: {
          email,
          teamName,
          inviterName: profile?.full_name || 'A teammate',
          inviteLink,
        },
      });

      toast({
        title: "Reminder sent!",
        description: `Invitation reminder sent to ${email}`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDeleteInvitation = async (email: string) => {
    try {
      const { error } = await supabase
        .from("invitations")
        .delete()
        .eq("team_id", teamId)
        .eq("email", email.toLowerCase());

      if (error) throw error;

      toast({
        title: "Invitation removed",
        description: `Invitation for ${email} has been removed`,
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

  const handleContinue = async () => {
    // Save team name changes before navigating
    await handleTeamNameChange(teamName, abbreviatedName);
    
    if (fromDashboard) {
      navigate("/dashboard");
    } else {
      navigate(`/team/${teamId}/setup-meeting`);
    }
  };

  const handleCopyLink = () => {
    const inviteLink = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast({
      title: "Link copied!",
      description: "Invite link copied to clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    try {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Member removed",
        description: `${memberName} has been removed from the team`,
      });

      await fetchCurrentMembers();
    } catch (error: unknown) {
      toast({
        title: "Error removing member",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTeam = async () => {
    try {
      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId);

      if (error) throw error;

      toast({
        title: "Team deleted",
        description: "The team and all related data have been permanently deleted.",
      });

      navigate("/dashboard");
    } catch (error: unknown) {
      toast({
        title: "Error deleting team",
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

  const inviteLink = `${window.location.origin}/join/${inviteCode}`;

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
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Set Up Your Team</h1>
        </div>

        <Card className="mb-4">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">Team Name</Label>
                      <Input
                        id="teamName"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        onBlur={(e) => handleTeamNameChange(e.target.value, abbreviatedName)}
                        disabled={updatingName}
                        placeholder="e.g., Executive Leadership Team"
                      />
            </div>
            
            <div className="space-y-2 ">
              <Label htmlFor="abbreviatedName">Short Name (Optional)</Label>
                      <Input
                        id="abbreviatedName"
                        value={abbreviatedName}
                        onChange={(e) => setAbbreviatedName(e.target.value)}
                        onBlur={(e) => handleTeamNameChange(teamName, e.target.value)}
                        disabled={updatingName}
                        placeholder="e.g., ELT"
                        maxLength={10}
                      />

            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Current Members */}
            {currentMembers.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-bold">Current Members</Label>
                <div className="space-y-2">
                  {currentMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.profiles?.avatar_url} />
                        <AvatarFallback className="text-xs">
                          {member.profiles?.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {member.profiles?.full_name || "Unknown User"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {member.profiles?.email}
                        </div>
                      </div>
                      <Badge variant={member.role === "admin" ? "default" : "secondary"} className="text-xs">
                        {member.role === "admin" ? "Admin" : "Member"}
                      </Badge>
                      {member.role !== "admin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleRemoveMember(member.id, member.profiles?.full_name || "Unknown User")}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Invitations */}
            {pendingInvitations.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-bold">Pending Invitations</Label>
                <div className="space-y-2">
                  {pendingInvitations.map((email, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                        <span className="text-xs font-medium text-orange-600">?</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-orange-800">{email}</div>
                        <div className="text-xs text-orange-600">Invitation sent</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleResendInvitation(email)}
                      >
                        Resend
                      </Button>
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                        Pending
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleDeleteInvitation(email)}
                      >
                        <X className="h-4 w-4 text-orange-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite New Members */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">Invite New Members</Label>
              <p className="text-sm text-muted-foreground">
                Enter email addresses separated by commas or new lines
              </p>
              <Textarea
                id="emails"
                placeholder="john@example.com, jane@example.com&#10;or paste multiple emails..."
                value={emailInput}
                onChange={(e) => handleEmailInputChange(e.target.value)}
                rows={3}
                className="resize-none"
              />
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {emails.map((email, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {email}
                    </Badge>
                  ))}
                </div>
              )}
              
              {/* Show info about duplicates */}
              {emailInput && parseEmails(emailInput).length !== emails.length && (
                <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                  Some emails were filtered out because they are already members or have pending invitations.
                </div>
              )}
              
              <p className="text-sm text-muted-foreground">
                {emails.length} new email{emails.length !== 1 ? 's' : ''} to invite
              </p>
            </div>

            <Button 
              onClick={handleSendInvites} 
              disabled={sending || emails.length === 0}
              className="w-full"
            >
              {sending ? "Sending..." : `Send Invite${emails.length !== 1 ? 's' : ''}`}
            </Button>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Or Share Invite Link</Label>
              <div className="flex gap-2">
                <Input 
                  value={inviteLink}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button 
                  onClick={handleCopyLink}
                  variant="outline"
                  size="icon"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>

        <Button 
          onClick={handleContinue}
          className="w-full mt-4"
        >
          {fromDashboard ? "Save and Go Back to Dashboard" : "Continue to Meeting Setup"}
        </Button>

        <Card className="mt-9 border-destructive/40 bg-red-50">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h2 className="font-semibold text-destructive">Danger Zone</h2>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold">Delete Team</h3>
                  <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {teamName}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all team data including meetings, topics, and member access.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteTeam}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete Team
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </GridBackground>
  );
};

export default TeamInvite;
