import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare } from 'lucide-react';
import { useCheckins } from '@/hooks/useRCDO';
import { useTasks, useTasksBySI, useTaskDetails } from '@/hooks/useTasks';
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
import { supabase } from '@/integrations/supabase/client';
import { useActiveCycle } from '@/hooks/useRCDO';
import { DetailPageLayout } from '@/components/rcdo/DetailPageLayout';
import { DetailPageHeader } from '@/components/rcdo/DetailPageHeader';

// Dummy tasks for demonstration when no real tasks exist
const getDummyTasks = (siId: string | undefined) => [
  {
    id: 'dummy-1',
    title: 'Review current account coverage metrics',
    completion_criteria: 'Complete analysis of all enterprise accounts',
    status: 'in_progress',
    owner: { full_name: 'Sarah Johnson', avatar_name: 'SJ' },
    owner_user_id: 'dummy-owner-1',
    strategic_initiative_id: siId || '',
    start_date: new Date().toISOString().split('T')[0],
    target_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    created_by: 'dummy-owner-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    display_order: 0,
  },
  {
    id: 'dummy-2',
    title: 'Identify gaps in account management',
    completion_criteria: 'Document all accounts missing proper coverage',
    status: 'assigned',
    owner: { full_name: 'Mike Chen', avatar_name: 'MC' },
    owner_user_id: 'dummy-owner-2',
    strategic_initiative_id: siId || '',
    start_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    target_delivery_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    created_by: 'dummy-owner-2',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    display_order: 1,
  },
  {
    id: 'dummy-3',
    title: 'Develop account management playbook',
    completion_criteria: 'Create comprehensive guide for account managers',
    status: 'not_assigned',
    owner: { full_name: 'Alex Rivera', avatar_name: 'AR' },
    owner_user_id: 'dummy-owner-3',
    strategic_initiative_id: siId || '',
    start_date: null,
    target_delivery_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    created_by: 'dummy-owner-3',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    display_order: 2,
  },
  {
    id: 'dummy-4',
    title: 'Train team on new processes',
    completion_criteria: 'Conduct training sessions for all account managers',
    status: 'assigned',
    owner: { full_name: 'Emma Wilson', avatar_name: 'EW' },
    owner_user_id: 'dummy-owner-4',
    strategic_initiative_id: siId || '',
    start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    target_delivery_date: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    created_by: 'dummy-owner-4',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    display_order: 3,
  },
  {
    id: 'dummy-5',
    title: 'Measure and report on coverage improvements',
    completion_criteria: 'Track metrics and create quarterly report',
    status: 'not_assigned',
    owner: { full_name: 'David Kim', avatar_name: 'DK' },
    owner_user_id: 'dummy-owner-5',
    strategic_initiative_id: siId || '',
    start_date: null,
    target_delivery_date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    created_by: 'dummy-owner-5',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    display_order: 4,
  },
] as any[];

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
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Fetch SI details
  const [siDetails, setSiDetails] = useState<any>(null);
  const [siLoading, setSiLoading] = useState(true);

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
      } catch (err: any) {
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

  const handleTaskClickFromGantt = (task: any) => {
    // Open edit dialog when clicking task in Gantt
    handleEditTask(task.id);
  };

  const handleTaskDateUpdate = async (task: any, newStartDate: Date, newEndDate: Date) => {
    try {
      const { updateTask } = await import('@/hooks/useTasks');
      await updateTask(task.id, {
        start_date: newStartDate.toISOString().split('T')[0],
        target_delivery_date: newEndDate.toISOString().split('T')[0],
      });
      // Refetch to update both table and Gantt views
      refetchTasks();
    } catch (err: any) {
      console.error('Error updating task dates:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const { deleteTask } = await import('@/hooks/useTasks');
      await deleteTask(taskId);
      refetchTasks();
    } catch (err: any) {
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
    } catch (err: any) {
      console.error('Error completing task:', err);
    }
  };

  if (loading || !siDetails) {
    return (
      <DetailPageLayout
        rallyingCryId={siDetails?.defining_objective?.rallying_cry_id || ''}
        currentSIId={siId}
        currentDOId={siDetails?.defining_objective?.id}
        mobileNavOpen={mobileNavOpen}
        onMobileNavOpenChange={setMobileNavOpen}
        loading={true}
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
  
  const canEditTaskForItem = (task: any) => {
    return canEditTask(task.owner_user_id, siDetails.owner_user_id);
  };
  
  const canDeleteTaskForItem = (task: any) => {
    return canDeleteTask(task.owner_user_id, siDetails.owner_user_id);
  };

  const handleUnlock = async () => {
    if (!siDetails) return;
    try {
      const updates: any = { 
        locked_at: null, 
        locked_by: null,
        status: 'draft'
      };
      const { error } = await supabase
        .from('rc_strategic_initiatives')
        .update(updates)
        .eq('id', siDetails.id);
      if (error) throw error;
      // Refetch SI details
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
    } catch (e) {
      console.warn('Failed to unlock SI', e);
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
    ? new Date(cycle.start_date) 
    : (siDetails.start_date ? new Date(siDetails.start_date) : new Date(new Date().getFullYear(), 0, 1));
  const cycleEndDate = cycle 
    ? new Date(cycle.end_date) 
    : (siDetails.end_date ? new Date(siDetails.end_date) : new Date(new Date().getFullYear(), 11, 31));

  return (
    <DetailPageLayout
      rallyingCryId={siDetails.defining_objective?.rallying_cry_id || ''}
      currentSIId={siId}
      currentDOId={siDetails.defining_objective?.id}
      currentTaskId={taskIdFromUrl || undefined}
      mobileNavOpen={mobileNavOpen}
      onMobileNavOpenChange={setMobileNavOpen}
      loading={loading}
    >
      <DetailPageHeader
        title={siDetails.title}
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
                    {(tasks.length === 0 ? getDummyTasks(siId) : tasks).length === 0 ? (
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
                              Target Delivery Date
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(tasks.length === 0 ? getDummyTasks(siId) : tasks).map((task) => {
                            const isDummy = tasks.length === 0;
                            const taskOwnerName = getFullNameForAvatar(
                              task.owner?.first_name,
                              task.owner?.last_name,
                              task.owner?.full_name
                            );
                            const deliveryDate = task.target_delivery_date 
                              ? new Date(task.target_delivery_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                              : 'N/A';
                            
                            // Map status to display
                            const getStatusDisplay = (status: string) => {
                              switch (status) {
                                case 'not_assigned':
                                  return { text: 'Not Assigned', color: 'text-gray-600 dark:text-gray-400' };
                                case 'assigned':
                                  return { text: 'Assigned', color: 'text-blue-600 dark:text-blue-400' };
                                case 'in_progress':
                                  return { text: 'In Progress', color: 'text-yellow-600 dark:text-yellow-400' };
                                case 'completed':
                                  return { text: 'Completed', color: 'text-green-600 dark:text-green-400' };
                                case 'task_changed_canceled':
                                  return { text: 'Changed/Canceled', color: 'text-red-600 dark:text-red-400' };
                                case 'delayed':
                                  return { text: 'Delayed', color: 'text-orange-600 dark:text-orange-400' };
                                default:
                                  return { text: 'Unknown', color: 'text-gray-600 dark:text-gray-400' };
                              }
                            };
                            const statusDisplay = getStatusDisplay(task.status);

                            return (
                              <tr 
                                key={task.id}
                                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                                onClick={() => {
                                  if (isDummy) {
                                    setShowTaskDialog(true);
                                  } else {
                                    handleEditTask(task.id);
                                  }
                                }}
                              >
                                <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                                  <div className="font-medium">{task.title}</div>
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
                                    <span className="text-gray-600 dark:text-gray-400">N/A</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                                  {deliveryDate}
                                </td>
                                <td className="py-3 px-4 text-sm">
                                  <span className={statusDisplay.color}>{statusDisplay.text}</span>
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
                      tasks={tasks.length === 0 ? getDummyTasks(siId) : tasks}
                      cycleStartDate={cycleStartDate}
                      cycleEndDate={cycleEndDate}
                      // Timeline will auto-adjust to fit tasks
                      onTaskClick={(task) => {
                        if (tasks.length === 0) {
                          setShowTaskDialog(true);
                        } else {
                          handleTaskClickFromGantt(task);
                        }
                      }}
                      onTaskEdit={(task) => {
                        if (tasks.length === 0) {
                          setShowTaskDialog(true);
                        } else {
                          handleEditTask(task.id);
                        }
                      }}
                      onTaskDelete={tasks.length === 0 ? undefined : (task) => handleDeleteTask(task.id)}
                      onTaskComplete={tasks.length === 0 ? undefined : (task) => handleCompleteTask(task.id)}
                      onTaskDateUpdate={tasks.length === 0 ? undefined : handleTaskDateUpdate}
                      canEditTask={(task) => tasks.length === 0 ? true : canEditTaskForItem(task)}
                      canDeleteTask={(task) => tasks.length === 0 ? false : canDeleteTaskForItem(task)}
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
    </DetailPageLayout>
  );
}

