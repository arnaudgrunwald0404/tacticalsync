import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, MoreVertical, ExternalLink, ChevronRight, FileText, Pencil, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { useTasksBySI } from '@/hooks/useTasks';
import { SIStatusControl } from '@/components/rcdo/SIStatusControl';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { updateInitiative, createInitiative } from '@/hooks/useRCDOMutations';
import { getSILockBlockers } from '@/lib/rcdoValidation';
import { useCurrentUser } from '@/contexts/AuthContext';

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
  onOpenSubSI?: (subSiId: string) => void;
  selectedSubSiId?: string | null;
  subSiListRefreshKey?: number;
  onLockSI?: () => void;
  onUnlockSI?: () => void;
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
  onLockSI,
  onUnlockSI,
}: SIPanelContentProps) {
  const navigate = useNavigate();
  const [panelSearchParams] = useSearchParams();
  const cycleParam = panelSearchParams.get('cycle');
  const { toast } = useToast();
  const { canEditInitiative } = useRCDOPermissions();
  const { user } = useCurrentUser();
  const isMobile = useIsMobile();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(si.title || '');

  // Canvas-created SIs start out local-only (no dbId) — nothing inserts them
  // into rc_strategic_initiatives until both NOT NULL columns (title, owner)
  // are known. Every field handler below calls this first: once title+owner
  // are present it inserts the row (carrying along whatever else was already
  // filled in locally), attaches the new id via onUpdate, and the caller's
  // own updateInitiative call then persists its specific edit as a normal
  // follow-up update. Returns undefined (silent no-op, matching prior
  // behavior) when title or owner still isn't known.
  const ensureSIPersisted = async (
    overrides: Partial<NonNullable<NodeData['saiItems']>[0]> = {}
  ): Promise<string | undefined> => {
    if (si.dbId) return si.dbId;
    const doDbId = doLockedStatus.get(doNode.id)?.dbId;
    const title = (overrides.title ?? si.title ?? '').trim();
    const ownerId = overrides.ownerId ?? si.ownerId;
    if (!doDbId || !title || !ownerId) return undefined;
    try {
      const created = await createInitiative({
        defining_objective_id: doDbId,
        title,
        owner_user_id: ownerId,
        description: overrides.description ?? si.description ?? null,
        primary_success_metric: overrides.metric ?? si.metric ?? null,
        benchmark: overrides.benchmark ?? si.benchmark ?? null,
        participant_user_ids: overrides.participantIds ?? si.participantIds ?? [],
        created_by: user?.id ?? null,
      });
      onUpdate({ dbId: created.id });
      return created.id;
    } catch (e) {
      console.warn('[SIPanel] Failed to create initiative', e);
      toast({ title: 'Save failed', description: 'Could not save this initiative', variant: 'destructive' });
      return undefined;
    }
  };

  // Fetch SI data with progress if we have a database ID
  const siDbId = si.dbId;
  const { siData: siWithProgress, refetch: refetchSI } = useSIWithProgress(siDbId);
  const { tasks: siTasks } = useTasksBySI(siDbId);

  const rawStatus = siWithProgress?.status || 'not_started';

  // Check if DO is locked
  const doStatus = doLockedStatus.get(doNode.id);
  const isDOLocked = doStatus?.locked ?? false;
  const isSILocked = siWithProgress?.locked_at ? true : false;
  const isLocked = isDOLocked || isSILocked;
  const siLockBlockers = useMemo(() => getSILockBlockers({
    title: si.title,
    description: si.description,
    ownerId: si.ownerId,
    metric: si.metric,
    startDate: (siWithProgress?.start_date as string | null) ?? null,
    endDate: (siWithProgress?.end_date as string | null) ?? null,
  }), [si.title, si.description, si.ownerId, si.metric, siWithProgress?.start_date, siWithProgress?.end_date]);
  const showPercentToGoal = isFeatureEnabled('siProgress') && isDOLocked && isSILocked && siWithProgress?.latestPercentToGoal !== null && siWithProgress?.latestPercentToGoal !== undefined;

  // Same permission gate used on the SI Detail page, so Canvas and Detail agree.
  const canEditStatus = canEditInitiative(
    si.ownerId || '',
    (siWithProgress?.locked_at as string | null) ?? null,
    doNode.data.ownerId,
    (siWithProgress?.created_by as string | undefined) ?? undefined
  );

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
      {/* Pill + icons row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-body text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-[#5B6E7A] text-white">Strategic Initiative</span>
          {si.dbId && !isDOLocked && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap border transition-colors focus:outline-none ${isSILocked ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'}`}>
                  {isSILocked ? 'Locked' : 'Draft'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {!isSILocked && onLockSI && (
                  siLockBlockers.length > 0 ? (
                    <span className="block" title={`Missing: ${siLockBlockers.join(', ')}`}>
                      <DropdownMenuItem disabled>
                        <Lock className="h-3.5 w-3.5 mr-2" />
                        Lock this SI
                      </DropdownMenuItem>
                    </span>
                  ) : (
                    <DropdownMenuItem onClick={onLockSI}>
                      <Lock className="h-3.5 w-3.5 mr-2" />
                      Lock this SI
                    </DropdownMenuItem>
                  )
                )}
                {isSILocked && onUnlockSI && (
                  <DropdownMenuItem onClick={onUnlockSI}>
                    <Unlock className="h-3.5 w-3.5 mr-2" />
                    Unlock this SI
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex items-center gap-1">
          {si.dbId && (
            <button
              className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent"
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
              <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
              {si.dbId && !isDOLocked && !isSILocked && onLockSI && (
                siLockBlockers.length > 0 ? (
                  <span className="block" title={`Missing: ${siLockBlockers.join(', ')}`}>
                    <DropdownMenuItem disabled>
                      <Lock className="h-3.5 w-3.5 mr-2" />
                      Lock this SI
                    </DropdownMenuItem>
                  </span>
                ) : (
                  <DropdownMenuItem onClick={onLockSI}>
                    <Lock className="h-3.5 w-3.5 mr-2" />
                    Lock this SI
                  </DropdownMenuItem>
                )
              )}
              {si.dbId && !isDOLocked && isSILocked && onUnlockSI && (
                <DropdownMenuItem onClick={onUnlockSI}>
                  <Unlock className="h-3.5 w-3.5 mr-2" />
                  Unlock this SI
                </DropdownMenuItem>
              )}
              {si.dbId && !isLocked && (() => {
                const acceptsSubSis = siWithProgress?.accepts_sub_sis ?? false;
                const hasSubSIs = subSIs.length > 0;
                if (!acceptsSubSis) {
                  return (
                    <DropdownMenuItem onClick={async () => {
                      await updateInitiative(si.dbId!, { accepts_sub_sis: true });
                      await refetchSI();
                    }}>
                      Allow sub-SIs
                    </DropdownMenuItem>
                  );
                }
                return (
                  <DropdownMenuItem
                    disabled={hasSubSIs}
                    onClick={async () => {
                      if (hasSubSIs) return;
                      await updateInitiative(si.dbId!, { accepts_sub_sis: false });
                      await refetchSI();
                    }}
                    title={hasSubSIs ? 'Delete all sub-initiatives first' : undefined}
                  >
                    Remove sub-SIs
                  </DropdownMenuItem>
                );
              })()}
              <DropdownMenuItem className="text-red-600" onClick={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Inline-editable title */}
      <div className="flex items-center gap-2 mb-3 group/title">
        {editingTitle ? (
          <input
            autoFocus
            className="text-base font-semibold bg-transparent border-b-2 border-blue-500 focus:outline-none flex-1 min-w-0"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft.trim() && titleDraft !== si.title) {
                const nextTitle = titleDraft.trim();
                onUpdate({ title: nextTitle });
                ensureSIPersisted({ title: nextTitle }).then((dbId) => {
                  if (dbId) updateInitiative(dbId, { title: nextTitle }).catch((e) => console.warn('[SIPanel] Failed to persist title change', e));
                });
              } else {
                setTitleDraft(si.title || '');
              }
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (titleDraft.trim() && titleDraft !== si.title) {
                  const nextTitle = titleDraft.trim();
                  onUpdate({ title: nextTitle });
                  ensureSIPersisted({ title: nextTitle }).then((dbId) => {
                    if (dbId) updateInitiative(dbId, { title: nextTitle }).catch((e) => console.warn('[SIPanel] Failed to persist title change', e));
                  });
                }
                setEditingTitle(false);
              }
              if (e.key === 'Escape') { setTitleDraft(si.title || ''); setEditingTitle(false); }
            }}
          />
        ) : (
          <>
            <h3 className="text-base font-semibold">{si.title || 'Untitled Initiative'}</h3>
            {isLocked && (
              <span className="font-body text-[10px] px-2 py-0.5 rounded-full bg-[#F5F3F0] text-[#4A5D5F] border border-[#6B9A8F]/30">locked</span>
            )}
            {!isLocked && (
              <button
                type="button"
                onClick={() => { setTitleDraft(si.title || ''); setEditingTitle(true); }}
                className="opacity-0 group-hover/title:opacity-100 p-1 rounded hover:bg-accent text-muted-foreground transition-opacity shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      <div className="space-y-3">
        {/* 1. Owner */}
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
                if (isLocked || !val) return;
                onUpdate({ ownerId: val });
                const dbId = await ensureSIPersisted({ ownerId: val });
                if (!dbId) return;
                try {
                  await updateInitiative(dbId, { owner_user_id: val });
                } catch (e) {
                  console.warn('[SIPanel] Error updating SI owner in DB', e);
                  toast({ title: 'Update failed', description: 'Could not save owner change', variant: 'destructive' });
                }
              }}
            />
          </div>
        </div>

        {/* 2. Description */}
        <div>
          <label className={`text-sm font-medium ${!si.description || si.description.replace(/<[^>]*>/g, '').trim() === '' ? 'text-red-600 dark:text-red-400' : ''}`}>Description</label>
          <div className="mt-1">
            <RichTextEditor
              content={si.description || ""}
              onChange={(content) => { if (isLocked) return; onUpdate({ description: content }); }}
              onBlur={async (content) => {
                if (isLocked) return;
                const dbId = await ensureSIPersisted({ description: content });
                if (!dbId) return;
                try {
                  await updateInitiative(dbId, { description: content });
                } catch (e) {
                  console.warn('[SIPanel] Failed to persist description change', e);
                  toast({ title: 'Update failed', description: 'Could not save description', variant: 'destructive' });
                }
              }}
              placeholder="What is this initiative?"
              minHeight="96px"
            />
          </div>
        </div>

        {/* 3. Primary Success Metric */}
        <div>
          <label className={`text-sm font-medium ${!si.metric || si.metric.trim() === '' ? 'text-red-600 dark:text-red-400' : ''}`}>Primary Success Metric</label>
          <textarea
            className="mt-1 w-full rounded border px-2 py-2 text-sm bg-background resize-none placeholder:text-muted-foreground"
            rows={3}
            placeholder="e.g., % conversion, NPS, etc."
            value={si.metric || ""}
            onChange={(e) => { if (isLocked) return; onUpdate({ metric: e.target.value }); }}
            onBlur={async () => {
              if (isLocked) return;
              const dbId = await ensureSIPersisted();
              if (!dbId) return;
              try {
                await updateInitiative(dbId, { primary_success_metric: si.metric || null });
              } catch (e) {
                console.warn('[SIPanel] Failed to persist metric change', e);
                toast({ title: 'Update failed', description: 'Could not save Primary Success Metric', variant: 'destructive' });
              }
            }}
            disabled={isLocked}
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
          />
        </div>

        {/* 4. Benchmark */}
        <div>
          <label className="text-sm font-medium">Benchmark</label>
          <textarea
            className="mt-1 w-full rounded border px-2 py-2 text-sm bg-background resize-none placeholder:text-muted-foreground"
            rows={2}
            placeholder="e.g., baseline or target comparison"
            value={si.benchmark || ""}
            onChange={(e) => { if (isLocked) return; onUpdate({ benchmark: e.target.value }); }}
            onBlur={async () => {
              if (isLocked) return;
              const dbId = await ensureSIPersisted();
              if (!dbId) return;
              try {
                await updateInitiative(dbId, { benchmark: si.benchmark || null });
              } catch (e) {
                console.warn('[SIPanel] Failed to persist benchmark change', e);
                toast({ title: 'Update failed', description: 'Could not save benchmark', variant: 'destructive' });
              }
            }}
            disabled={isLocked}
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
          />
        </div>

        {/* 5. Start Date & Target Delivery Date */}
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
                if (isLocked) return;
                const value = e.target.value;
                const currentEnd = (siWithProgress?.end_date as string) || '';
                if (value && currentEnd && currentEnd < value) {
                  toast({ title: 'Invalid date', description: 'Start date must be on or before the target delivery date.', variant: 'destructive' });
                  return;
                }
                const dbId = await ensureSIPersisted();
                if (!dbId) return;
                try {
                  await updateInitiative(dbId, { start_date: value || null });
                  await refetchSI();
                } catch (e) {
                  console.warn('[SIPanel] Failed to persist start date change', e);
                  toast({ title: 'Update failed', description: 'Could not save start date', variant: 'destructive' });
                }
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
                if (isLocked) return;
                const value = e.target.value;
                const currentStart = (siWithProgress?.start_date as string) || '';
                if (value && currentStart && value < currentStart) {
                  toast({ title: 'Invalid date', description: 'Target delivery date must be on or after the start date.', variant: 'destructive' });
                  return;
                }
                const dbId = await ensureSIPersisted();
                if (!dbId) return;
                try {
                  await updateInitiative(dbId, { end_date: value || null });
                  await refetchSI();
                } catch (e) {
                  console.warn('[SIPanel] Failed to persist end date change', e);
                  toast({ title: 'Update failed', description: 'Could not save target delivery date', variant: 'destructive' });
                }
              }}
            />
          </div>
        </div>

        {/* 5. Status */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium shrink-0">Status</Label>
          <SIStatusControl
            variant="select"
            status={rawStatus}
            canEdit={canEditStatus}
            taskCount={siTasks.length}
            onStatusChange={async (value) => {
              const dbId = await ensureSIPersisted();
              if (!dbId) return;
              try {
                await updateInitiative(dbId, { status: value });
                await refetchSI();
                toast({ title: 'Status updated', description: 'Strategic initiative status has been updated' });
              } catch (e) {
                toast({ title: 'Update failed', description: 'Could not save status change', variant: 'destructive' });
              }
            }}
          />
        </div>

        {/* % to Goal — only when DO and SI are locked */}
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

                  const dbId = await ensureSIPersisted({ participantIds: ids });
                  if (!dbId) return;
                  try {
                    await updateInitiative(dbId, { participant_user_ids: ids });
                  } catch (e) {
                    console.warn('[SIPanel] Error updating SI participants in DB', e);
                    toast({ title: 'Update failed', description: 'Could not save participants', variant: 'destructive' });
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
                          <span className="capitalize">{(sub.status || 'not_started').replace('_', ' ')}</span>
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
        `fixed top-0 h-full w-[380px] bg-[#F5F3F0] border-l shadow-2xl p-4 flex flex-col overflow-y-auto z-[60] ` +
        (isDoPanelOpen ? "right-[380px]" : "right-0")
      }
    >
      {panelContent}
    </div>
  );
}

