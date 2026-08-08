import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, MessageSquare, GripVertical } from 'lucide-react';
import { useDODetails, useDOMetrics, useStrategicInitiatives, useRCLinks, useCheckins, useActiveCycle } from '@/hooks/useRCDO';
import { updateDO, lockDO, unlockDO, deleteDO } from '@/hooks/useRCDOMutations';
import { getDOLockBlockers } from '@/lib/rcdoValidation';
import type { StrategicInitiativeWithRelations } from '@/types/rcdo';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { useToast } from '@/hooks/use-toast';
import { InitiativeCard } from '@/components/rcdo/InitiativeCard';
import { MetricDialog } from '@/components/rcdo/MetricDialog';
import { InitiativeDialog } from '@/components/rcdo/InitiativeDialog';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';
import { CheckinCard } from '@/components/rcdo/CheckinCard';
import { LinkedMeetingItems } from '@/components/rcdo/LinkedMeetingItems';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { parseLocalDate } from '@/lib/dateUtils';
import { isCheckinStale, isMetricStale } from '@/lib/rcdoStaleness';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { DetailPageHeader } from '@/components/rcdo/DetailPageHeader';
import { useRCDODetail } from '@/contexts/RCDODetailContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCycleAllSIs } from '@/hooks/useCycleAllSIs';
import { ProgressBadge, PercentCell, DeltaCell } from '@/components/rcdo/SIProgressCells';

// Drag handle: only this element listens for the gesture (via useSortable's
// attributes/listeners), so clicking anywhere else in the row never starts a
// drag. Disabled (hidden handle, no listeners) when the DO is locked or the
// viewer can't edit — same gate as the "Add Initiative" button above the table.
function SortableSIRow({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative',
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="align-top">
      <TableCell className="py-3">
        {!disabled && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </TableCell>
      {children}
    </TableRow>
  );
}

export default function DODetail() {
  const { doId } = useParams<{ doId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initiativeIdFromUrl = searchParams.get('initiative');
  const [activeTab, setActiveTab] = useState('tracking');
  const [showMetricDialog, setShowMetricDialog] = useState(false);
  const [showInitiativeDialog, setShowInitiativeDialog] = useState(false);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { user } = useCurrentUser();
  const [selectedInitiative, setSelectedInitiative] = useState<StrategicInitiativeWithRelations | null>(null);
  const { setNavState } = useRCDODetail();
  const { toast } = useToast();
  const [siDateError, setSiDateError] = useState<string | null>(null);

  const { cycle: activeCycle } = useActiveCycle();
  const cycleIdFromUrl = searchParams.get('cycle');

  // Fetch DO details
  const { doDetails, loading: doLoading, refetch: refetchDO } = useDODetails(doId);

  // Derive cycle from DO's parent chain so it works even without ?cycle= param
  const [derivedCycleId, setDerivedCycleId] = useState<string | null>(null);
  useEffect(() => {
    if (cycleIdFromUrl || !doDetails?.rallying_cry_id) return;
    supabase.from('rc_rallying_cries').select('cycle_id').eq('id', doDetails.rallying_cry_id).single()
      .then(({ data }) => { if (data) setDerivedCycleId(data.cycle_id); });
  }, [doDetails?.rallying_cry_id, cycleIdFromUrl]);
  const cycleId = cycleIdFromUrl || derivedCycleId || activeCycle?.id;

  // Publish nav state to the persistent layout
  useEffect(() => {
    // Immediately clear SI selection so the sidebar reflects this DO page right away
    setNavState({ currentDOId: doId, currentSIId: undefined, currentTaskId: undefined });
  }, [doId]);

  useEffect(() => {
    if (!doDetails?.rallying_cry_id) return;
    setNavState({
      rallyingCryId: doDetails.rallying_cry_id as string,
      cycleId: cycleId || undefined,
      currentDOId: doId,
      currentSIId: undefined,
      currentTaskId: undefined,
    });
  }, [doDetails?.rallying_cry_id, doId, cycleId]);

  // Compute numbering (e.g. "2.0") for this DO within the rallying cry
  const [doNumbering, setDoNumbering] = useState('');
  useEffect(() => {
    const compute = async () => {
      if (!doDetails?.rallying_cry_id) { setDoNumbering(''); return; }
      const { data: dos } = await supabase
        .from('rc_defining_objectives')
        .select('id')
        .eq('rallying_cry_id', doDetails.rallying_cry_id)
        .order('display_order', { ascending: true });
      const idx = (dos || []).findIndex(d => d.id === doId);
      setDoNumbering(`${idx >= 0 ? idx + 1 : 1}.0`);
    };
    compute();
  }, [doDetails?.rallying_cry_id, doId]);

  // Fetch metrics
  const {
    metrics,
    loading: metricsLoading,
    refetch: refetchMetrics,
    updateMetric,
    upsertPrimaryMetric,
  } = useDOMetrics(doId);

  // Fetch initiatives
  const {
    initiatives,
    loading: initiativesLoading,
    refetch: refetchInitiatives,
    reorderInitiatives,
  } = useStrategicInitiatives(doId);

  // Fetch links
  const { links, loading: linksLoading, refetch: refetchLinks } = useRCLinks('do', doId);

  // Fetch check-ins
  const { checkins, loading: checkinsLoading, refetch: refetchCheckins } = useCheckins('do', doId);

  // Permissions
  const { canEditDO, canLockDO, canEditInitiative } = useRCDOPermissions();

  // Check-in progress data for tracking table (filtered to this DO client-side)
  const { rows: allSIRows, loading: siProgressLoading } = useCycleAllSIs(doDetails?.rallying_cry_id);
  const siProgressMap = useMemo(
    () => new Map(allSIRows.filter(r => r.doId === doId).map(r => [r.siId, r])),
    [allSIRows, doId]
  );

  const handleMetricSuccess = () => {
    refetchMetrics();
  };

  const handleInitiativeSuccess = () => {
    refetchInitiatives();
  };

  // 5px activation distance keeps row clicks/links responsive: nothing starts
  // a drag until the pointer moves at least 5px (same as SISubTree's sub-SI
  // reorder sensor).
  const siSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSIDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = initiatives.map((i) => i.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    await reorderInitiatives(arrayMove(ids, oldIndex, newIndex));
  }, [initiatives, reorderInitiatives]);

  const handleSIDateChange = async (field: 'start_date' | 'end_date', value: string) => {
    if (!selectedInitiative) return;
    const currentStart = selectedInitiative.start_date || '';
    const currentEnd = selectedInitiative.end_date || '';
    const nextStart = field === 'start_date' ? value : currentStart;
    const nextEnd = field === 'end_date' ? value : currentEnd;

    if (nextStart && nextEnd && nextEnd < nextStart) {
      setSiDateError('End date must be on or after start date.');
      return;
    }
    setSiDateError(null);

    const { error } = await supabase
      .from('rc_strategic_initiatives')
      .update({ [field]: value || null })
      .eq('id', selectedInitiative.id);
    if (!error) {
      refetchInitiatives();
    }
  };

  const handleCheckInSuccess = () => {
    refetchCheckins();
  };

  // Real-time updates
  useRCDORealtime({
    doId,
    onDOUpdate: refetchDO,
    onMetricsUpdate: refetchMetrics,
    onInitiativesUpdate: refetchInitiatives,
    onLinksUpdate: refetchLinks,
    onCheckinsUpdate: refetchCheckins,
  });

  const loading = doLoading || metricsLoading || initiativesLoading || linksLoading || checkinsLoading;

  type ProfileEntry = { id: string; full_name?: string | null; avatar_name?: string | null; avatar_url?: string | null };
  // Profiles for owner selection - load on mount
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, avatar_name, avatar_url')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => { if (!error && data) setProfiles(data as ProfileEntry[]); });
  }, []);

  // Fetch any missing profiles explicitly referenced by this DO or its initiatives
  useEffect(() => {
    if (!doDetails && (!initiatives || initiatives.length === 0)) return;

    const needed = new Set<string>();
    if (doDetails?.owner_user_id) needed.add(doDetails.owner_user_id);
    for (const ini of (initiatives || [])) {
      if (ini.owner_user_id) needed.add(ini.owner_user_id);
      if (Array.isArray(ini.participant_user_ids)) {
        for (const pid of ini.participant_user_ids) needed.add(String(pid));
      }
    }
    if (needed.size === 0) return;

    const have = new Set(profiles.map((p) => p.id));
    const missing = Array.from(needed).filter((id) => !have.has(id));
    if (missing.length === 0) return;

    supabase
      .from('profiles')
      .select('id, full_name, avatar_name, avatar_url')
      .in('id', missing)
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;
        setProfiles((prev) => {
          const map = new Map(prev.map((p) => [p.id, p] as const));
          for (const row of data as ProfileEntry[]) map.set(row.id, row);
          return Array.from(map.values());
        });
      });
  }, [doDetails, initiatives, profiles]);

  // Get current user
  useEffect(() => {
    if (user) {
      setCurrentUserId(user.id);
    }
  }, [user]);

  // Set selected initiative when initiativeId is in URL
  useEffect(() => {
    if (initiativeIdFromUrl) {
      const initiative = initiatives.find(i => i.id === initiativeIdFromUrl);
      if (initiative) {
        setSelectedInitiative(initiative);
      }
    } else {
      setSelectedInitiative(null);
    }
  }, [initiativeIdFromUrl, initiatives]);

  if (loading || !doDetails) {
    return (
      <>
        <Skeleton className="h-12 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </>
    );
  }

  const isLocked = !!doDetails.locked_at;
  const canEdit = canEditDO(doDetails.owner_user_id, doDetails.locked_at);
  const isOwner = currentUserId === doDetails.owner_user_id;

  // Lightweight in-app staleness cue for the page you're already viewing —
  // reuses data already fetched here (checkins, metrics), so no extra query.
  // This is *not* cycle-active-gated like the scheduled Slack nudge (see
  // supabase/functions/rcdo-stale-check/index.ts) since it's just a passive
  // indicator on a page the owner/viewer navigated to directly, not an
  // unsolicited notification — draft/done DOs are still excluded so a
  // not-yet-started or finished DO never shows a false "stale" cue.
  const isStale =
    doDetails.status !== 'draft' &&
    doDetails.status !== 'done' &&
    (isCheckinStale({ latestCheckinDate: checkins[0]?.date ?? null, createdAt: doDetails.created_at }) ||
      metrics.some((m) => isMetricStale({ lastUpdatedAt: m.last_updated_at, createdAt: m.created_at })));
  const ownerName = getFullNameForAvatar(
    doDetails.owner?.first_name,
    doDetails.owner?.last_name,
    doDetails.owner?.full_name
  );

  const handleLock = async () => {
    if (!doDetails) return;

    const missing = getDOLockBlockers({
      title: doDetails.title,
      hypothesis: doDetails.hypothesis,
      primarySuccessMetricName: metrics.find(m => m.type === 'lagging')?.name,
      ownerId: doDetails.owner_user_id,
    });

    if (missing.length > 0) {
      toast({
        title: "Can't finalize yet",
        description: `Please fill in the following before locking:\n• ${missing.join('\n• ')}`,
        variant: 'destructive',
      });
      return;
    }

    try {
      await lockDO(doDetails.id, currentUserId ?? undefined);
      await Promise.all([refetchDO(), refetchInitiatives()]);
    } catch (e) {
      console.warn('Failed to lock DO', e);
      toast({ title: 'Failed to lock', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    }
  };

  const handleUnlock = async () => {
    if (!doDetails) return;
    try {
      await unlockDO(doDetails.id);
      await Promise.all([refetchDO(), refetchInitiatives()]);
    } catch (e) {
      console.warn('Failed to unlock DO', e);
      toast({ title: 'Failed to unlock', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!doDetails) return;
    if (!window.confirm(`Delete "${doDetails.title}"? This will also delete its Strategic Initiatives and cannot be undone.`)) {
      return;
    }
    try {
      await deleteDO(doDetails.id);
      toast({ title: 'Deleted', description: `"${doDetails.title}" was deleted.` });
      navigate(`/rcdo/canvas${cycleId ? `?cycle=${cycleId}` : ''}`);
    } catch (e) {
      console.error('Failed to delete DO', e);
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Could not delete this Defining Objective.', variant: 'destructive' });
    }
  };

  // Additional content for selected initiative
  const additionalContent = selectedInitiative ? (
    <>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {selectedInitiative.title}
      </h2>
      {selectedInitiative.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {selectedInitiative.description.replace(/<[^>]*>/g, '').trim()}
        </p>
      )}
      {selectedInitiative.owner && (
        <div className="flex items-center gap-2 text-sm">
          <FancyAvatar
            name={selectedInitiative.owner?.avatar_name || getFullNameForAvatar(
              selectedInitiative.owner?.first_name,
              selectedInitiative.owner?.last_name,
              selectedInitiative.owner?.full_name
            )}
            displayName={getFullNameForAvatar(
              selectedInitiative.owner?.first_name,
              selectedInitiative.owner?.last_name,
              selectedInitiative.owner?.full_name
            )}
            avatarUrl={selectedInitiative.owner?.avatar_url}
            size="sm"
          />
          <span className="text-gray-700 dark:text-gray-300">
            {getFullNameForAvatar(
              selectedInitiative.owner?.first_name,
              selectedInitiative.owner?.last_name,
              selectedInitiative.owner?.full_name
            )}
          </span>
        </div>
      )}
    </>
  ) : undefined;

  return (
    <>
      <DetailPageHeader
        title={doNumbering ? `${doNumbering} ${doDetails.title}` : doDetails.title}
        description={doDetails.hypothesis}
        owner={doDetails.owner}
        isLocked={isLocked}
        isOwner={isOwner}
        currentUserId={currentUserId}
        isStale={isStale}
        type="do"
        doId={doDetails.id}
        metrics={metrics}
        status={doDetails.status}
        primarySuccessMetric={metrics.find(m => m.type === 'lagging')?.name || ''}
        onPrimarySuccessMetricChange={async (value) => {
          try { await upsertPrimaryMetric(value); } catch { /* hook already toasted */ }
        }}
        onLock={handleLock}
        onUnlock={handleUnlock}
        onDelete={handleDelete}
        canDelete={canLockDO}
        onCheckIn={() => setShowCheckInDialog(true)}
        canLock={canLockDO}
        canEdit={canEdit}
        additionalContent={additionalContent}
        editableTitle={doDetails.title}
        onTitleChange={async (val) => {
          try { await updateDO(doDetails.id, { title: val }); refetchDO(); }
          catch (e) { toast({ title: 'Update failed', description: 'Could not save title', variant: 'destructive' }); }
        }}
        onDescriptionChange={async (val) => {
          try { await updateDO(doDetails.id, { hypothesis: val }); refetchDO(); }
          catch (e) { toast({ title: 'Update failed', description: 'Could not save Definition & Hypothesis', variant: 'destructive' }); }
        }}
        onOwnerChange={async (val) => {
          try { await updateDO(doDetails.id, { owner_user_id: val }); refetchDO(); }
          catch (e) { toast({ title: 'Update failed', description: 'Could not save owner', variant: 'destructive' }); }
        }}
        profiles={profiles}
      />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="tracking">
                Tracking
              </TabsTrigger>
              <TabsTrigger value="checkins">
                Check-ins ({checkins.length})
              </TabsTrigger>
              <TabsTrigger value="linked">
                Linked from meetings ({links.filter(l => l.kind === 'meeting_priority' || l.kind === 'action_item').length})
              </TabsTrigger>
            </TabsList>

            {/* Tracking Tab */}
            <TabsContent value="tracking">
              <Card className="p-6">
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Strategic Initiatives
                      </h3>
                      {!isLocked && (
                        <Button
                          size="sm"
                          disabled={!canEdit}
                          onClick={() => setShowInitiativeDialog(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Initiative
                        </Button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <DndContext sensors={siSensors} onDragEnd={handleSIDragEnd}>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-[#2C3E50] hover:bg-[#2C3E50]">
                              <TableHead className="text-white font-semibold w-[32px]" />
                              <TableHead className="text-white font-semibold w-[180px]">Owner</TableHead>
                              <TableHead className="text-white font-semibold">Strategic Initiative</TableHead>
                              <TableHead className="text-white font-semibold w-[140px]">Progress</TableHead>
                              <TableHead className="text-white font-semibold w-[180px]">% Complete</TableHead>
                              <TableHead className="text-white font-semibold w-[180px]">Trend</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {siProgressLoading ? (
                              Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={`skeleton-${i}`}>
                                  <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                                  <TableCell><Skeleton className="h-4 w-full max-w-md" /></TableCell>
                                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                  <TableCell><Skeleton className="h-2 w-full" /></TableCell>
                                  <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                                </TableRow>
                              ))
                            ) : initiatives.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                                  No strategic initiatives yet.
                                </TableCell>
                              </TableRow>
                            ) : (
                              <SortableContext items={initiatives.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                                {initiatives.map((initiative) => {
                                  const progress = siProgressMap.get(initiative.id);
                                  const siOwnerName = getFullNameForAvatar(
                                    initiative.owner?.first_name,
                                    initiative.owner?.last_name,
                                    initiative.owner?.full_name
                                  );
                                  return (
                                    <SortableSIRow key={initiative.id} id={initiative.id} disabled={isLocked || !canEdit}>
                                      <TableCell className="py-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <FancyAvatar
                                            name={initiative.owner?.avatar_name || siOwnerName}
                                            displayName={siOwnerName}
                                            avatarUrl={initiative.owner?.avatar_url}
                                            size="sm"
                                          />
                                          <span className="text-sm font-medium truncate">{siOwnerName}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-3 text-sm">{initiative.title}</TableCell>
                                      <TableCell className="py-3">
                                        <ProgressBadge status={progress?.status ?? 'unknown'} />
                                      </TableCell>
                                      <TableCell className="py-3">
                                        <PercentCell value={progress?.latestPercent ?? null} />
                                      </TableCell>
                                      <TableCell className="py-3">
                                        <DeltaCell
                                          latestPercent={progress?.latestPercent ?? null}
                                          priorPercent={progress?.priorPercent ?? null}
                                          priorCheckinDate={progress?.priorCheckinDate ?? null}
                                        />
                                      </TableCell>
                                    </SortableSIRow>
                                  );
                                })}
                              </SortableContext>
                            )}
                          </TableBody>
                        </Table>
                      </DndContext>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Check-ins Tab */}
            <TabsContent value="checkins">
              <Card>
                {checkins.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      No check-ins yet. Add a check-in to track progress and updates.
                    </p>
                    {isOwner && !isLocked && (
                      <Button onClick={() => setShowCheckInDialog(true)}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Add Check-In
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="space-y-4">
                      {checkins.map((checkin) => (
                        <CheckinCard key={checkin.id} checkin={checkin} />
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Linked from meetings Tab */}
            <TabsContent value="linked">
              <Card className="p-6">
                <LinkedMeetingItems
                  links={links}
                  loading={linksLoading}
                  emptyMessage="No meeting priorities or action items have been linked to this Defining Objective yet."
                />
              </Card>
            </TabsContent>
          </Tabs>

      {/* Dialogs */}
      {doId && (
        <>
          <MetricDialog
            isOpen={showMetricDialog}
            onClose={() => setShowMetricDialog(false)}
            definingObjectiveId={doId}
            onSuccess={handleMetricSuccess}
          />
          <InitiativeDialog
            isOpen={showInitiativeDialog}
            onClose={() => setShowInitiativeDialog(false)}
            definingObjectiveId={doId}
            onSuccess={handleInitiativeSuccess}
          />
          {doDetails && (
            <CheckInDialog
              isOpen={showCheckInDialog}
              onClose={() => setShowCheckInDialog(false)}
              parentType="do"
              parentId={doDetails.id}
              parentName={doDetails.title}
              onSuccess={() => {
                setShowCheckInDialog(false);
                handleCheckInSuccess();
              }}
            />
          )}
        </>
      )}

      {/* Initiative Details Drawer */}
      <Sheet 
        open={!!selectedInitiative} 
        onOpenChange={(open) => {
          if (!open) {
            setSelectedInitiative(null);
            setSearchParams({});
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selectedInitiative && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="text-2xl font-bold">
                  {selectedInitiative.title}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-4">
                {/* Status */}
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                    Status
                  </label>
                  <Badge className={
                    selectedInitiative.status === 'not_started' ? 'bg-[#5B6E7A]' :
                    selectedInitiative.status === 'on_track' ? 'bg-green-500' :
                    selectedInitiative.status === 'at_risk' ? 'bg-yellow-500' :
                    selectedInitiative.status === 'off_track' ? 'bg-yellow-500' :
                    selectedInitiative.status === 'completed' ? 'bg-green-500' :
                    'bg-gray-500'
                  }>
                    {selectedInitiative.status?.replace('_', ' ').toUpperCase() || 'Not Started'}
                  </Badge>
                </div>

                {/* Description */}
                {selectedInitiative.description && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                      Description
                    </label>
                    <p className="text-sm whitespace-pre-wrap">
                      {selectedInitiative.description.replace(/<[^>]*>/g, '').trim()}
                    </p>
                  </div>
                )}

                {/* Owner */}
                {selectedInitiative.owner && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                      Owner
                    </label>
                    <div className="flex items-center gap-2">
                      <FancyAvatar
                        name={selectedInitiative.owner?.avatar_name || getFullNameForAvatar(
                          selectedInitiative.owner?.first_name,
                          selectedInitiative.owner?.last_name,
                          selectedInitiative.owner?.full_name
                        )}
                        displayName={getFullNameForAvatar(
                          selectedInitiative.owner?.first_name,
                          selectedInitiative.owner?.last_name,
                          selectedInitiative.owner?.full_name
                        )}
                        avatarUrl={selectedInitiative.owner?.avatar_url}
                        size="sm"
                      />
                      <span className="text-sm">
                        {getFullNameForAvatar(
                          selectedInitiative.owner?.first_name,
                          selectedInitiative.owner?.last_name,
                          selectedInitiative.owner?.full_name
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                    Timeline
                  </label>
                  {selectedInitiative.locked_at ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>
                        {selectedInitiative.start_date
                          ? parseLocalDate(selectedInitiative.start_date).toLocaleDateString()
                          : '—'}
                        {' - '}
                        {selectedInitiative.end_date
                          ? parseLocalDate(selectedInitiative.end_date).toLocaleDateString()
                          : '—'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label htmlFor="drawer-si-start" className="text-xs text-gray-500">
                            Start Date
                          </label>
                          <input
                            id="drawer-si-start"
                            type="date"
                            value={selectedInitiative.start_date || ''}
                            onChange={(e) => handleSIDateChange('start_date', e.target.value)}
                            className="w-full h-10 px-3 py-2 border rounded-md text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="drawer-si-end" className="text-xs text-gray-500">
                            End Date
                          </label>
                          <input
                            id="drawer-si-end"
                            type="date"
                            value={selectedInitiative.end_date || ''}
                            onChange={(e) => handleSIDateChange('end_date', e.target.value)}
                            className="w-full h-10 px-3 py-2 border rounded-md text-sm"
                          />
                        </div>
                      </div>
                      {siDateError && (
                        <p className="mt-2 text-sm text-red-600">{siDateError}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Primary Success Metric */}
                {selectedInitiative.primary_success_metric && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                      Primary Success Metric
                    </label>
                    <p className="text-sm">{selectedInitiative.primary_success_metric}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/rcdo/detail/si/${selectedInitiative.id}${cycleIdFromUrl ? `?cycle=${cycleIdFromUrl}` : ''}`)}
                    className="flex-1"
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

