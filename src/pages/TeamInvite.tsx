import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Copy, Check, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const TeamInvite = () => {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [frequency, setFrequency] = useState<string>("weekly");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);

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
      setInviteCode(team.invite_code);
      setFrequency(team.frequency || "weekly");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleTeamNameChange = async (newName: string) => {
    if (!newName.trim() || newName === teamName) return;
    
    setUpdatingName(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ name: newName })
        .eq("id", teamId);

      if (error) throw error;

      setTeamName(newName);
      toast({
        title: "Team name updated",
        description: "Team name has been updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdatingName(false);
    }
  };

  const handleFrequencyChange = async (value: "daily" | "weekly" | "bi-weekly" | "monthly") => {
    setFrequency(value);
    
    try {
      const { error } = await supabase
        .from("teams")
        .update({ frequency: value })
        .eq("id", teamId);

      if (error) throw error;

      toast({
        title: "Frequency updated",
        description: `Meeting frequency set to ${value}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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

    return validEmails;
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
      // Here you would implement the email sending logic
      // For now, we'll just show a success message
      toast({
        title: "Invites sent!",
        description: `Invitation emails sent to ${emails.length} team member${emails.length > 1 ? 's' : ''}`,
      });
      
      setEmailInput("");
      setEmails([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleSkip = () => {
    navigate(`/team/${teamId}`);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const inviteLink = `${window.location.origin}/join/${inviteCode}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
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
                onBlur={(e) => handleTeamNameChange(e.target.value)}
                disabled={updatingName}
                placeholder="Enter team name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequency" className="text-sm">Meeting Frequency</Label>
              <Select value={frequency} onValueChange={handleFrequencyChange}>
                <SelectTrigger id="frequency" className="h-9">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Enter email addresses separated by commas, semicolons, or new lines
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emails">Email Addresses</Label>
              <Textarea
                id="emails"
                placeholder="john@example.com, jane@example.com&#10;or paste multiple emails..."
                value={emailInput}
                onChange={(e) => handleEmailInputChange(e.target.value)}
                rows={5}
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
              <p className="text-sm text-muted-foreground">
                {emails.length} email{emails.length !== 1 ? 's' : ''} detected
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

            <Button 
              onClick={handleSkip} 
              variant="ghost"
              className="w-full"
            >
              Continue to Meeting
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default TeamInvite;
