import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare } from 'lucide-react';
import { useCheckins } from '@/hooks/useRCDO';
import { useTasks, useTasksBySI, useTaskDetails } from '@/hooks/useTasks';
import type { TaskWithRelations } from '@/types/rcdo';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { useToast } from '@/hooks/use-toast';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';
import { CheckinCard } from '@/components/rcdo/CheckinCard';
import { TaskDialog } from '@/components/rcdo/TaskDialog';
import { TaskGanttChart } from '@/components/rcdo/TaskGanttChart';
import { SITaskTable } from '@/components/rcdo/SITaskTable';
import { SISubTree } from '@/components/rcdo/SISubTree';
import { useSubSIs } from '@/hooks/useSubSIs';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { parseLocalDate } from '@/lib/dateUtils';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCycle } from '@/hooks/useRCDO';
import { DetailPageHeader, type DetailPageHeaderProps } from '@/components/rcdo/DetailPageHeader';
import { useRCDODetail } from '@/contexts/RCDODetailContext';


export default function SIDetail() {
  const { siId } = useParams<{ siId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const taskIdFromUrl = searchParams.get('task');
  const [activeTab, setActiveTab] = useState('tasks');
  const [viewMode, setViewMode] = useState<'table' | 'gantt'>('table');
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>();
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const { setNavState } = useRCDODetail();
  const { toast } = useToast();
  const [showSubSIConvertDialog, setShowSubSIConvertDialog] = useState(false);
  const [convertingMode, setConvertingMode] = useState(false);

  // Fetch SI details
  const [siDetails, setSiDetails] = useState<Record<string, unknown> | null>(null);
  const [siLoading, setSiLoading] = useState(true);

  // Profiles for owner picker
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name?: string | null; avatar_name?: string | null; avatar_url?: string | null }>>([]);
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, avatar_name, avatar_url')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => { if (!error && data) setProfiles(data); });
  }, []);

  // Publish nav state to the persistent layout
  useEffect(() => {
    // Immediately mark this SI as active so the sidebar reflects the new page right away
    setNavState({ currentSIId: siId, currentDOId: undefined, currentTaskId: taskIdFromUrl || undefined });
  }, [siId, taskIdFromUrl]);

  // Fetch cycle for Gantt chart — prefer URL param so draft cycles work
  const { cycle: activeCycle } = useActiveCycle();
  const cycleIdFromUrl = searchParams.get('cycle');

  // Derive cycle from SI's parent chain so it works even without ?cycle= param
  const [derivedCycleId, setDerivedCycleId] = useState<string | null>(null);
  const siRallyingCryId = (siDetails?.defining_objective as Record<string, unknown> | undefined)?.rallying_cry_id as string | undefined;
  useEffect(() => {
    if (cycleIdFromUrl || !siRallyingCryId) return;
    supabase.from('rc_rallying_cries').select('cycle_id').eq('id', siRallyingCryId).single()
      .then(({ data }) => { if (data) setDerivedCycleId(data.cycle_id); });
  }, [siRallyingCryId, cycleIdFromUrl]);
  const cycleId = cycleIdFromUrl || derivedCycleId || activeCycle?.id;

  useEffect(() => {
    const defObj = siDetails?.defining_objective as Record<string, unknown> | undefined;
    const doId = defObj?.id as string | undefined;
    const rcId = defObj?.rallying_cry_id as string | undefined;
    if (!rcId || !doId) return;
    setNavState({
      rallyingCryId: rcId,
      cycleId: cycleId || undefined,
      currentDOId: doId,
      currentSIId: siId,
      currentTaskId: taskIdFromUrl || undefined,
    });
  }, [siDetails, siId, taskIdFromUrl, cycleId]);

  // Fetch tasks
  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useTasksBySI(siId);

  // Fetch sub-SIs (used both for the Sub-initiatives tab content and to gate the
  // mode toggle on the Details tab — can't revert to direct tasks while sub-SIs exist)
  const { subSIs, loading: subSIsLoading, refetch: refetchSubSIs } = useSubSIs(siId);
  
  // Fetch selected task details if taskId is in URL
  const { task: taskDetails, loading: taskDetailsLoading } = useTaskDetails(taskIdFromUrl || undefined);
  
  // Set active tab to tasks if taskId is in URL
  useEffect(() => {
    if (!taskIdFromUrl) {
      // URL no longer carries ?task= — drop any stale selection so a previously
      // selected task can't leak into the header on the next render.
      setSelectedTask(null);
      return;
    }
    setActiveTab('tasks');
    // useTasksBySI returns only direct tasks of this SI, so a hit here is a
    // safe match. A miss may just mean the list hasn't loaded yet — the
    // taskDetails effect below handles the verified fallback.
    const task = tasks.find(t => t.id === taskIdFromUrl);
    if (task) {
      setSelectedTask(task);
    }
  }, [taskIdFromUrl, tasks]);

  // Update selected task when taskDetails loads — but only if the task actually
  // belongs to this SI. A stale `?task=` (e.g., the task was moved into a sub-SI
  // when this SI was converted to sub-SI mode, or the user landed via an old
  // link) must not render in this SI's header.
  useEffect(() => {
    if (!taskDetails) return;
    if ((taskDetails as { strategic_initiative_id?: string }).strategic_initiative_id === siId) {
      setSelectedTask(taskDetails);
    } else {
      setSelectedTask(null);
    }
  }, [taskDetails, siId]);

  // Compute numbering (e.g. "2.3") for this SI within the rallying cry
  const [siNumbering, setSiNumbering] = useState('');
  useEffect(() => {
    const compute = async () => {
      if (!siDetails?.defining_objective) { setSiNumbering(''); return; }
      const doObj = siDetails.defining_objective as { id: string; rallying_cry_id: string };
      const { data: dos } = await supabase
        .from('rc_defining_objectives')
        .select('id')
        .eq('rallying_cry_id', doObj.rallying_cry_id)
        .order('display_order', { ascending: true });
      const doIdx = (dos || []).findIndex(d => d.id === doObj.id);
      const doNum = doIdx >= 0 ? doIdx + 1 : 1;
      const { data: sis } = await supabase
        .from('rc_strategic_initiatives')
        .select('id')
        .eq('defining_objective_id', doObj.id)
        .is('parent_si_id', null)
        .order('display_order', { ascending: true });
      const siIdx = (sis || []).findIndex(s => s.id === siId);
      const siNum = siIdx >= 0 ? siIdx + 1 : 1;
      setSiNumbering(`${doNum}.${siNum}`);
    };
    compute();
  }, [siDetails?.defining_objective, siId]);

  // Fetch check-ins
  const { checkins, loading: checkinsLoading, refetch: refetchCheckins } = useCheckins('initiative', siId);

  // Permissions - must be called before any early returns
  const { canEditInitiative, canCreateTask, canEditTask, canDeleteTask, canLockDO } = useRCDOPermissions();

  useEffect(() => {
    const fetchSI = async () => {
      if (!siId) return;
      setSiLoading(true);
      try {
        const { data, error } = await supabase
          .from('rc_strategic_initiatives')
          .select(`
            *,
            owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name),
            defining_objective:rc_defining_objectives!defining_objective_id(
              id,
              title,
              rallying_cry_id
            )
          `)
          .eq('id', siId)
          .single();

        if (error) throw error;
        setSiDetails(data);
      } catch (err) {
        console.error('Error fetching SI:', err);
      } finally {
        setSiLoading(false);
      }
    };
    fetchSI();
  }, [siId]);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  // Real-time updates
  useRCDORealtime({
    siId,
    onTasksUpdate: refetchTasks,
    onCheckinsUpdate: refetchCheckins,
    onSubSIsUpdate: refetchSubSIs,
  });

  // Refetch SI details when needed
  useEffect(() => {
    if (siId) {
      supabase
        .from('rc_strategic_initiatives')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name),
          defining_objective:rc_defining_objectives!defining_objective_id(
            id,
            title,
            rallying_cry_id
          )
        `)
        .eq('id', siId)
        .single()
        .then(({ data }) => {
          if (data) setSiDetails(data);
        });
    }
  }, [siId]);

  const loading = siLoading || tasksLoading || checkinsLoading;

  const handleTaskSuccess = () => {
    refetchTasks();
    setShowTaskDialog(false);
    setEditingTaskId(undefined);
    // Clear selected task if it was deleted
    if (editingTaskId && !tasks.find(t => t.id === editingTaskId)) {
      setSelectedTask(null);
      setSearchParams({});
    }
  };

  const handleCheckInSuccess = () => {
    refetchCheckins();
    setShowCheckInDialog(false);
  };

  const handleEditTask = (taskId: string) => {
    setEditingTaskId(taskId);
    setShowTaskDialog(true);
  };
  
  const handleTaskClick = (taskId: string) => {
    setSearchParams({ task: taskId });
    setActiveTab('tasks');
  };

  const handleTaskClickFromGantt = (task: TaskWithRelations) => {
    // Open edit dialog when clicking task in Gantt
    handleEditTask(task.id);
  };

  const handleTaskDateUpdate = async (task: TaskWithRelations, newStartDate: Date, newEndDate: Date) => {
    try {
      const { updateTask } = await import('@/hooks/useTasks');
      await updateTask(task.id, {
        start_date: newStartDate.toISOString().split('T')[0],
        target_delivery_date: newEndDate.toISOString().split('T')[0],
      });
      // Refetch to update both table and Gantt views
      refetchTasks();
    } catch (err) {
      console.error('Error updating task dates:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const { deleteTask } = await import('@/hooks/useTasks');
      await deleteTask(taskId);
      refetchTasks();
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const { updateTask } = await import('@/hooks/useTasks');
      await updateTask(taskId, {
        status: 'completed',
        actual_delivery_date: new Date().toISOString().split('T')[0]
      });
      refetchTasks();
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  if (loading || !siDetails) {
    return (
      <>
        <Skeleton className="h-12 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </>
    );
  }

  const isOwner = currentUserId === siDetails.owner_user_id;
  const isLocked = !!siDetails.locked_at;
  const acceptsSubSis = !!siDetails.accepts_sub_sis;
  const isSubSI = !!siDetails.parent_si_id;
  
  const canEdit = canEditInitiative(
    siDetails.owner_user_id,
    siDetails.locked_at,
    siDetails.defining_objective?.owner_user_id,
    siDetails.created_by
  );
  
  const canEditTaskForItem = (task: TaskWithRelations) => {
    return canEditTask(task.owner_user_id, siDetails?.owner_user_id as string | undefined);
  };

  const canDeleteTaskForItem = (task: TaskWithRelations) => {
    return canDeleteTask(task.owner_user_id, siDetails?.owner_user_id as string | undefined);
  };

  const refetchSI = async () => {
    if (!siId) return;
    const { data } = await supabase
      .from('rc_strategic_initiatives')
      .select(`
        *,
        owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name),
        defining_objective:rc_defining_objectives!defining_objective_id(
          id,
          title,
          rallying_cry_id
        )
      `)
      .eq('id', siId)
      .single();
    if (data) setSiDetails(data);
  };

  const handleUnlock = async () => {
    if (!siDetails) return;
    try {
      const updates: Record<string, unknown> = {
        locked_at: null,
        locked_by: null,
        status: 'draft'
      };
      const { error } = await supabase
        .from('rc_strategic_initiatives')
        .update(updates)
        .eq('id', siDetails.id);
      if (error) throw error;
      await refetchSI();
    } catch (e) {
      console.warn('Failed to unlock SI', e);
    }
  };

  const handleLock = async () => {
    if (!siDetails) return;

    const missing: string[] = [];
    const descText = siDetails.description
      ? String(siDetails.description).replace(/<[^>]*>/g, '').trim()
      : '';
    if (!descText) missing.push('Description');
    if (!siDetails.start_date) missing.push('Start date');
    if (!siDetails.end_date) missing.push('End date');

    if (missing.length > 0) {
      toast({
        title: "Can't finalize yet",
        description: `Please fill in the following before locking:\n• ${missing.join('\n• ')}`,
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: Record<string, unknown> = {
        locked_at: new Date().toISOString(),
        locked_by: user?.id || null,
        status: 'final',
      };
      const { error } = await supabase
        .from('rc_strategic_initiatives')
        .update(updates)
        .eq('id', siDetails.id);
      if (error) throw error;
      await refetchSI();
    } catch (e) {
      console.warn('Failed to lock SI', e);
      toast({
        title: 'Failed to lock',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Switch this SI to "accepts sub-initiatives" mode. If direct tasks already exist,
  // a confirm dialog wraps them into a default sub-SI via the RPC (atomic). Otherwise
  // it's a simple flag flip.
  const handleToggleSubSiMode = async (nextEnabled: boolean) => {
    if (!siDetails) return;
    if (nextEnabled) {
      if (tasks.length > 0) {
        setShowSubSIConvertDialog(true);
        return;
      }
      await supabase
        .from('rc_strategic_initiatives')
        .update({ accepts_sub_sis: true })
        .eq('id', siDetails.id);
      await refetchSI();
      await refetchSubSIs();
    } else {
      if (subSIs.length > 0) {
        // Toggle is disabled in this case at the UI layer; defensive no-op here.
        return;
      }
      await supabase
        .from('rc_strategic_initiatives')
        .update({ accepts_sub_sis: false })
        .eq('id', siDetails.id);
      await refetchSI();
    }
  };

  const handleConfirmConvertToSubSI = async () => {
    if (!siDetails) return;
    try {
      setConvertingMode(true);
      const { error } = await supabase.rpc('rcdo_convert_si_to_sub_si_mode', {
        p_si_id: siDetails.id as string,
      });
      if (error) throw error;
      await refetchSI();
      await refetchTasks();
      await refetchSubSIs();
    } catch (e) {
      console.error('Failed to convert SI to sub-SI mode', e);
    } finally {
      setConvertingMode(false);
      setShowSubSIConvertDialog(false);
    }
  };

  const handleDateChange = async (field: 'start_date' | 'end_date', value: string) => {
    if (!siDetails) return;
    const currentStart = (siDetails.start_date as string | null) || '';
    const currentEnd = (siDetails.end_date as string | null) || '';
    const nextStart = field === 'start_date' ? value : currentStart;
    const nextEnd = field === 'end_date' ? value : currentEnd;

    if (nextStart && nextEnd && nextEnd < nextStart) {
      setDateError('End date must be on or after start date.');
      return;
    }
    setDateError(null);

    const { error } = await supabase
      .from('rc_strategic_initiatives')
      .update({ [field]: value || null })
      .eq('id', siDetails.id);
    if (!error) {
      await refetchSI();
    }
  };

  // Additional content for selected task
  const additionalContent = selectedTask ? (
    <>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {selectedTask.title}
      </h2>
      {selectedTask.completion_criteria && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {selectedTask.completion_criteria.replace(/<[^>]*>/g, '').trim()}
        </p>
      )}
      {selectedTask.owner && (
        <div className="flex items-center gap-2 text-sm">
          <FancyAvatar
            name={selectedTask.owner?.avatar_name || getFullNameForAvatar(
              selectedTask.owner?.first_name,
              selectedTask.owner?.last_name,
              selectedTask.owner?.full_name
            )}
            displayName={getFullNameForAvatar(
              selectedTask.owner?.first_name,
              selectedTask.owner?.last_name,
              selectedTask.owner?.full_name
            )}
            avatarUrl={selectedTask.owner?.avatar_url}
            size="sm"
          />
          <span className="text-gray-700 dark:text-gray-300">
            {getFullNameForAvatar(
              selectedTask.owner?.first_name,
              selectedTask.owner?.last_name,
              selectedTask.owner?.full_name
            )}
          </span>
        </div>
      )}
    </>
  ) : undefined;

  // Get cycle dates for Gantt chart
  const cycleStartDate = activeCycle
    ? parseLocalDate(activeCycle.start_date)
    : (siDetails.start_date ? parseLocalDate(siDetails.start_date) : new Date(new Date().getFullYear(), 0, 1));
  const cycleEndDate = activeCycle
    ? parseLocalDate(activeCycle.end_date)
    : (siDetails.end_date ? parseLocalDate(siDetails.end_date) : new Date(new Date().getFullYear(), 11, 31));

  return (
    <>
      <DetailPageHeader
        title={siNumbering ? `${siNumbering} ${siDetails.title}` : siDetails.title as string}
        editableTitle={siDetails.title as string}
        description={siDetails.description as string | null}
        owner={siDetails.owner as DetailPageHeaderProps['owner']}
        isLocked={isLocked}
        isOwner={isOwner}
        currentUserId={currentUserId}
        type="si"
        status={siDetails.status as string}
        onLock={handleLock}
        onUnlock={handleUnlock}
        onCheckIn={() => setShowCheckInDialog(true)}
        canLock={canLockDO}
        canEdit={canEdit}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAddTask={() => setShowTaskDialog(true)}
        canCreateTask={!isLocked && canCreateTask && !acceptsSubSis}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tasksCount={tasks.length}
        checkinsCount={checkins.length}
        acceptsSubSis={acceptsSubSis}
        subSiCount={subSIs.length}
        additionalContent={additionalContent}
        onTitleChange={async (val) => {
          await supabase.from('rc_strategic_initiatives').update({ title: val }).eq('id', siDetails.id);
          await refetchSI();
        }}
        onDescriptionChange={async (val) => {
          await supabase.from('rc_strategic_initiatives').update({ description: val || null }).eq('id', siDetails.id);
          await refetchSI();
        }}
        onOwnerChange={async (val) => {
          await supabase.from('rc_strategic_initiatives').update({ owner_user_id: val }).eq('id', siDetails.id);
          await refetchSI();
        }}
        profiles={profiles}
        startDate={siDetails.start_date as string | null}
        endDate={siDetails.end_date as string | null}
        onStartDateChange={async (val) => handleDateChange('start_date', val)}
        onEndDateChange={async (val) => handleDateChange('end_date', val)}
        dateError={dateError}
        onBreakIntoSubSIs={!isSubSI && !acceptsSubSis ? () => handleToggleSubSiMode(true) : undefined}
      />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Tasks / Sub-initiatives Tab */}
            <TabsContent value="tasks">
              <Card className="p-4 sm:p-6">
                {acceptsSubSis ? (
                  <SISubTree
                    parentSiId={siDetails.id as string}
                    parentNumbering={siNumbering || ''}
                    parentDefiningObjectiveId={siDetails.defining_objective_id as string}
                    onEditTask={handleEditTask}
                    focusTaskId={taskIdFromUrl}
                  />
                ) : viewMode === 'table' ? (
                  <FlatTaskTable
                    siId={siDetails.id as string}
                    tasks={tasks}
                    loading={tasksLoading}
                    onEditTask={handleEditTask}
                    onRefetch={refetchTasks}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <TaskGanttChart
                      tasks={tasks}
                      cycleStartDate={cycleStartDate}
                      cycleEndDate={cycleEndDate}
                      onTaskClick={(task) => handleTaskClickFromGantt(task)}
                      onTaskEdit={(task) => handleEditTask(task.id)}
                      onTaskDelete={(task) => handleDeleteTask(task.id)}
                      onTaskComplete={(task) => handleCompleteTask(task.id)}
                      onTaskDateUpdate={handleTaskDateUpdate}
                      canEditTask={(task) => canEditTaskForItem(task)}
                      canDeleteTask={(task) => canDeleteTaskForItem(task)}
                    />
                  </div>
                )}
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

          </Tabs>

      {/* Dialogs */}
      {siId && (
        <>
          <TaskDialog
            isOpen={showTaskDialog}
            onClose={() => {
              setShowTaskDialog(false);
              setEditingTaskId(undefined);
            }}
            strategicInitiativeId={siId}
            taskId={editingTaskId}
            onSuccess={handleTaskSuccess}
          />
          {siDetails && (
            <CheckInDialog
              isOpen={showCheckInDialog}
              onClose={() => setShowCheckInDialog(false)}
              parentType="initiative"
              parentId={siDetails.id}
              parentName={siDetails.title}
              onSuccess={handleCheckInSuccess}
            />
          )}
        </>
      )}

      <AlertDialog open={showSubSIConvertDialog} onOpenChange={setShowSubSIConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert tasks into a sub-initiative?</AlertDialogTitle>
            <AlertDialogDescription>
              This initiative currently has {tasks.length} task{tasks.length === 1 ? '' : 's'}.
              We'll create a default sub-initiative called "Sub-initiative 1" and move every
              existing task into it. You can rename the sub-initiative afterwards, or add more.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertingMode}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmConvertToSubSI} disabled={convertingMode}>
              {convertingMode ? 'Converting…' : 'Convert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Flat-mode wrapper: the sub-SI tree owns its DndContext, but the flat task
// table on a plain SI page needs its own so intra-SI reordering works without
// dragging across containers. The 5px activation distance matches SISubTree —
// keeps click-to-edit and inline date editors responsive while still picking
// up real drag gestures.
function FlatTaskTable({
  siId,
  tasks,
  loading,
  onEditTask,
  onRefetch,
}: {
  siId: string;
  tasks: TaskWithRelations[];
  loading: boolean;
  onEditTask: (taskId: string) => void;
  onRefetch: () => void | Promise<void>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const taskIds = tasks.map((t) => t.id);

  const reorderTasks = async (orderedIds: string[]) => {
    const results = await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('rc_tasks').update({ display_order: idx }).eq('id', id),
      ),
    );
    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      console.error('Failed to persist some task display_order updates', failures.map((f) => f.error));
    }
    await onRefetch();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = taskIds.indexOf(String(active.id));
    const newIndex = taskIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    await reorderTasks(arrayMove(taskIds, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SITaskTable
        tasks={tasks}
        loading={loading}
        onEditTask={onEditTask}
        onRefetch={onRefetch}
        draggableContainerId={siId}
        onReorderTasks={reorderTasks}
      />
    </DndContext>
  );
}

