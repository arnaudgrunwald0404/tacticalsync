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

      // Create recurring meeting
      const { data: meeting, error } = await supabase
        .from("recurring_meetings")
        .insert({
          team_id: teamId,
          name: meetingName,
          frequency: frequency as "daily" | "weekly" | "bi-weekly" | "monthly",
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Calculate start date based on frequency
      const today = new Date();
      const startDate = frequency === "weekly" || frequency === "bi-weekly" 
        ? new Date(today.setDate(today.getDate() - today.getDay() + 1)) // Monday of current week
        : frequency === "monthly"
        ? new Date(today.getFullYear(), today.getMonth(), 1) // First of month
        : today;
      
      const startDateStr = startDate.toISOString().split('T')[0];

      // Create first weekly meeting instance (or get existing one)
      const { error: meetingError } = await supabase
        .from("weekly_meetings")
        .upsert({
          team_id: teamId,
          recurring_meeting_id: meeting.id,
          week_start_date: startDateStr
        }, {
          onConflict: 'recurring_meeting_id,week_start_date'
        });

      if (meetingError) throw meetingError;

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="minimal" size="lg" />
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Calendar className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Set Up Meeting</h1>
          <p className="text-muted-foreground">
            Choose a frequency and a name for your recurring meeting.</p>
        </div>

        <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="frequency">Meeting Frequency</Label>
                <p className="text-sm text-muted-foreground">
                  How often will this meeting occur?
                </p>
                <Select value={frequency} onValueChange={handleFrequencyChange}>
                  <SelectTrigger id="frequency">
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
                <Label htmlFor="meetingType">Meeting Type</Label>
                <p className="text-sm text-muted-foreground">
                  What will this meeting be about?
                </p>
                <Select value={meetingType} onValueChange={handleMeetingTypeChange}>
                  <SelectTrigger id="meetingType">
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
                <Label htmlFor="meetingName">Meeting Name</Label>
                <p className="text-sm text-muted-foreground">
                  Auto-generated, but you can customize it
                </p>
                <Input
                  id="meetingName"
                  value={meetingName}
                  onChange={(e) => handleMeetingNameChange(e.target.value)}
                  placeholder="e.g., Weekly Tactical, Monthly Review"
                  required
                />

              </div>

              <Button 
                onClick={handleSave}
                disabled={saving || !meetingName.trim()}
                className="w-full"
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

