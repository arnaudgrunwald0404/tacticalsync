import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import RichTextEditor from "@/components/ui/rich-text-editor-lazy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Target, X, Zap } from "lucide-react";
import { PriorityRow } from "@/types/priorities";
import { TeamMember } from "@/types/meeting";
import { formatMemberNames, getFullNameForAvatar } from "@/lib/nameUtils";
import { DOHashtagSelector } from "@/components/rcdo/DOHashtagSelector";
import { SIHashtagSelector } from "@/components/rcdo/SIHashtagSelector";
import { useActiveDOs } from "@/hooks/useActiveDOs";
import { useActiveInitiatives } from "@/hooks/useActiveInitiatives";
import { useRCLinks } from "@/hooks/useRCDO";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PriorityFormProps {
  priority: PriorityRow;
  teamMembers: TeamMember[];
  currentUser: any;
  teamId: string;
  onUpdate: (id: string, field: keyof PriorityRow, value: string) => void;
  onRemove?: () => void;
  showRemove?: boolean;
}

export function PriorityForm({ 
  priority, 
  teamMembers, 
  currentUser,
  teamId,
  onUpdate, 
  onRemove,
  showRemove = false 
}: PriorityFormProps) {
  const { toast } = useToast();
  const { dos: activeDOs } = useActiveDOs(teamId);
  const { initiatives: activeSIs } = useActiveInitiatives(teamId);
  const { createLink, deleteLink } = useRCLinks('do', undefined);
  const { createLink: createSILink, deleteLink: deleteSILink } = useRCLinks('initiative', undefined);
  
  const [linkType, setLinkType] = useState<'do' | 'initiative'>('do');
  const [linkedDOId, setLinkedDOId] = useState<string | null>(null);
  const [linkedSIId, setLinkedSIId] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  
  // Generate smart name map
  const memberNames = useMemo(() => formatMemberNames(teamMembers), [teamMembers]);
  
  // Handler to link priority to DO
  const handleLinkToDO = async (doId: string) => {
    try {
      await createLink({
        parent_type: 'do',
        parent_id: doId,
        kind: 'meeting_priority',
        ref_id: priority.id,
      });
      
      setLinkedDOId(doId);
      setLinkedSIId(null); // Clear SI link if exists
      setShowSelector(false);
      
      const selectedDO = activeDOs.find(d => d.id === doId);
      toast({
        title: 'Success',
        description: `Priority linked to DO: ${selectedDO?.title}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to link priority to DO',
        variant: 'destructive',
      });
    }
  };
  
  // Handler to link priority to SI
  const handleLinkToSI = async (siId: string) => {
    try {
      await createSILink({
        parent_type: 'initiative',
        parent_id: siId,
        kind: 'meeting_priority',
        ref_id: priority.id,
      });
      
      setLinkedSIId(siId);
      setLinkedDOId(null); // Clear DO link if exists
      setShowSelector(false);
      
      const selectedSI = activeSIs.find(s => s.id === siId);
      toast({
        title: 'Success',
        description: `Priority linked to Initiative: ${selectedSI?.title}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to link priority to Initiative',
        variant: 'destructive',
      });
    }
  };
  
  // Handler to unlink DO
  const handleUnlinkDO = async () => {
    if (!linkedDOId) return;
    
    try {
      // Find the link and delete it
      // Note: This is a simplified version - you may need to fetch the link ID first
      setLinkedDOId(null);
      toast({
        title: 'Success',
        description: 'Priority unlinked from DO',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlink DO',
        variant: 'destructive',
      });
    }
  };
  
  // Handler to unlink SI
  const handleUnlinkSI = async () => {
    if (!linkedSIId) return;
    
    try {
      setLinkedSIId(null);
      toast({
        title: 'Success',
        description: 'Priority unlinked from Initiative',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlink Initiative',
        variant: 'destructive',
      });
    }
  };
  
  return (
    <>
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
                  
                  const displayName = memberNames.get(priority.assigned_to) || 'Unknown';
                  
                  return (
                    <div className="flex items-center gap-2">
                      {member.profiles.avatar_name ? (
                        <FancyAvatar 
                          name={member.profiles.avatar_name} 
                          displayName={getFullNameForAvatar(member.profiles.first_name, member.profiles.last_name, member.profiles.email)}
                          size="sm" 
                        />
                      ) : (
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={member.profiles.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {member.profiles.first_name?.[0]?.toUpperCase() || ''}{member.profiles.last_name?.[0]?.toUpperCase() || ''}
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
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Link to Strategy (optional)
        </label>
        
        {linkedDOId || linkedSIId ? (
          <div className="flex items-center gap-2 p-2 border rounded-md bg-blue-50 dark:bg-blue-950">
            {linkedDOId ? (
              <>
                <Target className="h-4 w-4 text-blue-600" />
                <Badge variant="secondary" className="text-xs">DO</Badge>
                <span className="text-sm flex-1">
                  {activeDOs.find(d => d.id === linkedDOId)?.title || 'Linked to DO'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUnlinkDO}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 text-purple-600" />
                <Badge variant="secondary" className="text-xs">Initiative</Badge>
                <span className="text-sm flex-1">
                  {activeSIs.find(s => s.id === linkedSIId)?.title || 'Linked to Initiative'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUnlinkSI}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <Tabs value={linkType} onValueChange={(v) => setLinkType(v as 'do' | 'initiative')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="do" className="text-xs">
                  <Target className="h-3 w-3 mr-1" />
                  Objective
                </TabsTrigger>
                <TabsTrigger value="initiative" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Initiative
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSelector(!showSelector)}
              className="w-full"
              type="button"
            >
              {linkType === 'do' ? (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Link to Strategic Objective
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Link to Strategic Initiative
                </>
              )}
            </Button>
            
            {showSelector && (
              linkType === 'do' ? (
                activeDOs.length > 0 && (
                  <DOHashtagSelector
                    dos={activeDOs}
                    selectedDOId={linkedDOId}
                    onSelect={handleLinkToDO}
                    onClose={() => setShowSelector(false)}
                    isOpen={showSelector}
                  />
                )
              ) : (
                activeSIs.length > 0 && (
                  <SIHashtagSelector
                    teamId={teamId}
                    selectedId={linkedSIId}
                    onSelect={handleLinkToSI}
                  />
                )
              )
            )}
          </>
        )}
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
