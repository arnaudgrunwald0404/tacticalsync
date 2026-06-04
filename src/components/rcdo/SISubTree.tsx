import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { supabase } from '@/integrations/supabase/client';
import { useSubSIs } from '@/hooks/useSubSIs';
import { useTasksBySI } from '@/hooks/useTasks';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { useToast } from '@/hooks/use-toast';
import { parseLocalDate } from '@/lib/dateUtils';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { cn } from '@/lib/utils';
import { SITaskTable } from './SITaskTable';
import type { StrategicInitiativeWithRelations } from '@/types/rcdo';

interface OwnerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  avatar_name: string | null;
}

interface SISubTreeProps {
  parentSiId: string;
  parentNumbering: string;
  parentDefiningObjectiveId: string;
  onEditTask: (taskId: string) => void;
  focusTaskId?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'draft', label: 'Draft' },
];

export function SISubTree({
  parentSiId,
  parentNumbering,
  parentDefiningObjectiveId,
  onEditTask,
  focusTaskId,
}: SISubTreeProps) {
  const { subSIs, loading, refetch, createSubSI } = useSubSIs(parentSiId);
  const [creating, setCreating] = useState(false);
  const [profiles, setProfiles] = useState<OwnerProfile[]>([]);
  const { toast } = useToast();

  // Each SubSIRow registers its refetch + current task ids + reorder fn here on
  // mount. After a successful cross-container task move, we call both the
  // source's and the destination's refetch — the destination would also catch
  // the change via realtime (NEW.strategic_initiative_id matches its filter)
  // but the source wouldn't (the filter is keyed on the new value, not the
  // old), so the explicit call is the source-side safety net. The task-ids
  // snapshot + reorder fn power intra-container drag-and-drop reordering from
  // the outer DndContext.
  type ContainerState = {
    refetch: () => void | Promise<void>;
    taskIds: string[];
    reorder: (orderedIds: string[]) => void | Promise<void>;
  };
  const containerStateRef = useRef<Map<string, ContainerState>>(new Map());
  const registerContainer = useCallback((containerId: string, state: ContainerState) => {
    containerStateRef.current.set(containerId, state);
    return () => {
      // Guard against accidentally clobbering a newer registration if the SubSIRow
      // unmounts after a fresh one already registered under the same id.
      if (containerStateRef.current.get(containerId) === state) {
        containerStateRef.current.delete(containerId);
      }
    };
  }, []);

  // 5px activation distance keeps click handlers (status menu, date editors, kebab)
  // responsive: nothing starts a drag until the pointer moves at least 5px.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Shared by drag-and-drop and the kebab/bulk "Move to sub-initiative…" actions.
  // All entry points issue a single batched UPDATE (using .in() for the ids) so
  // multi-row moves are one round-trip, and the dual-refetch pattern keeps the
  // source side from showing stale rows while realtime catches up.
  const moveTasksBetweenSubSIs = useCallback(async (taskIds: string[], sourceSiId: string, destSiId: string) => {
    if (sourceSiId === destSiId || taskIds.length === 0) return;
    const { error } = await supabase
      .from('rc_tasks')
      .update({ strategic_initiative_id: destSiId })
      .in('id', taskIds);

    if (error) {
      toast({
        title: 'Move failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    await Promise.all([
      containerStateRef.current.get(sourceSiId)?.refetch(),
      containerStateRef.current.get(destSiId)?.refetch(),
    ]);
  }, [toast]);

  // Persist a new sub-SI order — same shape as task reorder below (parallel
  // per-row updates). Declared before handleDragEnd because handleDragEnd's
  // useCallback deps array eagerly reads `reorderSubSIs` — a forward reference
  // would hit the temporal dead zone.
  const reorderSubSIs = useCallback(async (orderedIds: string[]) => {
    const results = await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('rc_strategic_initiatives').update({ display_order: idx }).eq('id', id),
      ),
    );
    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      console.error('Failed to persist some sub-SI display_order updates', failures.map((f) => f.error));
    }
    await refetch();
  }, [refetch]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Sub-SI reorder takes precedence: both active and over are tagged with
    // kind='subsi' via useSortable.data, so we can route this kind of drag
    // without colliding with the task drag paths below.
    const activeKind = active.data.current?.kind as string | undefined;
    const overKind = over.data.current?.kind as string | undefined;
    if (activeKind === 'subsi' && overKind === 'subsi' && active.id !== over.id) {
      // subSIs is the canonical ordered list — read indices off it, not off a
      // copy snapshot, so concurrent realtime inserts don't corrupt the move.
      const ids = subSIs.map((s) => s.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      await reorderSubSIs(arrayMove(ids, oldIndex, newIndex));
      return;
    }

    const sourceSiId = active.data.current?.sourceSiId as string | undefined;
    if (!sourceSiId) return;

    // Three drop targets land here, and the `data` payload tells them apart:
    //   - dropzone (sub-SI body)  → over.data.destSiId set
    //   - sortable task row       → over.data.sourceSiId set (its container)
    const overDestSiId = over.data.current?.destSiId as string | undefined;
    const overSourceSiId = over.data.current?.sourceSiId as string | undefined;

    if (overDestSiId) {
      // Drop on a container body (typically the empty-list hint). Same-container
      // drops are no-ops — moveTasksBetweenSubSIs early-returns when src === dest.
      await moveTasksBetweenSubSIs([String(active.id)], sourceSiId, overDestSiId);
      return;
    }

    if (overSourceSiId) {
      if (overSourceSiId === sourceSiId) {
        // Intra-container reorder: arrayMove inside the source's task list and
        // persist the new display_order via the container's reorder handler.
        const container = containerStateRef.current.get(sourceSiId);
        if (!container) return;
        const oldIndex = container.taskIds.indexOf(String(active.id));
        const newIndex = container.taskIds.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
        const reordered = arrayMove(container.taskIds, oldIndex, newIndex);
        await container.reorder(reordered);
        return;
      }
      // Cross-container move via a task target — for now treat the row as a
      // generic "into this container" signal (no insertion-position handling).
      await moveTasksBetweenSubSIs([String(active.id)], sourceSiId, overSourceSiId);
    }
  }, [moveTasksBetweenSubSIs, subSIs, reorderSubSIs]);

  // Profiles power the owner Select in each expanded sub-SI. Fetch once at the tree
  // level rather than per row so a sub-SI with five rows doesn't run five identical
  // queries.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, avatar_url, avatar_name')
      .order('first_name', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setProfiles((data || []) as OwnerProfile[]);
      });
    return () => { cancelled = true; };
  }, []);

  const handleAdd = useCallback(async () => {
    setCreating(true);
    const nextIdx = subSIs.length + 1;
    await createSubSI(parentDefiningObjectiveId, `Sub-initiative ${nextIdx}`);
    setCreating(false);
  }, [subSIs.length, parentDefiningObjectiveId, createSubSI]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {subSIs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-gray-600 dark:text-gray-400">
            No sub-initiatives yet. Add one below to start organizing tasks.
          </Card>
        ) : (
          <SortableContext items={subSIs.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {subSIs.map((subSI, idx) => (
              <SubSIRow
                key={subSI.id}
                subSI={subSI}
                numbering={`${parentNumbering}.${idx + 1}`}
                onEditTask={onEditTask}
                onChanged={refetch}
                startExpanded={focusTaskId == null}
                profiles={profiles}
                onPromoted={refetch}
                registerContainer={registerContainer}
                moveTargets={subSIs
                  .filter((s) => s.id !== subSI.id)
                  .map((s) => ({ id: s.id, title: s.title }))}
                onMoveTasksToSubSI={(taskIds, destSiId) =>
                  moveTasksBetweenSubSIs(taskIds, subSI.id, destSiId)
                }
              />
            ))}
          </SortableContext>
        )}

        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={creating}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Adding…' : 'Add sub-initiative'}
          </Button>
        </div>
      </div>
    </DndContext>
  );
}

interface SubSIRowProps {
  subSI: StrategicInitiativeWithRelations;
  numbering: string;
  onEditTask: (taskId: string) => void;
  onChanged: () => void;
  startExpanded?: boolean;
  profiles: OwnerProfile[];
}

interface SubSIRowProps2 extends SubSIRowProps {
  // Bubble up after a promotion so the parent SISubTree refetches its sub-SI list and
  // the newly-created sibling appears below this row.
  onPromoted: () => void;
  // Hand the parent a way to call this row's task refetch (after a cross-container
  // drag-and-drop) and a reorder fn (for intra-container drag-and-drop). The
  // returned cleanup deregisters on unmount. Passing the *current* task ids on
  // every registration is what makes intra-container arrayMove() correct — the
  // parent reads the latest snapshot at drop time, not a stale one.
  registerContainer: (
    containerId: string,
    state: {
      refetch: () => void | Promise<void>;
      taskIds: string[];
      reorder: (orderedIds: string[]) => void | Promise<void>;
    },
  ) => () => void;
  // Sibling sub-SIs (already excludes this row) — surfaced in the kebab as
  // "Move to sub-initiative…" choices and powering the bulk-move bar.
  moveTargets: Array<{ id: string; title: string }>;
  onMoveTasksToSubSI: (taskIds: string[], destSiId: string) => void | Promise<void>;
}

function SubSIRow({ subSI, numbering, onEditTask, onChanged, startExpanded = true, profiles, onPromoted, registerContainer, moveTargets, onMoveTasksToSubSI }: SubSIRowProps2) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(subSI.title);
  const [editingField, setEditingField] = useState<'start_date' | 'end_date' | 'status' | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string>((subSI.description as string | null) || '');

  // useSortable powers sub-SI reordering. The `kind: 'subsi'` discriminator
  // tells SISubTree's handleDragEnd to route this drag to the sub-SI reorder
  // path instead of the task paths, even though the active id is also a UUID.
  const {
    setNodeRef: setSortNodeRef,
    attributes: sortAttributes,
    listeners: sortListeners,
    transform: sortTransform,
    transition: sortTransition,
    isDragging: sortIsDragging,
  } = useSortable({
    id: subSI.id,
    data: { kind: 'subsi' },
    disabled: !!subSI.locked_at,
  });
  const sortStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(sortTransform),
    transition: sortTransition,
    opacity: sortIsDragging ? 0.4 : 1,
    zIndex: sortIsDragging ? 20 : undefined,
    position: 'relative',
  };

  // The parent's refetch supplies a fresh `subSI.description`. Keep the local draft in
  // sync when that prop changes (e.g., realtime update from another user) so the
  // textarea doesn't show stale text.
  useEffect(() => {
    setDescriptionDraft((subSI.description as string | null) || '');
  }, [subSI.description]);

  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useTasksBySI(subSI.id);
  const isLocked = !!subSI.locked_at;

  // Without this, sub-SI task edits made elsewhere (another tab, another user) never
  // reach this row — useTasksBySI only fetches on mount. Reusing useRCDORealtime with
  // siId=subSI.id wires the same `rc_tasks` channel the top-level SI page uses, but
  // scoped to this sub-SI.
  useRCDORealtime({
    siId: subSI.id,
    onTasksUpdate: refetchTasks,
  });

  // Persist a new task order by updating display_order on each affected row.
  // N parallel updates is fine for the realistic task-count (≤ ~20 per sub-SI);
  // a single CASE-WHEN UPDATE via .rpc would be tidier but isn't worth a new
  // migration yet.
  const reorderTasks = useCallback(async (orderedIds: string[]) => {
    const results = await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('rc_tasks').update({ display_order: idx }).eq('id', id),
      ),
    );
    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      console.error('Failed to persist some task display_order updates', failures.map((f) => f.error));
    }
    await refetchTasks();
  }, [refetchTasks]);

  // Register with the parent so the outer DndContext can resolve refetch (after
  // cross-container moves) and reorder (after intra-container drags). Re-runs
  // when tasks change so containerStateRef always holds the latest snapshot.
  useEffect(() => {
    return registerContainer(subSI.id, {
      refetch: refetchTasks,
      taskIds: tasks.map((t) => t.id),
      reorder: reorderTasks,
    });
  }, [subSI.id, tasks, refetchTasks, reorderTasks, registerContainer]);

  // Drop zone for tasks dragged from other sub-SIs. `active` is non-null while a drag
  // is in progress; we highlight only when the drag started from a *different*
  // container, so dragging a task over its own table doesn't flash a target hint.
  const { isOver, setNodeRef: setDropRef, active } = useDroppable({
    id: `dropzone-${subSI.id}`,
    data: { destSiId: subSI.id },
  });
  const draggingFromElsewhere = !!active && active.data.current?.sourceSiId && active.data.current.sourceSiId !== subSI.id;
  const showDropHint = isOver && draggingFromElsewhere;

  const saveTitle = async () => {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== subSI.title) {
      await supabase
        .from('rc_strategic_initiatives')
        .update({ title: titleDraft.trim() })
        .eq('id', subSI.id);
      onChanged();
    } else {
      setTitleDraft(subSI.title);
    }
  };

  const updateField = async (field: 'start_date' | 'end_date' | 'status', value: string | null) => {
    await supabase
      .from('rc_strategic_initiatives')
      .update({ [field]: value })
      .eq('id', subSI.id);
    setEditingField(null);
    onChanged();
  };

  const ownerName = subSI.owner
    ? getFullNameForAvatar(subSI.owner.first_name, subSI.owner.last_name, subSI.owner.full_name)
    : null;

  return (
    <Card ref={setSortNodeRef} style={sortStyle} className={cn('overflow-hidden', sortIsDragging && 'shadow-xl')}>
      <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        {/* Drag handle: only this element listens for the gesture, so clicking
            anywhere else on the header (expand chevron, title, dates) doesn't
            accidentally start a row drag. Disabled when the sub-SI is locked. */}
        <button
          type="button"
          aria-label={isLocked ? 'Sub-initiative locked' : 'Drag to reorder'}
          disabled={isLocked}
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing touch-none disabled:opacity-40 disabled:cursor-not-allowed"
          {...sortAttributes}
          {...sortListeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <span className="text-sm font-mono text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">
          {numbering}
        </span>

        {editingTitle && !isLocked ? (
          <input
            type="text"
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setTitleDraft(subSI.title); setEditingTitle(false); }
            }}
            className="flex-1 px-2 py-1 text-sm font-semibold border rounded bg-white dark:bg-gray-900"
          />
        ) : (
          <button
            type="button"
            onClick={() => !isLocked && setEditingTitle(true)}
            className="flex-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 hover:underline disabled:no-underline disabled:cursor-not-allowed"
            disabled={isLocked}
          >
            {subSI.title}
          </button>
        )}

        {/* Owner */}
        {ownerName && (
          <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
            <FancyAvatar
              name={subSI.owner?.avatar_name || ownerName}
              displayName={ownerName}
              avatarUrl={subSI.owner?.avatar_url}
              size="sm"
            />
            <span>{ownerName}</span>
          </div>
        )}

        {/* Start date */}
        <span className="text-xs text-gray-600 dark:text-gray-400 w-20 text-right">
          {editingField === 'start_date' && !isLocked ? (
            <input
              type="date"
              defaultValue={subSI.start_date || ''}
              autoFocus
              className="border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-900 w-full"
              onBlur={(e) => updateField('start_date', e.target.value || null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => !isLocked && setEditingField('start_date')}
              className="hover:underline disabled:no-underline disabled:cursor-not-allowed"
              disabled={isLocked}
            >
              {subSI.start_date
                ? parseLocalDate(subSI.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Start —'}
            </button>
          )}
        </span>

        {/* End date */}
        <span className="text-xs text-gray-600 dark:text-gray-400 w-20 text-right">
          {editingField === 'end_date' && !isLocked ? (
            <input
              type="date"
              defaultValue={subSI.end_date || ''}
              autoFocus
              className="border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-900 w-full"
              onBlur={(e) => updateField('end_date', e.target.value || null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => !isLocked && setEditingField('end_date')}
              className="hover:underline disabled:no-underline disabled:cursor-not-allowed"
              disabled={isLocked}
            >
              {subSI.end_date
                ? parseLocalDate(subSI.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'End —'}
            </button>
          )}
        </span>

        {/* Status */}
        <span className="w-24 text-right">
          {editingField === 'status' && !isLocked ? (
            <select
              defaultValue={subSI.status || 'not_started'}
              autoFocus
              onBlur={() => setEditingField(null)}
              onChange={(e) => updateField('status', e.target.value)}
              className="border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-900 w-full"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => !isLocked && setEditingField('status')}
              className="text-xs text-gray-700 dark:text-gray-300 hover:underline disabled:no-underline disabled:cursor-not-allowed"
              disabled={isLocked}
            >
              {STATUS_OPTIONS.find(o => o.value === subSI.status)?.label || subSI.status || '—'}
            </button>
          )}
        </span>
      </div>

      {expanded && (
        <div
          ref={setDropRef}
          className={cn(
            'pl-10 pr-3 py-3 space-y-4 transition-colors',
            showDropHint && 'bg-blue-50 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-400'
          )}
        >
          {/* Description + owner editors. Save-on-blur for description so we don't
              hit Supabase on every keystroke; the owner Select persists immediately on
              change. RLS gates writes — UI shows fields enabled and trusts the toast
              for failures, matching the rest of the SI surface. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Description
              </label>
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={async () => {
                  const next = descriptionDraft.trim() ? descriptionDraft : null;
                  const current = (subSI.description as string | null) || null;
                  if (next === current) return;
                  await supabase
                    .from('rc_strategic_initiatives')
                    .update({ description: next })
                    .eq('id', subSI.id);
                  onChanged();
                }}
                disabled={isLocked}
                placeholder="Describe what this sub-initiative covers..."
                className="w-full px-2 py-1 text-sm border rounded-md min-h-[64px] bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Owner
              </label>
              <Select
                value={(subSI.owner_user_id as string | null) || ''}
                disabled={isLocked}
                onValueChange={async (val) => {
                  await supabase
                    .from('rc_strategic_initiatives')
                    .update({ owner_user_id: val || null })
                    .eq('id', subSI.id);
                  onChanged();
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.length === 0 ? (
                    <div className="py-2 px-2 text-sm text-muted-foreground text-center">
                      No profiles available
                    </div>
                  ) : (
                    profiles.map((p) => {
                      const displayName = getFullNameForAvatar(p.first_name, p.last_name, p.full_name) || 'Unknown';
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="inline-flex items-center gap-2">
                            <FancyAvatar
                              name={p.avatar_name || displayName}
                              displayName={displayName}
                              avatarUrl={p.avatar_url}
                              size="sm"
                            />
                            <span>{displayName}</span>
                          </span>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SITaskTable
            tasks={tasks}
            loading={tasksLoading}
            onEditTask={onEditTask}
            onRefetch={refetchTasks}
            emptyMessage="No tasks under this sub-initiative yet."
            draggableContainerId={subSI.id}
            moveTargets={moveTargets}
            onMoveTasksToSubSI={onMoveTasksToSubSI}
            onReorderTasks={reorderTasks}
            onDeleteTasks={async (taskIds) => {
              // Single batched DELETE — same shape as the bulk move handler.
              const { error } = await supabase
                .from('rc_tasks')
                .delete()
                .in('id', taskIds);
              if (error) {
                console.error('Failed to bulk-delete tasks', error);
                return;
              }
              await refetchTasks();
            }}
            onPromoteTask={async (taskId) => {
              // RPC creates a peer sub-SI and deletes the task atomically. Refetch
              // both: tasks (this row loses one) and sub-SIs (parent gains one).
              const { error } = await supabase.rpc('rcdo_promote_task_to_sub_si', {
                p_task_id: taskId,
              });
              if (error) {
                console.error('Failed to promote task to sub-initiative', error);
                return;
              }
              await refetchTasks();
              onPromoted();
            }}
            onPromoteTasks={async (taskIds) => {
              // Loop the per-task RPC in parallel — each call is atomic on its own,
              // so a partial failure leaves the DB in a sane state (some tasks
              // promoted, others not). Refetch unconditionally so the UI reflects
              // whatever did land.
              const results = await Promise.all(
                taskIds.map((id) =>
                  supabase.rpc('rcdo_promote_task_to_sub_si', { p_task_id: id })
                )
              );
              const failures = results.filter((r) => r.error);
              if (failures.length > 0) {
                console.error('Failed to promote some tasks to sub-initiatives', failures.map((f) => f.error));
              }
              await refetchTasks();
              onPromoted();
            }}
          />
        </div>
      )}
    </Card>
  );
}
