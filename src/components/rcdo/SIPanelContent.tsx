import React from 'react';
import { X, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import FancyAvatar from '@/components/ui/fancy-avatar';
import RichTextEditor from '@/components/ui/rich-text-editor-lazy';
import { MultiSelectParticipants } from '@/components/ui/multi-select-participants';
import { useSIWithProgress } from '@/hooks/useSIWithProgress';
import { isFeatureEnabled } from '@/lib/featureFlags';
import type { Tables } from '@/integrations/supabase/types';
import type { Node } from 'reactflow';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Import NodeData type from StrategyCanvas
type NodeData = {
  title: string;
  status?: "draft" | "final";
  ownerId?: string;
  hypothesis?: string;
  primarySuccessMetric?: string;
  parentDoId?: string;
  bgColor?: string;
  size?: { w: number; h: number };
  titleCandidates?: string[];
  saiItems?: Array<{
    id: string;
    title: string;
    ownerId?: string;
    participantIds?: string[];
    ownerName?: string;
    ownerAvatarUrl?: string;
    metric?: string;
    description?: string;
    dbId?: string;
  }>;
  rallyCandidates?: string[];
  rallySelectedIndex?: number;
  rallyFinalized?: boolean;
};

interface SIPanelContentProps {
  doNode: Node<NodeData>;
  si: NonNullable<NodeData['saiItems']>[0];
  profiles: Tables<'profiles'>[];
  profilesMap: Record<string, Tables<'profiles'>>;
  doLockedStatus: Map<string, { locked: boolean; dbId?: string }>;
  onUpdate: (patch: Partial<NonNullable<NodeData['saiItems']>[0]>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
  isDoPanelOpen: boolean;
}

export function SIPanelContent({
  doNode,
  si,
  profiles,
  profilesMap,
  doLockedStatus,
  onUpdate,
  onDuplicate,
  onDelete,
  onClose,
  isDoPanelOpen,
}: SIPanelContentProps) {
  const { toast } = useToast();
  // Fetch SI data with progress if we have a database ID
  const siDbId = si.dbId;
  const { siData: siWithProgress } = useSIWithProgress(siDbId);
  
  // Check if DO is locked
  const doStatus = doLockedStatus.get(doNode.id);
  const isDOLocked = doStatus?.locked ?? false;
  const isSILocked = siWithProgress?.locked_at ? true : false;
  const showPercentToGoal = isFeatureEnabled('siProgress') && isDOLocked && isSILocked && siWithProgress?.latestPercentToGoal !== null && siWithProgress?.latestPercentToGoal !== undefined;

  return (
    <div
      className={
        `fixed top-0 h-full w-[420px] bg-background border-l shadow-2xl p-4 flex flex-col overflow-y-auto z-[60] ` +
        (isDoPanelOpen ? "right-[380px]" : "right-0")
      }
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{si.title || "Untitled Initiative"}</h3>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {/* 1. Name */}
        <div>
          <label className="text-sm font-medium">SI Name</label>
          <div className="flex items-center gap-2 mt-1 mb-2">
            <label className="text-xs text-muted-foreground">Status</label>
            <select
              className="rounded border bg-background px-2 py-1 text-xs"
              value="draft"
              disabled
            >
              <option value="draft">ideating</option>
            </select>
          </div>
          <input className="w-full rounded border px-2 py-1 text-sm bg-background" value={si.title} onChange={(e)=>onUpdate({ title: e.target.value })} />
        </div>
        
        {/* 2. Description */}
        <div>
          <label className="text-sm font-medium">Description</label>
          <div className="mt-1">
            <RichTextEditor
              content={si.description || ""}
              onChange={(content) => onUpdate({ description: content })}
              placeholder="What is this initiative?"
              minHeight="96px"
            />
          </div>
        </div>
        
        {/* 3. Primary Success Metric */}
        <div>
          <label className="text-sm font-medium">Primary Success Metric</label>
          <textarea 
            className="mt-1 w-full rounded border px-2 py-2 text-sm bg-background resize-none" 
            rows={3}
            placeholder="e.g., % conversion, NPS, etc." 
            value={si.metric || ""} 
            onChange={(e)=>onUpdate({ metric: e.target.value })}
            style={{ 
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              whiteSpace: 'pre-wrap'
            }}
          />
        </div>
        
        {/* % to Goal - Only show when DO and SI are locked */}
        {showPercentToGoal && (
          <div>
            <Label className="text-sm font-medium">% to Goal</Label>
            <div className="mt-1 flex items-center gap-2">
              <Progress value={siWithProgress?.latestPercentToGoal ?? 0} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground w-10 text-right">
                {siWithProgress?.latestPercentToGoal ?? 0}%
              </span>
            </div>
          </div>
        )}
        
        {/* 4. Owner */}
        <div>
          <label className="text-sm font-medium">Owner</label>
          <div className="mt-1">
            <Select
              value={si.ownerId || ""}
              onValueChange={async (val) => {
                // Update local UI first
                onUpdate({ ownerId: val || undefined });

                // Persist to DB if SI is linked to a DB row
                try {
                  if (si.dbId && val) {
                    const { error } = await supabase
                      .from('rc_strategic_initiatives')
                      .update({ owner_user_id: val })
                      .eq('id', si.dbId);
                    if (error) {
                      console.warn('[SIPanel] Failed to persist SI owner change', error);
                      toast({ title: 'Update failed', description: 'Could not save owner change', variant: 'destructive' });
                    }
                  }
                } catch (e) {
                  console.warn('[SIPanel] Error updating SI owner in DB', e);
                }
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select owner">
                  {si.ownerId && (() => {
                    const owner = profilesMap[si.ownerId];
                    if (!owner) return null;
                    const displayName = owner.full_name || '';
                    const isUnknown = !displayName || displayName.trim().toLowerCase() === 'unknown';
                    return (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                          {isUnknown ? (
                            <span className="font-semibold">?</span>
                          ) : (
                            <FancyAvatar 
                              name={owner.avatar_name || displayName} 
                              displayName={displayName}
                              avatarUrl={owner.avatar_url}
                              size="sm" 
                            />
                          )}
                        </span>
                        <span className="text-sm">{isUnknown ? 'Unknown' : displayName}</span>
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {profiles.length === 0 ? (
                  <div className="py-2 px-2 text-sm text-muted-foreground text-center">
                    No profiles available
                  </div>
                ) : (
                  profiles.map((p) => {
                    const displayName = p.full_name || '';
                    const isUnknown = !displayName || displayName.trim().toLowerCase() === 'unknown';
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                            {isUnknown ? (
                              <span className="font-semibold">?</span>
                            ) : (
                              <FancyAvatar name={p.avatar_name || displayName} displayName={displayName} avatarUrl={p.avatar_url} size="sm" />
                            )}
                          </span>
                          <span>{isUnknown ? 'Unknown' : displayName}</span>
                        </span>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* 5. Other Participants */}
        <div>
          <label className="text-sm font-medium">Other Participants</label>
          <div className="mt-1">
            <MultiSelectParticipants
              profiles={profiles}
              selectedIds={si.participantIds || []}
              onSelectionChange={async (ids) => {
                // Update local UI
                onUpdate({ participantIds: ids });

                // Persist to DB if SI is linked
                try {
                  if (si.dbId) {
                    const { error } = await supabase
                      .from('rc_strategic_initiatives')
                      .update({ participant_user_ids: ids })
                      .eq('id', si.dbId);
                    if (error) {
                      console.warn('[SIPanel] Failed to persist SI participants change', error);
                      toast({ title: 'Update failed', description: 'Could not save participants', variant: 'destructive' });
                    }
                  }
                } catch (e) {
                  console.warn('[SIPanel] Error updating SI participants in DB', e);
                }
              }}
              placeholder="Select participants to help accomplish this goal..."
              excludeIds={si.ownerId ? [si.ownerId] : []}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

