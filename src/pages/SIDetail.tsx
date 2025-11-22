import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, MessageSquare, Table2, BarChart3, Lock, Unlock, MoreVertical } from 'lucide-react';
import { useStrategicInitiatives, useRCLinks, useCheckins } from '@/hooks/useRCDO';
import { useTasks, useTasksBySI } from '@/hooks/useTasks';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { InitiativeCard } from '@/components/rcdo/InitiativeCard';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';
import { CheckinCard } from '@/components/rcdo/CheckinCard';
import { TaskCard } from '@/components/rcdo/TaskCard';
import { TaskRow } from '@/components/rcdo/TaskRow';
import { TaskDialog } from '@/components/rcdo/TaskDialog';
import { TaskGanttChart } from '@/components/rcdo/TaskGanttChart';
import GridBackground from '@/components/ui/grid-background';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCycle } from '@/hooks/useRCDO';
import { UserProfileHeader } from '@/components/ui/user-profile-header';
import Logo from '@/components/Logo';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function SIDetail() {
  const { siId } = useParams<{ siId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('definition');
  const [viewMode, setViewMode] = useState<'table' | 'gantt'>('table');
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>();
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch SI details
  const [siDetails, setSiDetails] = useState<any>(null);
  const [siLoading, setSiLoading] = useState(true);

  // Fetch tasks
  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useTasksBySI(siId);

  // Fetch check-ins
  const { checkins, loading: checkinsLoading, refetch: refetchCheckins } = useCheckins('initiative', siId);

  // Fetch cycle for Gantt chart
  const { cycle } = useActiveCycle();

  // Permissions
  const { canEditInitiative } = useRCDOPermissions();

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
  };

  const handleCheckInSuccess = () => {
    refetchCheckins();
    setShowCheckInDialog(false);
  };

  const handleEditTask = (taskId: string) => {
    setEditingTaskId(taskId);
    setShowTaskDialog(true);
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
      <GridBackground>
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="container mx-auto px-4 py-8 max-w-7xl">
            <Skeleton className="h-12 w-full mb-8" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </GridBackground>
    );
  }

  const ownerName = getFullNameForAvatar(
    siDetails.owner?.first_name,
    siDetails.owner?.last_name,
    siDetails.owner?.full_name
  );

  const isOwner = currentUserId === siDetails.owner_user_id;
  const isLocked = !!siDetails.locked_at;
  const { canCreateTask, canEditTask, canDeleteTask, canLockDO } = useRCDOPermissions();
  
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

  // Get cycle dates for Gantt chart
  // If no cycle, use SI dates or default to current year
  const cycleStartDate = cycle 
    ? new Date(cycle.start_date) 
    : (siDetails.start_date ? new Date(siDetails.start_date) : new Date(new Date().getFullYear(), 0, 1));
  const cycleEndDate = cycle 
    ? new Date(cycle.end_date) 
    : (siDetails.end_date ? new Date(siDetails.end_date) : new Date(new Date().getFullYear(), 11, 31));

  return (
    <GridBackground>
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (siDetails.defining_objective?.id) {
                  navigate(`/dashboard/rcdo/do/${siDetails.defining_objective.id}`);
                } else {
                  navigate('/dashboard/rcdo');
                }
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          </div>
          <UserProfileHeader />
        </div>
      </header>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (siDetails.defining_objective?.id) {
                  navigate(`/dashboard/rcdo/do/${siDetails.defining_objective.id}`);
                } else {
                  navigate('/dashboard/rcdo');
                }
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to DO
            </Button>
            <div className="flex items-center gap-2">
              {isOwner && !isLocked && (
                <Button
                  variant="outline"
                  onClick={() => setShowCheckInDialog(true)}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Check-In
                </Button>
              )}
              {isLocked && canLockDO && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={async () => {
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
                      }}
                    >
                      <Unlock className="h-4 w-4 mr-2" />
                      Unlock
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* SI Header Card - Simplified when locked */}
          <Card className="p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {siDetails.title}
                  </h1>
                  {isLocked && (
                    <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="definition">
                Definition
              </TabsTrigger>
              <TabsTrigger value="checkins">
                Check-ins ({checkins.length})
              </TabsTrigger>
            </TabsList>

            {/* Definition Tab */}
            <TabsContent value="definition">
              <Card className="p-6">
                <div className="space-y-6">
                  {/* SI Name - Read-only when locked */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      SI Name
                    </h3>
                    {isLocked ? (
                      <p className="text-lg text-gray-900 dark:text-gray-100">
                        {siDetails.title}
                      </p>
                    ) : (
                      <input
                        type="text"
                        value={siDetails.title}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('rc_strategic_initiatives')
                            .update({ title: e.target.value })
                            .eq('id', siDetails.id);
                          if (!error) {
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
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md text-lg"
                        disabled={!canEdit}
                      />
                    )}
                  </div>

                  {/* Description - Read-only when locked */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Description
                    </h3>
                    {isLocked ? (
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {siDetails.description || 'No description provided.'}
                      </p>
                    ) : (
                      <textarea
                        value={siDetails.description || ''}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('rc_strategic_initiatives')
                            .update({ description: e.target.value })
                            .eq('id', siDetails.id);
                          if (!error) {
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
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md min-h-[100px]"
                        disabled={!canEdit}
                        placeholder="Enter description..."
                      />
                    )}
                  </div>

                  {/* Owner - Read-only when locked */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Owner
                    </h3>
                    <div className="flex items-center gap-2">
                      <FancyAvatar
                        name={siDetails.owner?.avatar_name || ownerName}
                        displayName={ownerName}
                        avatarUrl={siDetails.owner?.avatar_url}
                        size="sm"
                      />
                      <span className="text-sm">{ownerName}</span>
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
          </Tabs>
        </div>
      </div>

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
    </GridBackground>
  );
}

