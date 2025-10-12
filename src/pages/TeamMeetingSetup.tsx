import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Check, Settings, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";

interface TemplateItem {
  id: string;
  title: string;
  duration_minutes: number;
  order_index: number;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  items?: TemplateItem[];
}

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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

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

      // Fetch templates
      const { data: templatesData, error: templatesError } = await supabase
        .from("agenda_templates")
        .select(`
          *,
          items:agenda_template_items(*)
        `)
        .order("created_at", { ascending: false });

      if (!templatesError && templatesData) {
        const templatesWithSortedItems = templatesData.map(template => ({
          ...template,
          items: (template.items || []).sort((a: TemplateItem, b: TemplateItem) => a.order_index - b.order_index),
        }));
        setTemplates(templatesWithSortedItems);
      }
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

      // If a template is selected, add the template items to the standing agenda
      if (selectedTemplateId) {
        const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
        if (selectedTemplate && selectedTemplate.items) {
          // We need to get or create the first weekly meeting instance
          // For now, we'll store template in meeting metadata or add items when first meeting is created
          // Let's add template items to the standing agenda column if we have one
          // Since we don't have a standing_agenda column on recurring_meetings yet,
          // we'll just note this for the user
          toast({
            title: "Note",
            description: "Navigate to your meeting to add agenda items from the template",
          });
        }
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const totalDuration = selectedTemplate?.items?.reduce((total, item) => total + item.duration_minutes, 0) || 0;

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
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Calendar className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Set Up Meeting</h1>
          <p className="text-muted-foreground">
            Choose how often your team will meet
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="frequency">Meeting Frequency</Label>
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
                <p className="text-sm text-muted-foreground">
                  How often will this meeting occur?
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="meetingType">Meeting Type</Label>
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
                <p className="text-sm text-muted-foreground">
                  What type of meeting is this?
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="meetingName">Meeting Name</Label>
                <Input
                  id="meetingName"
                  value={meetingName}
                  onChange={(e) => handleMeetingNameChange(e.target.value)}
                  placeholder="e.g., Weekly Tactical, Monthly Review"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Auto-generated from frequency and type, but you can customize it
                </p>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Agenda Template (Optional)</CardTitle>
              <CardDescription>
                Start with a pre-defined agenda template
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {templates.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p>No templates yet</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className={`
                          p-3 border rounded-lg cursor-pointer transition-all
                          ${selectedTemplateId === template.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'}
                        `}
                        onClick={() => setSelectedTemplateId(
                          selectedTemplateId === template.id ? "" : template.id
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-medium flex items-center gap-2">
                              {template.name}
                              {selectedTemplateId === template.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            {template.description && (
                              <div className="text-sm text-muted-foreground mt-1">
                                {template.description}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground mt-2">
                              {template.items?.length || 0} items
                              {template.items && template.items.length > 0 && (
                                <> · {template.items.reduce((sum, item) => sum + item.duration_minutes, 0)} min</>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedTemplate && selectedTemplate.items && selectedTemplate.items.length > 0 && (
                    <div className="border-t pt-4 space-y-2">
                      <div className="font-medium text-sm mb-2">Template Preview:</div>
                      {selectedTemplate.items.map((item, index) => (
                        <div 
                          key={item.id} 
                          className="flex justify-between text-sm p-2 bg-muted/50 rounded"
                        >
                          <span className="text-muted-foreground">
                            {index + 1}. {item.title}
                          </span>
                          <span className="text-muted-foreground">
                            {item.duration_minutes}m
                          </span>
                        </div>
                      ))}
                      <div className="text-xs text-muted-foreground text-right pt-2">
                        Total: {totalDuration} minutes
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </GridBackground>
  );
};

export default TeamMeetingSetup;

