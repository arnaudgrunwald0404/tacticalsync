import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { useRoles } from "@/hooks/useRoles";
import { getMeetingStartDate, getISODateString } from "@/lib/dateUtils";

const TeamMeetingSetup = () => {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [frequency, setFrequency] = useState<string>("weekly");
  const [meetingType, setMeetingType] = useState<string>("tactical");
  const [meetingName, setMeetingName] = useState<string>("");
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const [teamAbbreviatedName, setTeamAbbreviatedName] = useState<string>("");
  const { isAdmin, isSuperAdmin, loading: rolesLoading } = useRoles();
  const [isTeamMember, setIsTeamMember] = useState<boolean>(false);

  const generateMeetingName = (freq: string, type: string): string => {
    const frequencyLabels: Record<string, string> = {
      daily: "Daily",
      weekly: "Weekly",
      "bi-weekly": "Bi-weekly",
      monthly: "Monthly",
    };
    
    const typeLabels: Record<string, string> = {
      tactical: "Tactical",
      strategic: "Strategic",
      adhoc: "Ad hoc",
    };
    
    const abbreviatedName = teamAbbreviatedName || "Team";
    return `${abbreviatedName} ${frequencyLabels[freq] || "Weekly"} ${typeLabels[type] || "Tactical"}`;
  };

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

      // Check membership (admins must be members; super admins can bypass)
      const { data: membership } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .maybeSingle();
      setIsTeamMember(Boolean(membership));

      // Set team abbreviated name and default values
      const abbreviatedName = team.abbreviated_name || "";
      setTeamAbbreviatedName(abbreviatedName);
      setFrequency("weekly");
      setMeetingType("tactical");
      
      // Generate initial meeting name with team abbreviated name
      const frequencyLabels = { daily: "Daily", weekly: "Weekly", "bi-weekly": "Bi-weekly", monthly: "Monthly" };
      const typeLabels = { tactical: "Tactical", strategic: "Strategic", adhoc: "Ad hoc" };
      const initialName = `${abbreviatedName || "Team"} ${frequencyLabels["weekly"]} ${typeLabels["tactical"]}`;
      setMeetingName(initialName);
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

  const handleSave = async () => {
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create meeting series
      const { data: meeting, error } = await supabase
        .from("meeting_series")
        .insert({
          team_id: teamId,
          name: meetingName,
          frequency: frequency as "daily" | "weekly" | "bi-weekly" | "monthly",
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Calculate start date based on frequency using proper utility function
      const today = new Date();
      const startDate = getMeetingStartDate(frequency, today);
      const startDateStr = getISODateString(startDate);

      // Create first meeting instance (or get existing one)
      // First, check if it already exists
      const { data: existingMeeting } = await supabase
        .from("meeting_instances")
        .select()
        .eq("series_id", meeting.id)
        .eq("start_date", startDateStr)
        .maybeSingle();

      let meetingInstance;
      
      if (existingMeeting) {
        // Use existing meeting
        meetingInstance = existingMeeting;
      } else {
        // Create new meeting
        const { data: newMeeting, error: meetingError } = await supabase
          .from("meeting_instances")
          .insert({
            series_id: meeting.id,
            start_date: startDateStr
          })
          .select()
          .single();

        if (meetingError) throw meetingError;
        meetingInstance = newMeeting;
      }

      toast({
        title: "Meeting created!",
        description: `${meetingName} has been set up successfully`,
      });

      navigate(`/team/${teamId}/meeting/${meeting.id}`);
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

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    // Auto-update meeting name if not manually edited
    if (!isNameManuallyEdited) {
      setMeetingName(generateMeetingName(value, meetingType));
    }
  };

  const handleMeetingTypeChange = (value: string) => {
    setMeetingType(value);
    // Auto-update meeting name if not manually edited
    if (!isNameManuallyEdited) {
      setMeetingName(generateMeetingName(frequency, value));
    }
  };

  const handleMeetingNameChange = (value: string) => {
    setMeetingName(value);
    // Mark as manually edited if user changes from auto-generated name
    const currentGeneratedName = generateMeetingName(frequency, meetingType);
    if (value !== currentGeneratedName) {
      setIsNameManuallyEdited(true);
    }
  };

  if (loading || rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!(isSuperAdmin || (isAdmin && isTeamMember))) {
    return (
      <GridBackground inverted className="min-h-screen bg-blue-50 overscroll-none">
        <header className="border-b bg-white">
          <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-8 sm:h-10">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back to Home</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 sm:py-8 max-w-2xl">
          <Card>
            <CardContent className="pt-4 sm:pt-6 p-4 sm:p-6 space-y-3">
              <div className="text-sm text-muted-foreground">
                You don’t have permission to create meetings for this team. Admins must be team members; super admins can create for any team.
              </div>
              <div>
                <Button variant="secondary" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </GridBackground>
    );
  }

  return (
    <GridBackground inverted className="min-h-screen bg-blue-50 overscroll-none">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-8 sm:h-10">
            <ArrowLeft className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Back to Home</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-2xl">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 mb-4">
            <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            <span className="bg-gradient-to-r from-blue-600 via-pink-500 to-blue-600 bg-clip-text text-transparent font-light text-4xl tracking-tight">Great! </span>
            {" Now Let's Set Up Your Team Meeting"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground px-4">
            Choose a frequency and a name for your recurring meeting.</p>
        </div>

        <Card>
            <CardContent className="pt-4 sm:pt-6 p-4 sm:p-6 space-y-5 sm:space-y-6">
              <div className="space-y-2">
                <Label htmlFor="frequency" className="text-sm sm:text-base">How often will this meeting occur?</Label>

                <Select value={frequency} onValueChange={handleFrequencyChange}>
                  <SelectTrigger id="frequency" className="h-10 sm:h-11">
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

              <div className="space-y-2">
                <Label htmlFor="meetingType" className="text-sm sm:text-base">What will this meeting be about?</Label>

                <Select value={meetingType} onValueChange={handleMeetingTypeChange}>
                  <SelectTrigger id="meetingType" className="h-10 sm:h-11">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="tactical">Tactical</SelectItem>
                    <SelectItem value="strategic">Strategic</SelectItem>
                    <SelectItem value="adhoc">Ad hoc</SelectItem>
                  </SelectContent>
                </Select>
                
              </div>

              <div className="space-y-2">
                <Label htmlFor="meetingName" className="text-sm sm:text-base">Meeting Name. Auto-generated. You can customize it</Label>
          
                <Input
                  id="meetingName"
                  value={meetingName}
                  onChange={(e) => handleMeetingNameChange(e.target.value)}
                  placeholder="e.g., Weekly Tactical, Monthly Review"
                  required
                  className="h-10 sm:h-11"
                />

              </div>

              <Button 
                onClick={handleSave}
                disabled={saving || !meetingName.trim()}
                className="w-full h-10 sm:h-11 text-sm sm:text-base"
              >
                {saving ? "Creating..." : "Create Meeting"}
              </Button>
            </CardContent>
          </Card>
      </main>
    </GridBackground>
  );
};

export default TeamMeetingSetup;

