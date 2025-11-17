import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import RichTextEditor from "@/components/ui/rich-text-editor-lazy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Target, X, Zap } from "lucide-react";
import { PriorityRow } from "@/types/priorities";
import { TeamMember } from "@/types/meeting";
import { formatMemberNames, getFullNameForAvatar } from "@/lib/nameUtils";
import { useRCLinks } from "@/hooks/useRCDO";
import { useToast } from "@/hooks/use-toast";
import type { DOHashtagOption } from "@/types/rcdo";

interface ActiveInitiative {
  id: string;
  title: string;
  doId: string;
  doTitle: string;
  status: string;
}

interface PriorityFormProps {
  priority: PriorityRow;
  teamMembers: TeamMember[];
  currentUser: any;
  teamId: string;
  activeDOs: DOHashtagOption[];
  activeSIs: ActiveInitiative[];
  onUpdate: (id: string, field: keyof PriorityRow, value: string | null) => void;
  onRemove?: () => void;
  showRemove?: boolean;
}

export function PriorityForm({ 
  priority, 
  teamMembers, 
  currentUser,
  teamId,
  activeDOs,
  activeSIs,
  onUpdate, 
  onRemove,
  showRemove = false 
}: PriorityFormProps) {
  const { toast } = useToast();
  const { createLink, deleteLink } = useRCLinks('do', undefined);
  const { createLink: createSILink, deleteLink: deleteSILink } = useRCLinks('initiative', undefined);
  
  // Check if priority ID is a valid UUID (not a temp ID)
  const isTempId = (id: string) => id.startsWith('temp-') || id.startsWith('new-');
  
  // Initialize linked state from priority's pending link
  const [linkedItemId, setLinkedItemId] = useState<string | null>(priority.pendingLink?.id || null);
  const [linkedItemType, setLinkedItemType] = useState<'do' | 'initiative' | null>(priority.pendingLink?.type || null);
  
  // Debug: Log initiatives to console
  useMemo(() => {
    console.log('PriorityForm - activeDOs:', activeDOs.length, activeDOs);
    console.log('PriorityForm - activeSIs:', activeSIs.length, activeSIs);
  }, [activeDOs, activeSIs]);
  
  // Generate smart name map
  const memberNames = useMemo(() => formatMemberNames(teamMembers), [teamMembers]);
  
  // Handler to link priority to DO or SI
  const handleLinkChange = async (value: string) => {
    try {
      if (!value) {
        // Handle unlink
        handleUnlink();
        return;
      }
      
      const [type, id] = value.split(':') as ['do' | 'initiative', string];
      
      // If priority has a temp ID, store the link info for later
      if (isTempId(priority.id)) {
        setLinkedItemId(id);
        setLinkedItemType(type);
        // Update the priority row with pending link info
        onUpdate(priority.id, 'pendingLink', JSON.stringify({ type, id }));
        
        const selectedItem = type === 'do' 
          ? activeDOs.find(d => d.id === id)
          : activeSIs.find(s => s.id === id);
        
        toast({
          title: 'Link queued',
          description: `Link will be created when priority is saved: ${selectedItem?.title}`,
        });
        return;
      }
      
      // If priority has a real ID, create the link immediately
      if (type === 'do') {
        await createLink({
          parent_type: 'do',
          parent_id: id,
          kind: 'meeting_priority',
          ref_id: priority.id,
        });
        
        setLinkedItemId(id);
        setLinkedItemType('do');
        
        const selectedDO = activeDOs.find(d => d.id === id);
        toast({
          title: 'Success',
          description: `Priority linked to DO: ${selectedDO?.title}`,
        });
      } else if (type === 'initiative') {
        await createSILink({
          parent_type: 'initiative',
          parent_id: id,
          kind: 'meeting_priority',
          ref_id: priority.id,
        });
        
        setLinkedItemId(id);
        setLinkedItemType('initiative');
        
        const selectedSI = activeSIs.find(s => s.id === id);
        toast({
          title: 'Success',
          description: `Priority linked to Initiative: ${selectedSI?.title}`,
        });
      }
    } catch (error: any) {
      console.error('Error in handleLinkChange:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to link priority',
        variant: 'destructive',
      });
      // Don't rethrow - prevent drawer from closing
    }
  };
  
  // Handler to unlink
  const handleUnlink = async () => {
    if (!linkedItemId || !linkedItemType) return;
    
    try {
      // If priority has a temp ID, just clear the pending link
      if (isTempId(priority.id)) {
        setLinkedItemId(null);
        setLinkedItemType(null);
        onUpdate(priority.id, 'pendingLink', '');
        toast({
          title: 'Link removed',
          description: 'Pending link cleared',
        });
        return;
      }
      
      // If priority has a real ID, delete the link
      setLinkedItemId(null);
      setLinkedItemType(null);
      toast({
        title: 'Success',
        description: 'Priority unlinked',
      });
    } catch (error: any) {
      console.error('Error in handleUnlink:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlink',
        variant: 'destructive',
      });
      // Don't rethrow - prevent drawer from closing
    }
  };
  
  return (
    <>
      <div>
        <Select
          value={priority.assigned_to || ""}
          onValueChange={(value) => onUpdate(priority.id, "assigned_to", value)}
        >
          <SelectTrigger className="w-full h-8 px-1">
            <SelectValue placeholder="Assign to...">
              {priority.assigned_to ? (
                (() => {
                  const member = teamMembers.find(m => m.user_id === priority.assigned_to);
                  if (!member?.profiles) return null;
                  
                  return (
                    <div className="flex items-center justify-center">
                      <FancyAvatar
                        name={(member.profiles.avatar_name && member.profiles.avatar_name.trim()) || member.profiles.email || 'Unknown'}
                        displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                        avatarUrl={member.profiles.avatar_url}
                        size="sm"
                      />
                    </div>
                  );
                })()
              ) : (
                <span className="text-muted-foreground text-xs">...</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-[200px]">
            {currentUser && (
              <SelectItem value={currentUser.user_id}>
                <div className="flex items-center gap-2">
                  {currentUser.profiles?.avatar_name ? (
                    <FancyAvatar 
                      name={currentUser.profiles.avatar_name} 
                      displayName={getFullNameForAvatar(currentUser.profiles.first_name, currentUser.profiles.last_name, currentUser.profiles.email)}
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
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={member.profiles?.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {member.profiles?.first_name?.[0]?.toUpperCase() || ''}{member.profiles?.last_name?.[0]?.toUpperCase() || ''}
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
        />
      </div>
      
      <div>
        <RichTextEditor
          content={priority.activities}
          onChange={(content) => onUpdate(priority.id, "activities", content)}
          placeholder="Enter supporting activities..."
        />
      </div>
      
      {/* Strategic Linking Section */}
      <div>
        <Select
          value={linkedItemId && linkedItemType ? `${linkedItemType}:${linkedItemId}` : ""}
          onValueChange={handleLinkChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Link to Strategy...">
              {linkedItemId && linkedItemType ? (
                <div className="flex items-center gap-2">
                  {linkedItemType === 'do' ? (
              <>
                <Target className="h-4 w-4 text-blue-600" />
                <Badge variant="secondary" className="text-xs">DO</Badge>
                      <span className="text-sm truncate">
                        {activeDOs.find(d => d.id === linkedItemId)?.title || 'Linked to DO'}
                </span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 text-purple-600" />
                      <Badge variant="secondary" className="text-xs">SI</Badge>
                      <span className="text-sm truncate">
                        {activeSIs.find(s => s.id === linkedItemId)?.title || 'Linked to Initiative'}
                </span>
              </>
            )}
          </div>
        ) : (
                <span className="text-muted-foreground">Link to Strategy...</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px] [&>div:nth-child(2)]:!h-auto [&>div:nth-child(2)]:!max-h-[400px] [&>div:nth-child(2)]:!overflow-y-auto">
            {linkedItemId && linkedItemType && (
              <>
                <SelectItem value="">
                  <div className="flex items-center gap-2">
                    <X className="h-3 w-3" />
                    <span>Clear Selection</span>
                  </div>
                </SelectItem>
                <SelectSeparator />
              </>
            )}
            
            {activeDOs.length > 0 && (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-2">
                  <Target className="h-3 w-3 text-blue-600" />
                  Desired Outcomes
                </SelectLabel>
                {activeDOs.map((do_item) => (
                  <SelectItem key={do_item.id} value={`do:${do_item.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{do_item.title}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            
            {activeDOs.length > 0 && activeSIs.length > 0 && <SelectSeparator />}
            
            {activeSIs.length > 0 && (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-2">
                  <Zap className="h-3 w-3 text-purple-600" />
                  Strategic Initiatives
                </SelectLabel>
                {activeSIs.map((si) => (
                  <SelectItem key={si.id} value={`initiative:${si.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{si.title}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            
            {activeDOs.length === 0 && activeSIs.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                No strategic items available
              </div>
            )}
          </SelectContent>
        </Select>
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
    </>
  );
}
