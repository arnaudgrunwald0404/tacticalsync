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

interface TopicRow {
  id: string;
  topic: string;
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

interface ExistingTopic {
  id: string;
  title?: string;
  assigned_to?: string | null;
  desired_outcome?: string;
}

interface TopicUpdate {
  id: string;
  title: string;
  outcome: string;
  assigned_to: string | null;
  order_index: number;
}

interface TopicInsert {
  meeting_id: string;
  type: "topic";
  title: string;
  outcome: string;
  assigned_to: string | null;
  order_index: number;
  created_by: string;
}

interface AddTopicsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  teamId: string;
  onSave: () => void;
  existingTopics?: ExistingTopic[];
}

const AddTopicsDrawer = ({ isOpen, onClose, meetingId, teamId, onSave, existingTopics = [] }: AddTopicsDrawerProps) => {
  const { toast } = useToast();
  const [topics, setTopics] = useState<TopicRow[]>([
    { id: "1", topic: "", assigned_to: "", desired_outcome: "" },
    { id: "2", topic: "", assigned_to: "", desired_outcome: "" },
    { id: "3", topic: "", assigned_to: "", desired_outcome: "" }
  ]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTeamMembers();
      fetchCurrentUser();
      
      // Load existing topics if editing, otherwise start with empty topics
      if (existingTopics.length > 0) {
        console.log("Loading existing topics:", existingTopics);
        const existingTopicRows = existingTopics.map((topic, index) => ({
          id: topic.id,
          topic: topic.title || "",
          assigned_to: topic.assigned_to || "",
          desired_outcome: topic.outcome || ""
        }));
        
        console.log("Mapped existing topic rows:", existingTopicRows);
        
        // Ensure we have at least 3 rows for consistency
        while (existingTopicRows.length < 3) {
          existingTopicRows.push({
            id: `new-${existingTopicRows.length + 1}`,
            topic: "",
            assigned_to: "",
            desired_outcome: ""
          });
        }
        
        setTopics(existingTopicRows);
      } else {
        console.log("No existing topics, starting fresh");
        // Reset topics when opening for new topics
        setTopics([
          { id: "1", topic: "", assigned_to: "", desired_outcome: "" },
          { id: "2", topic: "", assigned_to: "", desired_outcome: "" },
          { id: "3", topic: "", assigned_to: "", desired_outcome: "" }
        ]);
      }
    }
  }, [isOpen, existingTopics]);

  // Set current user as default when currentUser is loaded
  useEffect(() => {
    if (currentUser) {
      setTopics(prevTopics => 
        prevTopics.map(topic => ({
          ...topic,
          assigned_to: topic.assigned_to === "" ? currentUser.user_id : topic.assigned_to
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

  const addTopicRow = () => {
    const newId = (topics.length + 1).toString();
    setTopics([...topics, { id: newId, topic: "", assigned_to: currentUser?.user_id || "", desired_outcome: "" }]);
  };

  const removeTopicRow = (id: string) => {
    if (topics.length > 3) {
      setTopics(topics.filter(topic => topic.id !== id));
    }
  };

  // Check if all topics have been used (have content)
  const allTopicsUsed = () => {
    return topics.every(topic => topic.topic.trim() !== "");
  };

  const updateTopic = (id: string, field: keyof TopicRow, value: string) => {
    setTopics(topics.map(topic => 
      topic.id === id ? { ...topic, [field]: value } : topic
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const existingTopicIds = existingTopics.map(t => t.id);
      const topicsToUpdate: TopicUpdate[] = [];
      const topicsToInsert: TopicInsert[] = [];
      let updateIndex = 0;

      // Process each topic row
      for (const topic of topics) {
        if (topic.topic.trim()) {
          if (existingTopicIds.includes(topic.id)) {
            // Update existing topic
            topicsToUpdate.push({
              id: topic.id,
              title: topic.topic,
              outcome: topic.desired_outcome,
              assigned_to: topic.assigned_to || null,
              order_index: updateIndex,
            });
          } else {
            // Insert new topic
            topicsToInsert.push({
              meeting_id: meetingId,
              type: "topic" as const,
              title: topic.topic,
              outcome: topic.desired_outcome,
              assigned_to: topic.assigned_to || null,
              order_index: updateIndex,
              created_by: user.id,
            });
          }
          updateIndex++;
        }
      }

      // Delete topics that were removed (existing topics not in current list)
      const currentTopicIds = topics.filter(t => t.topic.trim()).map(t => t.id);
      const topicsToDelete = existingTopics.filter(t => !currentTopicIds.includes(t.id));
      
      for (const topicToDelete of topicsToDelete) {
        await supabase
          .from("meeting_items")
          .delete()
          .eq("id", topicToDelete.id);
      }

      // Update existing topics
      for (const topicUpdate of topicsToUpdate) {
        const { error } = await supabase
          .from("meeting_items")
          .update({
            title: topicUpdate.title,
            outcome: topicUpdate.outcome,
            assigned_to: topicUpdate.assigned_to,
            order_index: topicUpdate.order_index,
          })
          .eq("id", topicUpdate.id);
        
        if (error) throw error;
      }

      // Insert new topics
      if (topicsToInsert.length > 0) {
        const { error } = await supabase
          .from("meeting_items")
          .insert(topicsToInsert);
        
        if (error) throw error;
      }

      const totalChanges = topicsToUpdate.length + topicsToInsert.length + topicsToDelete.length;
      
      if (totalChanges > 0) {
        toast({
          title: "Topics updated!",
          description: `${totalChanges} change${totalChanges > 1 ? 's' : ''} saved successfully`,
        });
      }

      onSave();
      onClose();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save topics";
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
          <SheetTitle className="text-xl sm:text-2xl">{existingTopics.length > 0 ? "Edit Topics" : "Add Topics"}</SheetTitle>
          <SheetDescription className="text-sm sm:text-base">
            {existingTopics.length > 0 
              ? "Edit existing topics and add new ones for this meeting." 
              : "Add multiple topics for this meeting. You can create several topics at once."
            }
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          {/* Desktop Table View */}
          <div className="hidden sm:block border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 grid grid-cols-[200px_2fr_2fr_80px] gap-4 text-sm font-medium text-muted-foreground">
              <div>Who</div>
              <div>Topic</div>
              <div>Desired Outcome</div>
              <div></div>
            </div>
            
            {topics.map((topic, index) => (
              <div key={topic.id} className="px-4 py-3 grid grid-cols-[200px_2fr_2fr_80px] gap-4 items-center border-t">
                <div>
                  <Select
                    value={topic.assigned_to || ""}
                    onValueChange={(value) => updateTopic(topic.id, "assigned_to", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to...">
                        {topic.assigned_to ? (
                          (() => {
                            const member = teamMembers.find(m => m.user_id === topic.assigned_to);
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
                    content={topic.topic}
                    onChange={(content) => updateTopic(topic.id, "topic", content)}
                    placeholder="Enter topic..."
                    className="min-h-[80px]"
                  />
                </div>
                
                <div>
                  <RichTextEditor
                    content={topic.desired_outcome}
                    onChange={(content) => updateTopic(topic.id, "desired_outcome", content)}
                    placeholder="Desired outcome..."
                    className="min-h-[80px]"
                  />
                </div>
                
                <div className="flex justify-center">
                  {topics.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTopicRow(topic.id)}
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
            {topics.map((topic, index) => {
              const member = teamMembers.find(m => m.user_id === topic.assigned_to);
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
                <div key={topic.id} className="border rounded-lg p-4 space-y-3 bg-white">
                  {/* Assigned To */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Who</label>
                    <Select
                      value={topic.assigned_to || ""}
                      onValueChange={(value) => updateTopic(topic.id, "assigned_to", value)}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Assign to...">
                          {topic.assigned_to && displayName ? (
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

                  {/* Topic */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Topic</label>
                    <RichTextEditor
                      content={topic.topic}
                      onChange={(content) => updateTopic(topic.id, "topic", content)}
                      placeholder="Enter topic..."
                      className="min-h-[80px] text-sm"
                    />
                  </div>

                  {/* Desired Outcome */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Desired Outcome</label>
                    <RichTextEditor
                      content={topic.desired_outcome}
                      onChange={(content) => updateTopic(topic.id, "desired_outcome", content)}
                      placeholder="Desired outcome..."
                      className="min-h-[80px] text-sm"
                    />
                  </div>

                  {/* Delete Button */}
                  {topics.length > 3 && (
                    <div className="flex justify-end pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTopicRow(topic.id)}
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
              onClick={addTopicRow}
              disabled={!allTopicsUsed()}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Topic
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-4 border-t">
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto text-sm">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : existingTopics.length > 0 ? "Save Changes" : `Save ${topics.filter(t => t.topic.trim()).length} Topic${topics.filter(t => t.topic.trim()).length !== 1 ? 's' : ''}`}
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

export default AddTopicsDrawer;
