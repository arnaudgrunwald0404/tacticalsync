import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PersonalityHoverCard } from "@/components/PersonalityHoverCard";
import ReviewLastWeekDrawer from "./ReviewLastWeekDrawer";
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
  items: unknown[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
  previousMeetingId?: string;
  currentUserId?: string;
  isAdmin?: boolean;
}

export interface MeetingAgendaRef {
  startEditing: () => void;
  isEditing: () => boolean;
  saveChanges: () => Promise<void>;
  cancelEditing: () => void;
}

const MeetingAgenda = forwardRef<MeetingAgendaRef, MeetingAgendaProps>(({ items, meetingId, teamId, onUpdate, previousMeetingId, currentUserId, isAdmin: isAdminProp }, ref) => {
  const { toast} = useToast();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<any[]>([]);
  const [isEditingAgenda, setIsEditingAgenda] = useState(false);
  const [editingItems, setEditingItems] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adoptingTemplate, setAdoptingTemplate] = useState(false);
  const [isAddingManually, setIsAddingManually] = useState(false);
  const [manualItems, setManualItems] = useState<any[]>([]);
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);

  useEffect(() => {
    fetchTeamMembers();
    fetchSystemTemplates();
    checkIfAdmin();
  }, [teamId]);

  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(full_name, first_name, last_name, email, avatar_url, avatar_name, red_percentage, blue_percentage, green_percentage, yellow_percentage)
      `)
      .eq("team_id", teamId);

    if (error) {
      console.error("Error fetching team members:", error);
      return;
    }

    setTeamMembers(data || []);
  };


  const fetchSystemTemplates = async () => {
    try {
      const { data: templates, error } = await supabase
        .from("agenda_templates")
        .select(`
          *,
          items:agenda_template_items(*)
        `)
        .eq("is_system", true)
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      setSystemTemplates(templates || []);
    } catch (error: unknown) {
      console.error("Error fetching system templates:", error);
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
    } catch (error: unknown) {
      console.error("Error checking admin status:", error);
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

  const updateEditingItem = (index: number, field: string, value: unknown) => {
    const updated = [...editingItems];
    (updated[index] as Record<string, unknown>)[field] = value;
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
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const adoptSystemTemplate = async (template: any) => {
    setAdoptingTemplate(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Sort template items by order_index
      const sortedItems = (template.items || []).sort((a: any, b: unknown) => a.order_index - b.order_index);

      const inserts = sortedItems.map((item: any, idx: number) => ({
        meeting_id: meetingId,
        type: "agenda" as const,
        title: item.title,
        order_index: idx,
        created_by: user.id,
        assigned_to: null,
        time_minutes: item.duration_minutes,
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
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
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

  const updateManualItem = (index: number, field: 'name' | 'assigned_to' | 'time_minutes', value: unknown) => {
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
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
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
      
      {items.length === 0 && !isAddingManually && (
        <div className="text-center py-8 border rounded-lg bg-muted/20">
          <div className="max-w-2xl mx-auto px-4">
            <p className="text-sm text-muted-foreground mb-6">Disciplined execution starts with a consistant agenda. Select a template or create your own agenda.</p>
            
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              {/* System Templates */}
              {systemTemplates.map((template) => (
                <div key={template.id} className="border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold mb-1">{template.name}</h3>
                      <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                    </div>
                  </div>
                  <div className="text-left text-xs text-muted-foreground space-y-1 mb-4">
                    {(template.items || []).sort((a: any, b: unknown) => a.order_index - b.order_index).map((item: unknown) => (
                      <div key={item.id} className="flex justify-between">
                        <span>• {item.title}</span>
                        {item.duration_minutes && (
                          <span className="text-primary font-medium">{item.duration_minutes} min</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button 
                    onClick={() => adoptSystemTemplate(template)} 
                    disabled={adoptingTemplate}
                    className="w-full"
                    size="sm"
                  >
                    {adoptingTemplate ? "Adopting..." : "Adopt This Template"}
                  </Button>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted-foreground mb-3">
              Or if you'd rather add agenda items manually:
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={startAddingManually}
            >

              Start Agenda From Scratch
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
                  <>
                    {htmlToPlainText(item.title).toLowerCase().includes("review last week") && previousMeetingId ? (
                      <button
                        onClick={() => setShowReviewDrawer(true)}
                        className="text-blue-600 hover:text-blue-800 underline font-medium"
                      >
                        {htmlToPlainText(item.title)}
                      </button>
                    ) : (
                      htmlToPlainText(item.title)
                    )}
                  </>
                )}
              </TableCell>
              <TableCell className="py-2">
                {isEditingAgenda ? (
                  <Select
                    value={item.assigned_to || "all"}
                    onValueChange={(value) => {
                      updateEditingItem(index, 'assigned_to', value === "all" ? null : value);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="all">Unassigned / All</SelectItem>
                      {teamMembers.map((member) => {
                        const firstName = member.profiles?.first_name || "";
                        const lastName = member.profiles?.last_name || "";
                        const email = member.profiles?.email || "";
                        
                        let displayName = "";
                        if (firstName && lastName) {
                          displayName = `${firstName} ${lastName}`;
                        } else if (firstName) {
                          displayName = firstName;
                        } else {
                          displayName = email;
                        }
                        
                        return (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            <div className="flex items-center gap-2">
                              {member.profiles?.avatar_name ? (
                                <FancyAvatar 
                                  name={member.profiles.avatar_name} 
                                  displayName={displayName}
                                  size="sm" 
                                />
                              ) : (
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={member.profiles?.avatar_url} />
                                  <AvatarFallback className="text-xs">
                                    {displayName.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <span>{displayName}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm">
                    {!item.assigned_to ? (
                      <span className="font-medium">Unassigned / All</span>
                    ) : item.assigned_to_profile ? (
                      (() => {
                        const firstName = item.assigned_to_profile.first_name || "";
                        const lastName = item.assigned_to_profile.last_name || "";
                        const email = item.assigned_to_profile.email || "";
                        
                        let displayName = "";
                        if (firstName && lastName) {
                          displayName = `${firstName} ${lastName}`;
                        } else if (firstName) {
                          displayName = firstName;
                        } else {
                          displayName = email;
                        }
                        
                        return (
                          <div className="flex items-center gap-2">
                            {item.assigned_to_profile.avatar_name ? (
                              <FancyAvatar 
                                name={item.assigned_to_profile.avatar_name} 
                                displayName={displayName}
                                size="sm" 
                              />
                            ) : (
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={item.assigned_to_profile.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {displayName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <span>{displayName}</span>
                          </div>
                        );
                      })()
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
                        className="absolute inset-y-0 left-0 bg-blue-700 opacity-70 rounded"
                        style={{ 
                          width: `${getItemProgress(item, index)}%`,
                          transition: 'width 0.5s ease-in-out'
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

      {/* Review Last Week's Items Drawer */}
      {previousMeetingId && currentUserId && (
        <ReviewLastWeekDrawer
          isOpen={showReviewDrawer}
          onClose={() => setShowReviewDrawer(false)}
          previousMeetingId={previousMeetingId}
          currentUserId={currentUserId}
          isAdmin={isAdminProp || isAdmin}
        />
      )}
    </div>
  );
});

MeetingAgenda.displayName = "MeetingAgenda";

export default MeetingAgenda;
