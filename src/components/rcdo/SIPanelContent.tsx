import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MoreVertical, ExternalLink } from 'lucide-react';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';

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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isSuperAdmin, isRCDOAdmin } = useRoles();
  const isMobile = useIsMobile();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Fetch SI data with progress if we have a database ID
  const siDbId = si.dbId;
  const { siData: siWithProgress, refetch: refetchSI } = useSIWithProgress(siDbId);
  
  // Get current status from database or default to 'draft'
  // Handle potential null/undefined or old status values
  const getStatusLabel = (status: string | null | undefined): string => {
    if (!status) return 'Draft';
    const statusMap: Record<string, string> = {
      'draft': 'Draft',
      'initialized': 'Initialized',
      'on_track': 'On Track',
      'delayed': 'Delayed',
      'cancelled': 'Cancelled',
      // Handle old values that might still exist
      'not_started': 'Draft',
      'at_risk': 'Delayed',
      'off_track': 'Delayed',
      'completed': 'On Track',
      'active': 'On Track',
      'blocked': 'Delayed',
      'done': 'On Track',
    };
    return statusMap[status] || 'Draft';
  };

  // Normalize status value to ensure it matches one of the valid SelectItem values
  const normalizeStatus = (status: string | null | undefined): InitiativeStatus => {
    if (!status) return 'draft';
    const validStatuses: InitiativeStatus[] = ['draft', 'initialized', 'on_track', 'delayed', 'cancelled'];
    // If it's already a valid status, return it
    if (validStatuses.includes(status as InitiativeStatus)) {
      return status as InitiativeStatus;
    }
    // Map old values to new values
    const statusMapping: Record<string, InitiativeStatus> = {
      'not_started': 'draft',
      'at_risk': 'delayed',
      'off_track': 'delayed',
      'completed': 'on_track',
      'active': 'on_track',
      'blocked': 'delayed',
      'done': 'on_track',
    };
    return statusMapping[status] || 'draft';
  };

  const rawStatus = siWithProgress?.status || 'draft';
  const currentStatus: InitiativeStatus = normalizeStatus(rawStatus);
  const statusLabel = getStatusLabel(rawStatus);
  
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

  const panelContent = (
    <>
      <div className="mb-3">
        <span className="font-body text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-[#5B6E7A] text-white">Strategic Initiative</span>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{si.title || "Untitled Initiative"}</h3>
          {isLocked && (
            <span className="font-body text-[10px] px-2 py-0.5 rounded-full bg-[#F5F3F0] text-[#4A5D5F] border border-[#E8B4A0]/30">locked</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {si.dbId && (
            <button
              className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]"
              aria-label="Open in full page"
              onClick={() => {
                navigate(`/rcdo/detail/si/${si.dbId}`);
                if (isMobile) onClose();
              }}
              title="Open in full page"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {/* 1. Name */}
        <div>
          

          <div className="flex items-center gap-2 mt-1 mb-2">
            <Label className="text-sm font-medium">Status</Label>
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
              <SelectTrigger className="h-7 text-xs" aria-label="Status">
                <SelectValue placeholder="Select status">
                  {statusLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="initialized">Initialized</SelectItem>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className={`text-sm font-medium ${!si.title || si.title.trim() === '' ? 'text-red-600 dark:text-red-400' : ''}`}>Name</label>
          <input className="w-full rounded border px-2 py-1 text-sm bg-background" value={si.title} onChange={(e)=>{ if (isLocked) return; onUpdate({ title: e.target.value }); }} disabled={isLocked} />
        </div>
        
        {/* 2. Description */}
        <div>
          <label className={`text-sm font-medium ${!si.description || si.description.trim().replace(/<[^>]*>/g, '').trim() === '' ? 'text-red-600 dark:text-red-400' : ''}`}>Description</label>
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
          <label className={`text-sm font-medium ${!si.metric || si.metric.trim() === '' ? 'text-red-600 dark:text-red-400' : ''}`}>Primary Success Metric</label>
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
          {(() => {
            const owner = si.ownerId ? profilesMap[si.ownerId] : null;
            const displayName = owner?.full_name || '';
            const isUnknown = !si.ownerId || !owner || !displayName || displayName.trim().toLowerCase() === 'unknown';
            return (
              <label className={`text-sm font-medium ${isUnknown ? 'text-red-600 dark:text-red-400' : ''}`}>Owner</label>
            );
          })()}
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
                        .update({ participant_user_ids: ids } as any)
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
    </>
  );

  // Mobile: Use Sheet (bottom sheet)
  if (isMobile) {
    return (
      <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="h-[90vh] max-h-[90vh] overflow-y-auto">
          {panelContent}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Fixed panel
  return (
    <div
      className={
        `fixed top-0 h-full w-[420px] bg-[#F5F3F0] border-l shadow-2xl p-4 flex flex-col overflow-y-auto z-[60] ` +
        (isDoPanelOpen ? "right-[380px]" : "right-0")
      }
    >
      {panelContent}
    </div>
  );
}

