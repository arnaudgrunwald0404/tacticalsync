import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, ChevronRight } from 'lucide-react';
import { useCheckins } from '@/hooks/useRCDO';
import { useTasks, useTasksBySI, useTaskDetails } from '@/hooks/useTasks';
import type { TaskWithRelations } from '@/types/rcdo';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';
import { CheckinCard } from '@/components/rcdo/CheckinCard';
import { TaskRow } from '@/components/rcdo/TaskRow';
import { TaskDialog } from '@/components/rcdo/TaskDialog';
import { TaskGanttChart } from '@/components/rcdo/TaskGanttChart';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { parseLocalDate } from '@/lib/dateUtils';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCycle } from '@/hooks/useRCDO';
import { DetailPageLayout } from '@/components/rcdo/DetailPageLayout';
import { DetailPageHeader } from '@/components/rcdo/DetailPageHeader';


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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: 'start_date' | 'target_delivery_date' } | null>(null);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

  // Fetch SI details
  const [siDetails, setSiDetails] = useState<Record<string, unknown> | null>(null);
  const [siLoading, setSiLoading] = useState(true);

  // Preserve nav context across SI navigations to avoid sidebar remount
  const lastNavContext = useRef<{ rallyingCryId: string; doId: string }>({ rallyingCryId: '', doId: '' });
  if (siDetails?.defining_objective) {
    const rc = (siDetails.defining_objective as Record<string, unknown>).rallying_cry_id as string;
    const doId = (siDetails.defining_objective as Record<string, unknown>).id as string;
    if (rc) lastNavContext.current.rallyingCryId = rc;
    if (doId) lastNavContext.current.doId = doId;
  }

  // Fetch tasks
  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useTasksBySI(siId);
  
  // Fetch selected task details if taskId is in URL
  const { task: taskDetails, loading: taskDetailsLoading } = useTaskDetails(taskIdFromUrl || undefined);
  
  // Set active tab to tasks if taskId is in URL
  useEffect(() => {
    if (taskIdFromUrl) {
      setActiveTab('tasks');
      // Find the task in the tasks list
      const task = tasks.find(t => t.id === taskIdFromUrl);
      if (task) {
        setSelectedTask(task);
      }
    }
  }, [taskIdFromUrl, tasks]);
  
  // Update selected task when taskDetails loads
  useEffect(() => {
    if (taskDetails) {
      setSelectedTask(taskDetails);
    }
  }, [taskDetails]);

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
        .order('display_order', { ascending: true });
      const siIdx = (sis || []).findIndex(s => s.id === siId);
      const siNum = siIdx >= 0 ? siIdx + 1 : 1;
      setSiNumbering(`${doNum}.${siNum}`);
    };
    compute();
  }, [siDetails?.defining_objective, siId]);

  // Fetch check-ins
  const { checkins, loading: checkinsLoading, refetch: refetchCheckins } = useCheckins('initiative', siId);

  // Fetch cycle for Gantt chart
  const { cycle } = useActiveCycle();

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

  const handleInlineUpdate = async (taskId: string, field: string, value: string) => {
    try {
      const { updateTask } = await import('@/hooks/useTasks');
      await updateTask(taskId, { [field]: value });
      refetchTasks();
    } catch (err) {
      console.error('Error updating task:', err);
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
      <DetailPageLayout
        rallyingCryId={lastNavContext.current.rallyingCryId}
        currentSIId={siId}
        currentDOId={lastNavContext.current.doId}
        mobileNavOpen={mobileNavOpen}
        onMobileNavOpenChange={setMobileNavOpen}
      >
        <Skeleton className="h-12 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </DetailPageLayout>
    );
  }

  const isOwner = currentUserId === siDetails.owner_user_id;
  const isLocked = !!siDetails.locked_at;
  
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
  const cycleStartDate = cycle
    ? parseLocalDate(cycle.start_date)
    : (siDetails.start_date ? parseLocalDate(siDetails.start_date) : new Date(new Date().getFullYear(), 0, 1));
  const cycleEndDate = cycle
    ? parseLocalDate(cycle.end_date)
    : (siDetails.end_date ? parseLocalDate(siDetails.end_date) : new Date(new Date().getFullYear(), 11, 31));

  return (
    <DetailPageLayout
      rallyingCryId={siDetails.defining_objective?.rallying_cry_id || ''}
      cycleId={cycle?.id}
      currentSIId={siId}
      currentDOId={siDetails.defining_objective?.id}
      currentTaskId={taskIdFromUrl || undefined}
      mobileNavOpen={mobileNavOpen}
      onMobileNavOpenChange={setMobileNavOpen}
    >
      <DetailPageHeader
        title={siNumbering ? `${siNumbering} ${siDetails.title}` : siDetails.title}
        description={siDetails.description}
        owner={siDetails.owner}
        isLocked={isLocked}
        isOwner={isOwner}
        currentUserId={currentUserId}
        type="si"
        status={siDetails.status}
        onUnlock={handleUnlock}
        onCheckIn={() => setShowCheckInDialog(true)}
        canLock={canLockDO}
        canEdit={canEdit}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAddTask={() => setShowTaskDialog(true)}
        canCreateTask={!isLocked && canCreateTask}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tasksCount={tasks.length}
        checkinsCount={checkins.length}
        additionalContent={additionalContent}
      />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Tasks Tab */}
            <TabsContent value="tasks">
              <Card className="p-4 sm:p-6">

                {tasksLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : viewMode === 'table' ? (
                  <div className="overflow-x-auto">
                    {tasks.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400">
                        No tasks yet.
                      </p>
                    ) : (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                              Description
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                              Owner
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                              Start Date
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                              Target Delivery Date
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tasks.map((task) => {
                            const taskOwnerName = getFullNameForAvatar(
                              task.owner?.first_name,
                              task.owner?.last_name,
                              task.owner?.full_name
                            );
                            const startDate = task.start_date
                              ? parseLocalDate(task.start_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                              : '—';
                            const deliveryDate = task.target_delivery_date
                              ? parseLocalDate(task.target_delivery_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                              : '—';

                            const statusOptions: { value: string; label: string; color: string }[] = [
                              { value: 'not_assigned', label: 'Not Assigned', color: 'text-gray-600 dark:text-gray-400' },
                              { value: 'assigned', label: 'Assigned', color: 'text-[#4A5D5F]' },
                              { value: 'in_progress', label: 'In Progress', color: 'text-yellow-600 dark:text-yellow-400' },
                              { value: 'completed', label: 'Completed', color: 'text-green-600 dark:text-green-400' },
                              { value: 'delayed', label: 'Delayed', color: 'text-orange-600 dark:text-orange-400' },
                              { value: 'task_changed_canceled', label: 'Changed/Canceled', color: 'text-red-600 dark:text-red-400' },
                            ];
                            const currentStatus = statusOptions.find(s => s.value === task.status) || statusOptions[0];

                            return (
                              <tr
                                key={task.id}
                                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                              >
                                <td
                                  className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100 cursor-pointer group/desc"
                                  onClick={() => handleEditTask(task.id)}
                                >
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">{task.title}</span>
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/desc:opacity-100 transition-opacity flex-shrink-0" />
                                  </div>
                                  {task.completion_criteria && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                      {task.completion_criteria.replace(/<[^>]*>/g, '').trim()}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-sm">
                                  {task.owner ? (
                                    <div className="flex items-center gap-2">
                                      <FancyAvatar
                                        name={task.owner?.avatar_name || taskOwnerName}
                                        displayName={taskOwnerName}
                                        avatarUrl={task.owner?.avatar_url}
                                        size="sm"
                                      />
                                      <span className="text-gray-700 dark:text-gray-300">{taskOwnerName}</span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-600 dark:text-gray-400">—</span>
                                  )}
                                </td>
                                {/* Start Date - double-click to edit */}
                                <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                                  {editingCell?.taskId === task.id && editingCell.field === 'start_date' ? (
                                    <input
                                      type="date"
                                      defaultValue={task.start_date || ''}
                                      autoFocus
                                      className="border rounded px-2 py-1 text-sm w-[140px] bg-white dark:bg-gray-800"
                                      onBlur={(e) => {
                                        setEditingCell(null);
                                        if (e.target.value !== (task.start_date || '')) {
                                          handleInlineUpdate(task.id, 'start_date', e.target.value);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1"
                                      onDoubleClick={() => setEditingCell({ taskId: task.id, field: 'start_date' })}
                                    >
                                      {startDate}
                                    </span>
                                  )}
                                </td>
                                {/* Target Delivery Date - double-click to edit */}
                                <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                                  {editingCell?.taskId === task.id && editingCell.field === 'target_delivery_date' ? (
                                    <input
                                      type="date"
                                      defaultValue={task.target_delivery_date || ''}
                                      autoFocus
                                      className="border rounded px-2 py-1 text-sm w-[140px] bg-white dark:bg-gray-800"
                                      onBlur={(e) => {
                                        setEditingCell(null);
                                        if (e.target.value !== (task.target_delivery_date || '')) {
                                          handleInlineUpdate(task.id, 'target_delivery_date', e.target.value);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1"
                                      onDoubleClick={() => setEditingCell({ taskId: task.id, field: 'target_delivery_date' })}
                                    >
                                      {deliveryDate}
                                    </span>
                                  )}
                                </td>
                                {/* Status - click to cycle */}
                                <td className="py-3 px-4 text-sm relative">
                                  <div className="relative">
                                    <span
                                      className={`${currentStatus.color} cursor-pointer hover:underline`}
                                      onClick={() => setStatusMenuTaskId(statusMenuTaskId === task.id ? null : task.id)}
                                    >
                                      {currentStatus.label}
                                    </span>
                                    {statusMenuTaskId === task.id && (
                                      <>
                                        <div className="fixed inset-0 z-40" onClick={() => setStatusMenuTaskId(null)} />
                                        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border rounded-md shadow-lg py-1 min-w-[160px]">
                                          {statusOptions.map((opt) => (
                                            <button
                                              key={opt.value}
                                              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${opt.color} ${opt.value === task.status ? 'font-semibold bg-gray-50 dark:bg-gray-700/50' : ''}`}
                                              onClick={() => {
                                                setStatusMenuTaskId(null);
                                                if (opt.value !== task.status) {
                                                  handleInlineUpdate(task.id, 'status', opt.value);
                                                }
                                              }}
                                            >
                                              {opt.label}
                                            </button>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
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

            {/* Details Tab */}
            <TabsContent value="details">
              <Card className="p-6">
                <div className="space-y-6">
                  {/* Title */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Name
                    </h3>
                    {isLocked ? (
                      <p className="text-lg text-gray-900 dark:text-gray-100">
                        {siDetails.title as string}
                      </p>
                    ) : (
                      <input
                        type="text"
                        value={(siDetails.title as string) || ''}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('rc_strategic_initiatives')
                            .update({ title: e.target.value })
                            .eq('id', siDetails.id);
                          if (!error) {
                            await refetchSI();
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md text-lg"
                        disabled={!canEdit}
                      />
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Description
                    </h3>
                    {isLocked ? (
                      <p className="text-gray-700 dark:text-gray-300">
                        {(siDetails.description as string | null) || 'No description provided.'}
                      </p>
                    ) : (
                      <textarea
                        value={(siDetails.description as string | null) || ''}
                        onChange={async (e) => {
                          const next = e.target.value;
                          const { error } = await supabase
                            .from('rc_strategic_initiatives')
                            .update({ description: next || null })
                            .eq('id', siDetails.id);
                          if (!error) {
                            await refetchSI();
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md min-h-[100px]"
                        disabled={!canEdit}
                        placeholder="Describe what this initiative entails..."
                      />
                    )}
                  </div>

                  {/* Timeline */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Timeline
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="si-start-date" className="text-xs text-gray-500">
                          Start Date
                        </label>
                        {isLocked ? (
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {siDetails.start_date
                              ? new Date(siDetails.start_date as string).toLocaleDateString()
                              : '—'}
                          </p>
                        ) : (
                          <input
                            id="si-start-date"
                            type="date"
                            value={(siDetails.start_date as string | null) || ''}
                            onChange={(e) => handleDateChange('start_date', e.target.value)}
                            className="w-full h-11 px-3 py-2 border rounded-md text-base"
                            disabled={!canEdit}
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="si-end-date" className="text-xs text-gray-500">
                          End Date
                        </label>
                        {isLocked ? (
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {siDetails.end_date
                              ? new Date(siDetails.end_date as string).toLocaleDateString()
                              : '—'}
                          </p>
                        ) : (
                          <input
                            id="si-end-date"
                            type="date"
                            value={(siDetails.end_date as string | null) || ''}
                            onChange={(e) => handleDateChange('end_date', e.target.value)}
                            className="w-full h-11 px-3 py-2 border rounded-md text-base"
                            disabled={!canEdit}
                          />
                        )}
                      </div>
                    </div>
                    {dateError && (
                      <p className="mt-2 text-sm text-red-600">{dateError}</p>
                    )}
                  </div>
                </div>
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
    </DetailPageLayout>
  );
}

