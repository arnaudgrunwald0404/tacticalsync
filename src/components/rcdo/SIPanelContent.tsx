import React, { useState, useEffect } from 'react';
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
import { useRoles } from '@/hooks/useRoles';
import type { InitiativeStatus } from '@/types/rcdo';

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
  const { isAdmin, isSuperAdmin, isRCDOAdmin } = useRoles();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Fetch SI data with progress if we have a database ID
  const siDbId = si.dbId;
  const { siData: siWithProgress, refetch: refetchSI } = useSIWithProgress(siDbId);
  
  // Get current status from database or default to 'not_started'
  const currentStatus: InitiativeStatus = (siWithProgress?.status as InitiativeStatus) || 'not_started';
  
  // Check if DO is locked
  const doStatus = doLockedStatus.get(doNode.id);
  const isDOLocked = doStatus?.locked ?? false;
  const isSILocked = siWithProgress?.locked_at ? true : false;
  const isLocked = isDOLocked || isSILocked;
  const showPercentToGoal = isFeatureEnabled('siProgress') && isDOLocked && isSILocked && siWithProgress?.latestPercentToGoal !== null && siWithProgress?.latestPercentToGoal !== undefined;
  
  // Status should be editable when SI is unlocked OR when user is SI owner/admin (per PRD, status updates are allowed even when locked)
  const canEditStatus = !isLocked || isAdmin || isSuperAdmin || isRCDOAdmin || (currentUserId === si.ownerId);
  
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  return (
    <div
      className={
        `fixed top-0 h-full w-[420px] bg-background border-l shadow-2xl p-4 flex flex-col overflow-y-auto z-[60] ` +
        (isDoPanelOpen ? "right-[380px]" : "right-0")
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{si.title || "Untitled Initiative"}</h3>
          {isLocked && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border">locked</span>
          )}
        </div>
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
            <Select
              value={currentStatus}
              disabled={!canEditStatus}
              onValueChange={async (value: InitiativeStatus) => {
                if (!canEditStatus) return;
                
                // Persist to DB if SI is linked to a DB row
                try {
                  if (si.dbId) {
                    const { error } = await supabase
                      .from('rc_strategic_initiatives')
                      .update({ status: value })
                      .eq('id', si.dbId);
                    if (error) {
                      console.warn('[SIPanel] Failed to persist SI status change', error);
                      toast({ title: 'Update failed', description: 'Could not save status change', variant: 'destructive' });
                      return;
                    }
                    // Refetch to update UI with new status
                    await refetchSI();
                    toast({ title: 'Status updated', description: 'Strategic initiative status has been updated' });
                  }
                } catch (e) {
                  console.warn('[SIPanel] Error updating SI status in DB', e);
                  toast({ title: 'Update failed', description: 'Could not save status change', variant: 'destructive' });
                  return;
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="at_risk">At Risk</SelectItem>
                <SelectItem value="off_track">Off Track</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <input className="w-full rounded border px-2 py-1 text-sm bg-background" value={si.title} onChange={(e)=>{ if (isLocked) return; onUpdate({ title: e.target.value }); }} disabled={isLocked} />
        </div>
        
        {/* 2. Description */}
        <div>
          <label className="text-sm font-medium">Description</label>
          <div className="mt-1">
            <RichTextEditor
              content={si.description || ""}
              onChange={(content) => { if (isLocked) return; onUpdate({ description: content }); }}
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
            onChange={(e)=>{ if (isLocked) return; onUpdate({ metric: e.target.value }); }}
            disabled={isLocked}
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
              disabled={isLocked}
              onValueChange={async (val) => {
                if (isLocked) return;
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
              <SelectTrigger className="flex-1" disabled={isLocked}>
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
            <div className={isLocked ? 'pointer-events-none opacity-70' : ''} aria-disabled={isLocked}>
              <MultiSelectParticipants
                profiles={profiles}
                selectedIds={si.participantIds || []}
                onSelectionChange={async (ids) => {
                  if (isLocked) return;
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
    </div>
  );
}

