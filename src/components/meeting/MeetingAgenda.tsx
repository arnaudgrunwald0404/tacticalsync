import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PersonalityHoverCard } from "@/components/PersonalityHoverCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Plus, Settings, Trash2, Edit2, Save, X, FileText, Sparkles } from "lucide-react";
import { htmlToPlainText } from "@/lib/htmlUtils";
import RichTextEditor from "@/components/ui/rich-text-editor";

interface MeetingAgendaProps {
  items: any[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
}

export interface MeetingAgendaRef {
  startEditing: () => void;
  isEditing: () => boolean;
  saveChanges: () => Promise<void>;
  cancelEditing: () => void;
}

const MeetingAgenda = forwardRef<MeetingAgendaRef, MeetingAgendaProps>(({ items, meetingId, teamId, onUpdate }, ref) => {
  const { toast } = useToast();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [standingAgendaItems, setStandingAgendaItems] = useState<any[]>([]);
  const [isEditingStanding, setIsEditingStanding] = useState(false);
  const [savingStanding, setSavingStanding] = useState(false);
  const [isEditingAgenda, setIsEditingAgenda] = useState(false);
  const [editingItems, setEditingItems] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adoptingTemplate, setAdoptingTemplate] = useState(false);
  const [isAddingManually, setIsAddingManually] = useState(false);
  const [manualItems, setManualItems] = useState<any[]>([]);

  useEffect(() => {
    fetchTeamMembers();
    fetchStandingAgendaItems();
    checkIfAdmin();
  }, [teamId]);

  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(full_name, avatar_url, red_percentage, blue_percentage, green_percentage, yellow_percentage)
      `)
      .eq("team_id", teamId);

    if (error) {
      console.error("Error fetching team members:", error);
      return;
    }

    setTeamMembers(data || []);
  };

  const fetchStandingAgendaItems = async () => {
    try {
      // For now, we'll use a simple approach - store standing agenda items in team settings
      // In a real app, you might have a separate standing_agenda_items table
      const { data: team, error } = await supabase
        .from("teams")
        .select("standing_agenda_items")
        .eq("id", teamId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      const standingItems = team?.standing_agenda_items || [];
      setStandingAgendaItems(standingItems);
    } catch (error: any) {
      console.error("Error fetching standing agenda items:", error);
    }
  };

  const checkIfAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberData, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .single();

      if (!error && memberData) {
        setIsAdmin(memberData.role === "admin");
      }
    } catch (error: any) {
      console.error("Error checking admin status:", error);
    }
  };

  const updateStandingAgendaItem = (index: number, field: 'name' | 'assigned_to' | 'time_minutes', value: any) => {
    const updated = [...standingAgendaItems];
    if (!updated[index]) {
      updated[index] = { name: '', assigned_to: null, time_minutes: null };
    }
    updated[index][field] = value;
    setStandingAgendaItems(updated);
  };

  const addStandingAgendaItem = () => {
    setStandingAgendaItems([...standingAgendaItems, { name: '', assigned_to: null, time_minutes: null }]);
  };

  const startEditingStanding = () => {
    if (standingAgendaItems.length === 0) {
      // Add first item when starting
      setStandingAgendaItems([{ name: '', assigned_to: null, time_minutes: null }]);
    }
    setIsEditingStanding(true);
  };

  const removeStandingAgendaItem = (index: number) => {
    const updated = standingAgendaItems.filter((_, i) => i !== index);
    setStandingAgendaItems(updated);
  };

  const saveStandingAgenda = async () => {
    setSavingStanding(true);
    try {
      console.log("Saving standing agenda:", { teamId, standingAgendaItems });
      
      // Filter out items with empty names
      const validItems = standingAgendaItems.filter(item => item.name && item.name.trim());
      
      console.log("Valid items to save:", validItems);
      
      const { data, error } = await supabase
        .from("teams")
        .update({ standing_agenda_items: validItems })
        .eq("id", teamId)
        .select();

      console.log("Update result:", { data, error });

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      // Auto-create agenda items in the current meeting
      if (validItems.length > 0 && meetingId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            const inserts = validItems.map((item, idx) => ({
              meeting_id: meetingId,
              type: "agenda" as const,
              title: item.name.trim(),
              order_index: idx,
              created_by: user.id,
              assigned_to: item.assigned_to,
              time_minutes: item.time_minutes,
            }));
            const { error: insertErr } = await supabase
              .from("meeting_items")
              .insert(inserts);
            if (insertErr) {
              console.warn("Failed to create meeting items:", insertErr);
            }
          } catch (err) {
            console.warn("Failed to create meeting items:", err);
          }
        }
      }

      toast({
        title: "Standing agenda saved!",
        description: "Your standing agenda items have been updated",
      });

      setIsEditingStanding(false);
      onUpdate(); // Refresh the current meeting agenda
    } catch (error: any) {
      console.error("Save failed:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save standing agenda. Make sure the standing_agenda_items column exists in your database.",
        variant: "destructive",
      });
    } finally {
      setSavingStanding(false);
    }
  };

  const handleToggleComplete = async (itemId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ is_completed: !currentStatus })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
      return;
    }

    onUpdate();
  };

  const handleUpdateNotes = async (itemId: string, notes: string) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ notes })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update notes",
        variant: "destructive",
      });
    }
  };

  const handleUpdateAssignedTo = async (itemId: string, userId: string | null) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ assigned_to: userId })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update assignment",
        variant: "destructive",
      });
      return;
    }

    onUpdate();
  };

  const handleUpdateTime = async (itemId: string, minutes: string) => {
    const timeValue = minutes ? parseInt(minutes) : null;
    
    // Validate that time is a positive whole number
    if (timeValue !== null && (timeValue < 0 || !Number.isInteger(timeValue))) {
      toast({
        title: "Invalid time",
        description: "Time must be a positive whole number",
        variant: "destructive",
      });
      return;
    }
    
    const { error } = await supabase
      .from("meeting_items")
      .update({ time_minutes: timeValue })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update time",
        variant: "destructive",
      });
    }
  };

  const startEditingAgenda = () => {
    setEditingItems([...items]);
    setIsEditingAgenda(true);
  };

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (meetingStarted && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [meetingStarted, startTime]);

  const startMeeting = () => {
    setMeetingStarted(true);
    setStartTime(new Date());
    setElapsedTime(0);
  };

  const stopMeeting = () => {
    setMeetingStarted(false);
    setStartTime(null);
    setElapsedTime(0);
  };

  const getItemProgress = (item: any, itemIndex: number) => {
    if (!meetingStarted || !startTime) return 0;
    
    // Calculate cumulative time up to this item
    let cumulativeTime = 0;
    for (let i = 0; i < itemIndex; i++) {
      cumulativeTime += items[i]?.time_minutes || 0;
    }
    
    const itemStartSeconds = cumulativeTime * 60;
    const itemDurationSeconds = (item.time_minutes || 0) * 60;
    const itemEndSeconds = itemStartSeconds + itemDurationSeconds;
    
    // If we haven't reached this item yet
    if (elapsedTime < itemStartSeconds) return 0;
    
    // If we're past this item
    if (elapsedTime >= itemEndSeconds) return 100;
    
    // Calculate progress within this item
    const progressInItem = ((elapsedTime - itemStartSeconds) / itemDurationSeconds) * 100;
    return Math.max(0, Math.min(100, progressInItem));
  };

  useImperativeHandle(ref, () => ({
    startEditing: startEditingAgenda,
    isEditing: () => isEditingAgenda,
    saveChanges: saveAgendaEdits,
    cancelEditing: cancelEditingAgenda,
  }));

  const cancelEditingAgenda = () => {
    setEditingItems([]);
    setIsEditingAgenda(false);
  };

  const updateEditingItem = (index: number, field: string, value: any) => {
    const updated = [...editingItems];
    updated[index][field] = value;
    setEditingItems(updated);
  };

  const saveAgendaEdits = async () => {
    try {
      for (const item of editingItems) {
        const { error } = await supabase
          .from("meeting_items")
          .update({
            title: item.title,
            assigned_to: item.assigned_to,
            time_minutes: item.time_minutes
          })
          .eq("id", item.id);

        if (error) throw error;
      }

      toast({
        title: "Agenda updated!",
        description: "Your changes have been saved",
      });

      setIsEditingAgenda(false);
      setEditingItems([]);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const adoptOpeningCommentsTemplate = async () => {
    setAdoptingTemplate(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const openingCommentsTemplate = [
        { name: "Leader Opening Comments", time_minutes: 2 },
        { name: "Review Last Week's Items", time_minutes: 4 },
        { name: "Calendar Review", time_minutes: 2 },
        { name: "Lightning Round", time_minutes: 10 },
        { name: "ELT Scorecard", time_minutes: 10 },
        { name: "Employees At-Risk", time_minutes: 10 },
      ];

      const inserts = openingCommentsTemplate.map((item, idx) => ({
        meeting_id: meetingId,
        type: "agenda" as const,
        title: item.name,
        order_index: idx,
        created_by: user.id,
        assigned_to: null,
        time_minutes: item.time_minutes,
      }));

      const { error } = await supabase
        .from("meeting_items")
        .insert(inserts);

      if (error) throw error;

      toast({
        title: "Template adopted!",
        description: "Opening Comments template has been added to your agenda",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdoptingTemplate(false);
    }
  };

  const adoptStandingAgendaTemplate = async () => {
    setAdoptingTemplate(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (standingAgendaItems.length === 0) {
        toast({
          title: "No standing agenda",
          description: "Please set up a standing agenda first",
          variant: "destructive",
        });
        return;
      }

      const inserts = standingAgendaItems.map((item, idx) => ({
        meeting_id: meetingId,
        type: "agenda" as const,
        title: item.name,
        order_index: idx,
        created_by: user.id,
        assigned_to: item.assigned_to || null,
        time_minutes: item.time_minutes || null,
      }));

      const { error } = await supabase
        .from("meeting_items")
        .insert(inserts);

      if (error) throw error;

      toast({
        title: "Template adopted!",
        description: "Standing agenda has been added to your agenda",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdoptingTemplate(false);
    }
  };

  const startAddingManually = () => {
    setIsAddingManually(true);
    setManualItems([
      { id: "1", name: "", assigned_to: null, time_minutes: null },
      { id: "2", name: "", assigned_to: null, time_minutes: null },
      { id: "3", name: "", assigned_to: null, time_minutes: null }
    ]);
  };

  const cancelAddingManually = () => {
    setIsAddingManually(false);
    setManualItems([]);
  };

  const updateManualItem = (index: number, field: 'name' | 'assigned_to' | 'time_minutes', value: any) => {
    const updated = [...manualItems];
    if (!updated[index]) {
      updated[index] = { id: `${index + 1}`, name: '', assigned_to: null, time_minutes: null };
    }
    updated[index][field] = value;
    setManualItems(updated);
  };

  const addManualItemRow = () => {
    const newId = (manualItems.length + 1).toString();
    setManualItems([...manualItems, { id: newId, name: "", assigned_to: null, time_minutes: null }]);
  };

  const removeManualItemRow = (index: number) => {
    if (manualItems.length > 1) {
      setManualItems(manualItems.filter((_, i) => i !== index));
    }
  };

  const saveManualItems = async () => {
    const validItems = manualItems.filter(item => item.name && item.name.trim());
    
    if (validItems.length === 0) {
      toast({
        title: "No items to save",
        description: "Please enter at least one agenda item",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const nextOrderIndex = items.length;

      const inserts = validItems.map((item, idx) => ({
        meeting_id: meetingId,
        type: "agenda" as const,
        title: item.name.trim(),
        order_index: nextOrderIndex + idx,
        created_by: user.id,
        assigned_to: item.assigned_to,
        time_minutes: item.time_minutes,
      }));

      const { error } = await supabase
        .from("meeting_items")
        .insert(inserts);

      if (error) throw error;

      toast({
        title: "Items added!",
        description: `${validItems.length} agenda item${validItems.length > 1 ? 's' : ''} added successfully`,
      });

      cancelAddingManually();
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Check if any items have assignments or times set
  const hasAssignmentsOrTimes = items.some(item => 
    item.assigned_to !== null || item.time_minutes !== null
  );

  return (
    <div className="space-y-4">
      {items.length > 0 && !hasAssignmentsOrTimes && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertDescription className="text-orange-800">
            Set up assignments and times for each of the standing agenda items. They will be used as defaults for the next meeting iterations.
          </AlertDescription>
        </Alert>
      )}
      
      {items.length === 0 && !isEditingStanding && !isAddingManually && (
        <div className="text-center py-8 border rounded-lg bg-muted/20">
          <div className="max-w-2xl mx-auto px-4">
            <p className="text-sm text-muted-foreground mb-6">No agenda items yet. Start with a template or create your own.</p>
            
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              {/* Opening Comments Template */}
              <div className="border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="font-semibold mb-1">Opening Comments Template</h3>
                    <p className="text-xs text-muted-foreground mb-2">Recommended for tactical meetings</p>
                  </div>
                </div>
                <div className="text-left text-xs text-muted-foreground space-y-1 mb-4">
                  <div className="flex justify-between">
                    <span>• Leader Opening Comments</span>
                    <span className="text-primary font-medium">2 min</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Review Last Week's Items</span>
                    <span className="text-primary font-medium">4 min</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Calendar Review</span>
                    <span className="text-primary font-medium">2 min</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Lightning Round</span>
                    <span className="text-primary font-medium">10 min</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• ELT Scorecard</span>
                    <span className="text-primary font-medium">10 min</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Employees At-Risk</span>
                    <span className="text-primary font-medium">10 min</span>
                  </div>
                </div>
                <Button 
                  onClick={adoptOpeningCommentsTemplate} 
                  disabled={adoptingTemplate}
                  className="w-full"
                  size="sm"
                >
                  {adoptingTemplate ? "Adopting..." : "Adopt This Template"}
                </Button>
              </div>

              {/* Standing Agenda Template */}
              {standingAgendaItems.length > 0 ? (
                <div className="border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-secondary/10">
                      <FileText className="h-5 w-5 text-secondary" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold mb-1">Standing Agenda</h3>
                      <p className="text-xs text-muted-foreground mb-2">Your team's custom template</p>
                    </div>
                  </div>
                  <div className="text-left text-xs text-muted-foreground space-y-1 mb-4 max-h-32 overflow-y-auto">
                    {standingAgendaItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>• {htmlToPlainText(item.name)}</span>
                        {item.time_minutes && (
                          <span className="text-primary font-medium">{item.time_minutes} min</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button 
                    onClick={adoptStandingAgendaTemplate} 
                    disabled={adoptingTemplate}
                    variant="secondary"
                    className="w-full"
                    size="sm"
                  >
                    {adoptingTemplate ? "Adopting..." : "Adopt This Template"}
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-secondary/10">
                      <Settings className="h-5 w-5 text-secondary" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold mb-1">Standing Agenda</h3>
                      <p className="text-xs text-muted-foreground mb-2">Create a custom template for your team</p>
                    </div>
                  </div>
                  <div className="text-left text-xs text-muted-foreground mb-4">
                    <p>Set up a standing agenda that will be available as a template for all future meetings.</p>
                  </div>
                  <Button 
                    onClick={startEditingStanding}
                    variant="secondary"
                    className="w-full"
                    size="sm"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Create Standing Agenda
                  </Button>
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground mb-3">
              Or start from scratch:
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={startAddingManually}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Items Manually
            </Button>
          </div>
        </div>
      )}

      {isAddingManually && items.length === 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Add Agenda Items</h3>
          {manualItems.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="flex-1">
                <RichTextEditor
                  content={item.name || ''}
                  onChange={(content) => updateManualItem(index, 'name', content)}
                  placeholder="Agenda item name"
                />
              </div>
              <Select 
                value={item.assigned_to || 'unassigned'} 
                onValueChange={(value) => updateManualItem(index, 'assigned_to', value === 'unassigned' ? null : value)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.profiles?.full_name || 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Min"
                value={item.time_minutes || ''}
                onChange={(e) => updateManualItem(index, 'time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                className="w-16"
              />
              {manualItems.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeManualItemRow(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={addManualItemRow} className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              Add Another Item
            </Button>
            <Button 
              onClick={saveManualItems}
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Agenda Items
            </Button>
            <Button variant="outline" onClick={cancelAddingManually}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 && isEditingStanding && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Set Standing Agenda</h3>
          {standingAgendaItems.map((item, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex-1">
                <RichTextEditor
                  content={item.name || ''}
                  onChange={(content) => updateStandingAgendaItem(index, 'name', content)}
                  placeholder="Agenda item name"
                />
              </div>
              <Select 
                value={item.assigned_to || 'unassigned'} 
                onValueChange={(value) => updateStandingAgendaItem(index, 'assigned_to', value === 'unassigned' ? null : value)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.profiles?.full_name || 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Min"
                value={item.time_minutes || ''}
                onChange={(e) => updateStandingAgendaItem(index, 'time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                className="w-16"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeStandingAgendaItem(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={addStandingAgendaItem} className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              Add Another Item
            </Button>
            <Button 
              onClick={saveStandingAgenda} 
              disabled={savingStanding}
              className="flex-1"
            >
              {savingStanding ? "Saving..." : "Save Standing Agenda"}
            </Button>
          </div>
        </div>
      )}
      
      {items.length > 0 && (
        <div className="border rounded-lg">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead className="w-[30%]">Item</TableHead>
            <TableHead className="w-[180px]">Who</TableHead>
            <TableHead className="w-[80px]">
              <div className="flex flex-col items-center">
                <span>Duration</span>
                {!meetingStarted ? (
                  <button 
                    onClick={startMeeting}
                    className="text-xs text-blue-600 hover:text-blue-800 underline mt-1"
                  >
                    Start
                  </button>
                ) : (
                  <button 
                    onClick={stopMeeting}
                    className="text-xs text-red-600 hover:text-red-800 underline mt-1"
                  >
                    Stop
                  </button>
                )}
              </div>
            </TableHead>
            <TableHead className="w-[30%]">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(isEditingAgenda ? editingItems : items).map((item, index) => (
            <TableRow key={item.id}>
              <TableCell className="py-2">
                <Checkbox
                  checked={item.is_completed}
                  onCheckedChange={() => handleToggleComplete(item.id, item.is_completed)}
                />
              </TableCell>
              <TableCell className="py-2 font-medium">
                {isEditingAgenda ? (
                  <Textarea
                    value={htmlToPlainText(item.title || "")}
                    onChange={(e) => updateEditingItem(index, 'title', e.target.value)}
                    placeholder="Agenda item title"
                    className="min-h-[32px] resize-none overflow-hidden"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                  />
                ) : (
                  htmlToPlainText(item.title)
                )}
              </TableCell>
              <TableCell className="py-2">
                {isEditingAgenda ? (
                  <Select
                    value={item.assigned_to || "none"}
                    onValueChange={(value) => {
                      updateEditingItem(index, 'assigned_to', value === "none" ? null : value);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Assign to...">
                        {item.assigned_to === "all" ? (
                          <span className="text-sm font-medium">All</span>
                        ) : item.assigned_to_profile ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={item.assigned_to_profile.avatar_url} />
                              <AvatarFallback className="text-xs">
                                {item.assigned_to_profile.full_name?.charAt(0) || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">
                              {(() => {
                                const names = item.assigned_to_profile.full_name?.split(" ") || [];
                                const firstName = names[0] || "";
                                const lastInitial = names.length > 1 ? names[names.length - 1].charAt(0) + "." : "";
                                return `${firstName} ${lastInitial}`.trim();
                              })()}
                            </span>
                          </div>
                        ) : item.assigned_to && item.assigned_to !== "none" ? (
                          <span className="text-sm text-muted-foreground">Loading...</span>
                        ) : (
                          <span className="text-muted-foreground">Assign to...</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="none">Unassigned</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                      {teamMembers.map((member) => {
                        const names = member.profiles?.full_name?.split(" ") || [];
                        const firstName = names[0] || "";
                        const lastInitial = names.length > 1 ? names[names.length - 1].charAt(0) + "." : "";
                        const displayName = `${firstName} ${lastInitial}`.trim();
                        
                        return (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={member.profiles?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {member.profiles?.full_name?.charAt(0) || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span>{displayName}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm">
                    {item.assigned_to === "all" ? (
                      <span className="font-medium">All</span>
                    ) : item.assigned_to_profile ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={item.assigned_to_profile.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {item.assigned_to_profile.full_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {(() => {
                            const names = item.assigned_to_profile.full_name?.split(" ") || [];
                            const firstName = names[0] || "";
                            const lastInitial = names.length > 1 ? names[names.length - 1].charAt(0) + "." : "";
                            return `${firstName} ${lastInitial}`.trim();
                          })()}
                        </span>
                      </div>
                    ) : item.assigned_to && item.assigned_to !== "none" ? (
                      <span className="text-muted-foreground">Loading...</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell className="py-2 relative">
                {isEditingAgenda ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="5"
                      value={item.time_minutes || ""}
                      onChange={(e) => {
                        updateEditingItem(index, 'time_minutes', e.target.value ? parseInt(e.target.value) : null);
                      }}
                      className="h-8 text-sm w-16"
                      min="0"
                      step="1"
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Progress bar background */}
                    {meetingStarted && item.time_minutes && (
                      <div 
                        className="absolute inset-0 bg-blue-100 opacity-30 rounded"
                        style={{ 
                          height: `${getItemProgress(item, index)}%`,
                          transition: 'height 0.5s ease-in-out'
                        }}
                      />
                    )}
                    {/* Content */}
                    <div className="relative z-10 text-sm">
                      {item.time_minutes ? `${item.time_minutes} min` : <span className="text-muted-foreground">—</span>}
                    </div>
                  </div>
                )}
              </TableCell>
              <TableCell className="py-2">
                <Textarea
                  value={htmlToPlainText(item.notes || "")}
                  onChange={(e) => handleUpdateNotes(item.id, e.target.value)}
                  onBlur={(e) => handleUpdateNotes(item.id, e.target.value)}
                  placeholder="Add notes..."
                  className="min-h-[32px] resize-none overflow-hidden"
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                  }}
                  // Notes are always editable for all users
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      )}


    </div>
  );
});

MeetingAgenda.displayName = "MeetingAgenda";

export default MeetingAgenda;
