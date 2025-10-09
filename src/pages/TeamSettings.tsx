import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Upload, Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TeamSettings = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState("");

  useEffect(() => {
    if (teamId) {
      fetchTeamData();
    }
  }, [teamId]);

  const fetchTeamData = async () => {
    try {
      // Fetch team
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single();

      if (teamError) throw teamError;
      setTeam(teamData);

      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from("team_members")
        .select(`
          *,
          profiles:user_id(id, email, full_name, avatar_url)
        `)
        .eq("team_id", teamId);

      if (membersError) throw membersError;
      setMembers(membersData || []);
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

  const handleAvatarUpload = async (memberId: string, file: File) => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${memberId}-${Date.now()}.${fileExt}`;
      
      // In a real app, you'd upload to Supabase Storage here
      // For now, we'll just show a placeholder
      toast({
        title: "Avatar upload",
        description: "Avatar upload would happen here with Supabase Storage",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Member removed",
        description: "Team member has been removed successfully",
      });

      fetchTeamData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate(`/team/${teamId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Meeting
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Team Settings</h1>
          <p className="text-muted-foreground">{team?.name}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage your team members and their roles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={member.custom_avatar_url || member.profiles?.avatar_url} />
                      <AvatarFallback>
                        {member.profiles?.full_name?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <label className="absolute bottom-0 right-0 cursor-pointer">
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90">
                        <Upload className="h-3 w-3 text-primary-foreground" />
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAvatarUpload(member.id, file);
                        }}
                      />
                    </label>
                  </div>
                  <div>
                    <p className="font-semibold">{member.profiles?.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.profiles?.email}
                    </p>
                    {member.title && (
                      <p className="text-sm text-muted-foreground italic">
                        {member.title}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {member.role}
                  </span>
                  {member.role !== "admin" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite Code</CardTitle>
            <CardDescription>
              Share this code with team members to let them join
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={team?.invite_code || ""}
                readOnly
                className="font-mono"
              />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/join/${team?.invite_code}`
                  );
                  toast({
                    title: "Copied!",
                    description: "Invite link copied to clipboard",
                  });
                }}
              >
                Copy Link
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default TeamSettings;