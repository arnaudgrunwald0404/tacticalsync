import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { Plus } from "lucide-react";
import { TeamMember } from "@/types/meeting";
import { formatMemberNames, getFullNameForAvatar } from "@/lib/nameUtils";

interface TopicFormProps {
  topic: {
    title: string;
    assigned_to: string;
    time_minutes: number;
    notes: string;
  };
  teamMembers: TeamMember[];
  onUpdate: (updates: Partial<TopicFormProps['topic']>) => void;
  onSubmit: () => void;
  isDesktop?: boolean;
}

export function TopicForm({ topic, teamMembers, onUpdate, onSubmit, isDesktop = true }: TopicFormProps) {
  // Generate smart name map
  const memberNames = useMemo(() => formatMemberNames(teamMembers), [teamMembers]);
  
  if (isDesktop) {
    return (
      <div className="grid grid-cols-[2fr_1fr_1fr_2fr_40px] gap-3 items-start">
        <div>
          <Input
            placeholder="Topic title..."
            value={topic.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="h-10"
          />
        </div>
        <div>
          <Select
            value={topic.assigned_to}
            onValueChange={(value) => onUpdate({ assigned_to: value })}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Who?">
                {topic.assigned_to && teamMembers.find(m => m.user_id === topic.assigned_to) && (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const member = teamMembers.find(m => m.user_id === topic.assigned_to);
                      if (!member?.profiles) return null;
                      
                      const displayName = memberNames.get(topic.assigned_to) || 'Unknown';

                      return (
                        <>
                          {member.profiles.avatar_name ? (
                            <FancyAvatar 
                              name={member.profiles.avatar_name} 
                              displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                              size="sm" 
                            />
                          ) : (
                            <Avatar className="h-6 w-6 rounded-full">
                              <AvatarImage src={member.profiles.avatar_url} />
                              <AvatarFallback className="text-xs">
                                {member.profiles.first_name?.[0]?.toUpperCase() || member.profiles.email?.[0]?.toUpperCase() || ''}{member.profiles.last_name?.[0]?.toUpperCase() || ''}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <span>{displayName}</span>
                        </>
                      );
                    })()}
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {teamMembers.map((member) => {
                const displayName = memberNames.get(member.user_id) || 'Unknown';
                
                return (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    <div className="flex items-center gap-2">
                      {member.profiles?.avatar_name ? (
                        <FancyAvatar 
                          name={member.profiles.avatar_name} 
                          displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                          size="sm" 
                        />
                      ) : (
                        <Avatar className="h-6 w-6 rounded-full">
                          <AvatarImage src={member.profiles?.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {member.profiles?.first_name?.[0]?.toUpperCase() || member.profiles?.email?.[0]?.toUpperCase() || ''}{member.profiles?.last_name?.[0]?.toUpperCase() || ''}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <span className="truncate">{displayName}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Input
            type="number"
            placeholder="Duration"
            value={topic.time_minutes}
            onChange={(e) => onUpdate({ time_minutes: parseInt(e.target.value) || 5 })}
            className="h-10 pr-12"
            min="1"
            max="60"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            min
          </span>
        </div>
        <div>
          <RichTextEditor
            content={topic.notes}
            onChange={(content) => onUpdate({ notes: content })}
            placeholder="Notes..."
          />
        </div>
        <div>
          <Button
            onClick={onSubmit}
            disabled={!topic.title.trim()}
            className="h-10 w-full"
            size="sm"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Topic title..."
        value={topic.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        className="h-10"
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          value={topic.assigned_to}
          onValueChange={(value) => onUpdate({ assigned_to: value })}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Who?" />
          </SelectTrigger>
          <SelectContent>
            {teamMembers.map((member) => {
              const displayName = memberNames.get(member.user_id) || 'Unknown';
              
              return (
                <SelectItem key={member.user_id} value={member.user_id}>
                  <div className="flex items-center gap-2">
                    {member.profiles?.avatar_name ? (
                      <FancyAvatar 
                        name={member.profiles.avatar_name} 
                        displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                        size="sm" 
                      />
                    ) : (
                      <Avatar className="h-6 w-6 rounded-full">
                        <AvatarImage src={member.profiles?.avatar_url} />
                        <AvatarFallback className="text-xs">
                          {(member.profiles?.first_name || member.profiles?.email || '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <span className="truncate">{displayName}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="relative">
          <Input
            type="number"
            placeholder="Minutes"
            value={topic.time_minutes}
            onChange={(e) => onUpdate({ time_minutes: parseInt(e.target.value) || 5 })}
            className="h-10 pr-12"
            min="1"
            max="60"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            min
          </span>
        </div>
      </div>
      <RichTextEditor
        content={topic.notes}
        onChange={(content) => onUpdate({ notes: content })}
        placeholder="Notes..."
      />
      <Button
        onClick={onSubmit}
        disabled={!topic.title.trim()}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Topic
      </Button>
    </div>
  );
}
