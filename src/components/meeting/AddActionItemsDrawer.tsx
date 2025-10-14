import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Plus, Trash2, Save, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface PriorityRow {
  id: string;
  priority: string;
  assigned_to: string | null;
  desired_outcome: string;
}

interface TeamMember {
  user_id: string;
  profiles?: {
    full_name?: string;
    avatar_url?: string;
    avatar_name?: string;
  };
}

interface CurrentUser {
  id: string;
  email?: string;
  full_name?: string;
}

interface ExistingPriority {
  id: string;
  title?: string;
  assigned_to?: string | null;
  desired_outcome?: string;
}

interface PriorityUpdate {
  id: string;
  title: string;
  outcome: string;
  assigned_to: string | null;
  order_index: number;
}

interface PriorityInsert {
  meeting_id: string;
  type: "priority";
  title: string;
  outcome: string;
  assigned_to: string | null;
  order_index: number;
  created_by: string;
}

interface AddActionItemsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  teamId: string;
  onSave: () => void;
  existingActionItems?: ExistingPriority[];
}

const AddActionItemsDrawer = ({ isOpen, onClose, meetingId, teamId, onSave, existingActionItems = [] }: AddActionItemsDrawerProps) => {
  const { toast } = useToast();
  const [actionitems, setActionItems] = useState<PriorityRow[]>([
    { id: "1", priority: "", assigned_to: "", desired_outcome: "" },
    { id: "2", priority: "", assigned_to: "", desired_outcome: "" },
    { id: "3", priority: "", assigned_to: "", desired_outcome: "" }
  ]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTeamMembers();
      fetchCurrentUser();
      
      // Load existing priorities if editing, otherwise start with empty priorities
      if (existingActionItems.length > 0) {
        console.log("Loading existing priorities:", existingActionItems);
        const existingPriorityRows = existingActionItems.map((priority, index) => ({
          id: priority.id,
          priority: priority.title || "",
          assigned_to: priority.assigned_to || "",
          desired_outcome: priority.outcome || ""
        }));
        
        console.log("Mapped existing priority rows:", existingPriorityRows);
        
        // Ensure we have at least 3 rows for consistency
        while (existingPriorityRows.length < 3) {
          existingPriorityRows.push({
            id: `new-${existingPriorityRows.length + 1}`,
            priority: "",
            assigned_to: "",
            desired_outcome: ""
          });
        }
        
        setActionItems(existingPriorityRows);
      } else {
        console.log("No existing priorities, starting fresh");
        // Reset priorities when opening for new priorities
        setActionItems([
          { id: "1", priority: "", assigned_to: "", desired_outcome: "" },
          { id: "2", priority: "", assigned_to: "", desired_outcome: "" },
          { id: "3", priority: "", assigned_to: "", desired_outcome: "" }
        ]);
      }
    }
  }, [isOpen, existingActionItems]);

  // Set current user as default when currentUser is loaded
  useEffect(() => {
    if (currentUser) {
      setActionItems(prevPrioritys => 
        prevPrioritys.map(priority => ({
          ...priority,
          assigned_to: priority.assigned_to === "" ? currentUser.user_id : priority.assigned_to
        }))
      );
    }
  }, [currentUser]);

  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(full_name, first_name, last_name, email, avatar_url, avatar_name)
      `)
      .eq("team_id", teamId);

    if (!error && data) {
      setTeamMembers(data);
    }
  };

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Find current user in team members
      const { data: memberData } = await supabase
        .from("team_members")
        .select(`
          id,
          user_id,
          profiles:user_id(full_name, first_name, last_name, email, avatar_url, avatar_name)
        `)
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .single();
      
      setCurrentUser(memberData);
    }
  };

  const addPriorityRow = () => {
    const newId = (actionitems.length + 1).toString();
    setActionItems([...actionitems, { id: newId, priority: "", assigned_to: currentUser?.user_id || "", desired_outcome: "" }]);
  };

  const removePriorityRow = (id: string) => {
    if (actionitems.length > 3) {
      setActionItems(actionitems.filter(priority => priority.id !== id));
    }
  };

  // Check if all priorities have been used (have content)
  const allPrioritysUsed = () => {
    return actionitems.every(priority => priority.priority.trim() !== "");
  };

  const updatePriority = (id: string, field: keyof PriorityRow, value: string) => {
    setActionItems(actionitems.map(priority => 
      priority.id === id ? { ...priority, [field]: value } : priority
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const existingPriorityIds = existingActionItems.map(t => t.id);
      const prioritiesToUpdate: PriorityUpdate[] = [];
      const prioritiesToInsert: PriorityInsert[] = [];
      let updateIndex = 0;

      // Process each priority row
      for (const priority of actionitems) {
        if (priority.priority.trim()) {
          if (existingPriorityIds.includes(priority.id)) {
            // Update existing priority
            prioritiesToUpdate.push({
              id: priority.id,
              title: priority.priority,
              outcome: priority.desired_outcome,
              assigned_to: priority.assigned_to || null,
              order_index: updateIndex,
            });
          } else {
            // Insert new priority
            prioritiesToInsert.push({
              meeting_id: meetingId,
              type: "priority" as const,
              title: priority.priority,
              outcome: priority.desired_outcome,
              assigned_to: priority.assigned_to || null,
              order_index: updateIndex,
              created_by: user.id,
            });
          }
          updateIndex++;
        }
      }

      // Delete priorities that were removed (existing priorities not in current list)
      const currentPriorityIds = actionitems.filter(t => t.priority.trim()).map(t => t.id);
      const prioritiesToDelete = existingActionItems.filter(t => !currentPriorityIds.includes(t.id));
      
      for (const priorityToDelete of prioritiesToDelete) {
        await supabase
          .from("meeting_items")
          .delete()
          .eq("id", priorityToDelete.id);
      }

      // Update existing priorities
      for (const priorityUpdate of prioritiesToUpdate) {
        const { error } = await supabase
          .from("meeting_items")
          .update({
            title: priorityUpdate.title,
            outcome: priorityUpdate.outcome,
            assigned_to: priorityUpdate.assigned_to,
            order_index: priorityUpdate.order_index,
          })
          .eq("id", priorityUpdate.id);
        
        if (error) throw error;
      }

      // Insert new priorities
      if (prioritiesToInsert.length > 0) {
        const { error } = await supabase
          .from("meeting_items")
          .insert(prioritiesToInsert);
        
        if (error) throw error;
      }

      const totalChanges = prioritiesToUpdate.length + prioritiesToInsert.length + prioritiesToDelete.length;
      
      if (totalChanges > 0) {
        toast({
          title: "Priorities updated!",
          description: `${totalChanges} change${totalChanges > 1 ? 's' : ''} saved successfully`,
        });
      }

      onSave();
      onClose();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save priorities";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:w-[75vw] sm:max-w-[75vw] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl sm:text-2xl">{existingActionItems.length > 0 ? "Edit Priorities" : "Add Priorities"}</SheetTitle>
          <SheetDescription className="text-sm sm:text-base">
            {existingActionItems.length > 0 
              ? "Edit existing priorities and add new ones for this meeting." 
              : "Add multiple priorities for this meeting. You can create several priorities at once."
            }
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          {/* Desktop Table View */}
          <div className="hidden sm:block border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 grid grid-cols-[200px_2fr_2fr_80px] gap-4 text-sm font-medium text-muted-foreground">
              <div>Who</div>
              <div>Priority</div>
              <div>Desired Outcome</div>
              <div></div>
            </div>
            
            {actionitems.map((priority, index) => (
              <div key={priority.id} className="px-4 py-3 grid grid-cols-[200px_2fr_2fr_80px] gap-4 items-center border-t">
                <div>
                  <Select
                    value={priority.assigned_to || ""}
                    onValueChange={(value) => updatePriority(priority.id, "assigned_to", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to...">
                        {priority.assigned_to ? (
                          (() => {
                            const member = teamMembers.find(m => m.user_id === priority.assigned_to);
                            if (!member?.profiles) return null;
                            
                            const firstName = member.profiles.first_name || "";
                            const lastName = member.profiles.last_name || "";
                            const email = member.profiles.email || "";
                            
                            // Display: first_name + last_name if available, otherwise email
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
                                {member.profiles.avatar_name ? (
                                  <FancyAvatar 
                                    name={member.profiles.avatar_name} 
                                    displayName={displayName}
                                    size="sm" 
                                  />
                                ) : (
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={member.profiles.avatar_url} />
                                    <AvatarFallback className="text-xs">
                                      {displayName.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                <span className="text-sm">{displayName}</span>
                              </div>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">Assign to...</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {currentUser && (
                        <SelectItem value={currentUser.user_id}>
                          <div className="flex items-center gap-2">
                            {currentUser.profiles?.avatar_name ? (
                              <FancyAvatar 
                                name={currentUser.profiles.avatar_name} 
                                displayName={`${currentUser.profiles.first_name || ''} ${currentUser.profiles.last_name || ''}`.trim() || currentUser.profiles.email || ''}
                                size="sm" 
                              />
                            ) : (
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={currentUser.profiles?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {(currentUser.profiles?.first_name || currentUser.profiles?.email || '?').charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <span>Me</span>
                          </div>
                        </SelectItem>
                      )}
                      {teamMembers
                        .filter(member => member.user_id !== currentUser?.user_id)
                        .map((member) => {
                          const firstName = member.profiles?.first_name || "";
                          const lastName = member.profiles?.last_name || "";
                          const email = member.profiles?.email || "";
                          
                          // Display: first_name + last_name if available, otherwise email
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
                </div>
                
                <div>
                  <RichTextEditor
                    content={priority.priority}
                    onChange={(content) => updatePriority(priority.id, "priority", content)}
                    placeholder="Enter priority..."
                    className="min-h-[80px]"
                  />
                </div>
                
                <div>
                  <RichTextEditor
                    content={priority.desired_outcome}
                    onChange={(content) => updatePriority(priority.id, "desired_outcome", content)}
                    placeholder="Desired outcome..."
                    className="min-h-[80px]"
                  />
                </div>
                
                <div className="flex justify-center">
                  {actionitems.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePriorityRow(priority.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {actionitems.map((priority, index) => {
              const member = teamMembers.find(m => m.user_id === priority.assigned_to);
              const firstName = member?.profiles?.first_name || "";
              const lastName = member?.profiles?.last_name || "";
              const email = member?.profiles?.email || "";
              let displayName = "";
              if (firstName && lastName) {
                displayName = `${firstName} ${lastName}`;
              } else if (firstName) {
                displayName = firstName;
              } else if (email) {
                displayName = email;
              }

              return (
                <div key={priority.id} className="border rounded-lg p-4 space-y-3 bg-white">
                  {/* Assigned To */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Who</label>
                    <Select
                      value={priority.assigned_to || ""}
                      onValueChange={(value) => updatePriority(priority.id, "assigned_to", value)}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Assign to...">
                          {priority.assigned_to && displayName ? (
                            <span className="text-sm">{displayName}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">Assign to...</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {currentUser && (
                          <SelectItem value={currentUser.user_id}>
                            <span className="text-sm">Me</span>
                          </SelectItem>
                        )}
                        {teamMembers
                          .filter(member => member.user_id !== currentUser?.user_id)
                          .map((member) => {
                            const mFirstName = member.profiles?.first_name || "";
                            const mLastName = member.profiles?.last_name || "";
                            const mEmail = member.profiles?.email || "";
                            let mDisplayName = "";
                            if (mFirstName && mLastName) {
                              mDisplayName = `${mFirstName} ${mLastName}`;
                            } else if (mFirstName) {
                              mDisplayName = mFirstName;
                            } else {
                              mDisplayName = mEmail;
                            }
                            return (
                              <SelectItem key={member.user_id} value={member.user_id}>
                                <span className="text-sm">{mDisplayName}</span>
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Priority */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Priority</label>
                    <RichTextEditor
                      content={priority.priority}
                      onChange={(content) => updatePriority(priority.id, "priority", content)}
                      placeholder="Enter priority..."
                      className="min-h-[80px] text-sm"
                    />
                  </div>

                  {/* Desired Outcome */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Desired Outcome</label>
                    <RichTextEditor
                      content={priority.desired_outcome}
                      onChange={(content) => updatePriority(priority.id, "desired_outcome", content)}
                      placeholder="Desired outcome..."
                      className="min-h-[80px] text-sm"
                    />
                  </div>

                  {/* Delete Button */}
                  {actionitems.length > 3 && (
                    <div className="flex justify-end pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePriorityRow(priority.id)}
                        className="text-destructive hover:text-destructive text-xs"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addPriorityRow}
              disabled={!allPrioritysUsed()}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Priority
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-4 border-t">
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto text-sm">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : existingActionItems.length > 0 ? "Save Changes" : `Save ${actionitems.filter(t => t.priority.trim()).length} Priority${actionitems.filter(t => t.priority.trim()).length !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto text-sm">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddActionItemsDrawer;
