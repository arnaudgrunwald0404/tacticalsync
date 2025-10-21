import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { PriorityRow } from "@/types/priorities";
import { TeamMember } from "@/types/meeting";
import { formatNameWithInitial } from "@/lib/nameUtils";

interface PriorityFormProps {
  priority: PriorityRow;
  teamMembers: TeamMember[];
  currentUser: any;
  onUpdate: (id: string, field: keyof PriorityRow, value: string) => void;
  onRemove?: () => void;
  showRemove?: boolean;
}

export function PriorityForm({ 
  priority, 
  teamMembers, 
  currentUser, 
  onUpdate, 
  onRemove,
  showRemove = false 
}: PriorityFormProps) {
  return (
    <div className="grid grid-cols-[200px_2fr_2fr_80px] gap-4 items-start">
      <div>
        <Select
          value={priority.assigned_to || ""}
          onValueChange={(value) => onUpdate(priority.id, "assigned_to", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Assign to...">
              {priority.assigned_to ? (
                (() => {
                  const member = teamMembers.find(m => m.user_id === priority.assigned_to);
                  if (!member?.profiles) return null;
                  
                  const displayName = formatNameWithInitial(
                    member.profiles.first_name,
                    member.profiles.last_name,
                    member.profiles.email
                  );
                  
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
                      displayName={formatNameWithInitial(
                        currentUser.profiles.first_name,
                        currentUser.profiles.last_name,
                        currentUser.profiles.email
                      )}
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
                const displayName = formatNameWithInitial(
                  member.profiles?.first_name,
                  member.profiles?.last_name,
                  member.profiles?.email
                );
                
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
          onChange={(content) => onUpdate(priority.id, "priority", content)}
          placeholder="Enter desired outcome..."
          className="min-h-[80px]"
        />
      </div>
      
      <div>
        <RichTextEditor
          content={priority.activities}
          onChange={(content) => onUpdate(priority.id, "activities", content)}
          placeholder="Enter supporting activities..."
          className="min-h-[80px]"
        />
      </div>
      
      <div className="flex justify-center">
        {showRemove && onRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
