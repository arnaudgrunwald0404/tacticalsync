import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, MoreVertical, ExternalLink, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { OwnerCombobox } from '@/components/ui/owner-combobox';
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
    benchmark?: string;
    description?: string;
    dbId?: string;
  }>;
  rallyCandidates?: string[];
  rallySelectedIndex?: number;
  rallyFinalized?: boolean;
};

type SubSIListRow = {
  id: string;
  title: string;
  status: string | null;
  owner_user_id: string | null;
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
  // Optional: when provided, the panel renders a "Sub-initiatives" list at the
  // bottom (for SIs that have children). Clicking a row calls onOpenSubSI so
  // the parent canvas can open the tertiary panel.
  onOpenSubSI?: (subSiId: string) => void;
  // Active sub-SI id — surfaced so the matching row can highlight itself.
  selectedSubSiId?: string | null;
  // Bumps when a child component reports an update; lets the parent ask this
  // panel to re-fetch its sub-SI list without unmounting.
  subSiListRefreshKey?: number;
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
  onOpenSubSI,
  selectedSubSiId,
  subSiListRefreshKey,
}: SIPanelContentProps) {
  const navigate = useNavigate();
  const [panelSearchParams] = useSearchParams();
  const cycleParam = panelSearchParams.get('cycle');
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

  // Sub-SI list (rendered at the bottom when this SI has children). Kept inside
  // SIPanelContent rather than threaded through StrategyCanvas so callers don't
  // each have to fetch — the panel owns its own dependent data.
  const [subSIs, setSubSIs] = useState<SubSIListRow[]>([]);
  useEffect(() => {
    if (!si.dbId) {
      setSubSIs([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('rc_strategic_initiatives')
      .select('id, title, status, owner_user_id, display_order')
      .eq('parent_si_id', si.dbId)
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setSubSIs((data || []) as SubSIListRow[]);
      });
    return () => { cancelled = true; };
    // subSiListRefreshKey is a "ping" prop: when the parent canvas wants this
    // list to re-fetch (e.g., after a child edited a sub-SI), it bumps the key.
  }, [si.dbId, subSiListRefreshKey]);

  const panelContent = (
    <>
      <div className="mb-3">
        <span className="font-body text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-[#5B6E7A] text-white">Strategic Initiative</span>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{si.title || "Untitled Initiative"}</h3>
          {isLocked && (
            <span className="font-body text-[10px] px-2 py-0.5 rounded-full bg-[#F5F3F0] text-[#4A5D5F] border border-[#6B9A8F]/30">locked</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {si.dbId && (
            <button
              className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]"
              aria-label="Open in full page"
              onClick={() => {
                navigate(`/rcdo/detail/si/${si.dbId}${cycleParam ? `?cycle=${cycleParam}` : ''}`);
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
        
        {/* 2b. Start Date & Target Delivery Date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="si-start-date" className="text-sm font-medium">Start Date</Label>
            <Input
              id="si-start-date"
              type="date"
              value={(siWithProgress?.start_date as string) || ''}
              disabled={isLocked}
              className="h-9 text-sm"
              onChange={async (e) => {
                if (isLocked || !si.dbId) return;
                const value = e.target.value;
                const currentEnd = (siWithProgress?.end_date as string) || '';
                if (value && currentEnd && currentEnd < value) return;
                const { error } = await supabase
                  .from('rc_strategic_initiatives')
                  .update({ start_date: value || null })
                  .eq('id', si.dbId);
                if (!error) await refetchSI();
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="si-target-date" className="text-sm font-medium">Target Delivery Date</Label>
            <Input
              id="si-target-date"
              type="date"
              value={(siWithProgress?.end_date as string) || ''}
              disabled={isLocked}
              className="h-9 text-sm"
              onChange={async (e) => {
                if (isLocked || !si.dbId) return;
                const value = e.target.value;
                const currentStart = (siWithProgress?.start_date as string) || '';
                if (value && currentStart && value < currentStart) return;
                const { error } = await supabase
                  .from('rc_strategic_initiatives')
                  .update({ end_date: value || null })
                  .eq('id', si.dbId);
                if (!error) await refetchSI();
              }}
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
            onBlur={async () => {
              if (!si.dbId || isLocked) return;
              await supabase.from('rc_strategic_initiatives').update({ primary_success_metric: si.metric || null } as Record<string, unknown>).eq('id', si.dbId);
            }}
            disabled={isLocked}
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
          />
        </div>

        {/* 3b. Benchmark */}
        <div>
          <label className="text-sm font-medium">Benchmark</label>
          <textarea
            className="mt-1 w-full rounded border px-2 py-2 text-sm bg-background resize-none"
            rows={2}
            placeholder="e.g., baseline or target comparison"
            value={si.benchmark || ""}
            onChange={(e) => { if (isLocked) return; onUpdate({ benchmark: e.target.value }); }}
            onBlur={async () => {
              if (!si.dbId || isLocked) return;
              await supabase.from('rc_strategic_initiatives').update({ benchmark: si.benchmark || null } as Record<string, unknown>).eq('id', si.dbId);
            }}
            disabled={isLocked}
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
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
            <OwnerCombobox
              profiles={profiles}
              selectedId={si.ownerId}
              disabled={isLocked}
              placeholder="Select owner"
              onSelectionChange={async (val) => {
                if (isLocked) return;
                onUpdate({ ownerId: val });

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
            />
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

        {/* 6. Sub-initiatives — only renders when the SI has children. The kebab/
            toggle that flips an SI into sub-SI mode lives on the detail page, so
            the canvas panel simply reflects whatever state the DB already shows. */}
        {onOpenSubSI && si.dbId && subSIs.length > 0 && (
          <div>
            <label className="text-sm font-medium">Sub-initiatives</label>
            <div className="mt-1 border rounded-md overflow-hidden bg-[#F5F3F0]">
              {subSIs.map((sub) => {
                const subOwner = sub.owner_user_id ? profilesMap[sub.owner_user_id] : null;
                const isActive = selectedSubSiId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onOpenSubSI(sub.id)}
                    className={
                      `w-full px-3 py-2 flex items-center justify-between min-h-[44px] text-left transition-colors border-b last:border-b-0 ` +
                      (isActive ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800/60')
                    }
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{sub.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className="capitalize">{(sub.status || 'draft').replace('_', ' ')}</span>
                          {subOwner && (
                            <>
                              <span>•</span>
                              <span className="truncate">{subOwner.full_name || 'Unknown'}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
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

