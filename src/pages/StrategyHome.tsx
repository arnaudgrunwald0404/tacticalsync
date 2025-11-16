import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Layers, Calendar, CheckCircle, Trash2 } from 'lucide-react';
import { useCycles } from '@/hooks/useRCDO';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import GridBackground from '@/components/ui/grid-background';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { suggestCycleDates } from '@/lib/rcdoValidation';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical } from 'lucide-react';

type CycleWithRallyingCry = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  rallying_cry?: {
    id: string;
    title: string;
    narrative?: string;
    status: string;
  } | null;
};

export default function StrategyHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cyclesWithRC, setCyclesWithRC] = useState<CycleWithRallyingCry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [activatingCycleId, setActivatingCycleId] = useState<string | null>(null);
  const [deletingCycleId, setDeletingCycleId] = useState<string | null>(null);

  // Fetch all cycles
  const { cycles, loading: cyclesLoading, refetch: refetchCycles, createCycle } = useCycles();

  // Permissions
  const { canCreateCycle } = useRCDOPermissions();

  // Fetch rallying cries for all cycles
  useEffect(() => {
    const fetchRallyingCries = async () => {
      if (cycles.length === 0) {
        setCyclesWithRC([]);
        setLoadingData(false);
        return;
      }

      try {
        setLoadingData(true);
        const cycleIds = cycles.map(c => c.id);
        
        const { data: rallyingCries, error } = await supabase
          .from('rc_rallying_cries')
          .select('id, cycle_id, title, narrative, status')
          .in('cycle_id', cycleIds);

        if (error) throw error;

        const cyclesWithRallyingCries = cycles.map(cycle => {
          const rallyingCry = rallyingCries?.find(rc => rc.cycle_id === cycle.id);
          return {
            ...cycle,
            rallying_cry: rallyingCry || null,
          };
        });

        setCyclesWithRC(cyclesWithRallyingCries);
      } catch (error) {
        console.error('Error fetching rallying cries:', error);
        setCyclesWithRC(cycles.map(c => ({ ...c, rallying_cry: null })));
      } finally {
        setLoadingData(false);
      }
    };

    if (!cyclesLoading) {
      fetchRallyingCries();
    }
  }, [cycles, cyclesLoading]);

  const loading = cyclesLoading || loadingData;

  // Handler functions
  const handleCreateCycle = async () => {
    setIsCreating(true);
    try {
      const dates = suggestCycleDates();
      await createCycle({
        start_date: dates.start_date,
        end_date: dates.end_date,
      });
      await refetchCycles();
    } finally {
      setIsCreating(false);
    }
  };

  const handleActivateCycle = async (cycleId: string) => {
    setActivatingCycleId(cycleId);
    try {
      // First, deactivate all other cycles
      const { error: deactivateError } = await supabase
        .from('rc_cycles')
        .update({ status: 'archived' })
        .eq('status', 'active');

      if (deactivateError) throw deactivateError;

      // Then activate the selected cycle
      const { error: activateError } = await supabase
        .from('rc_cycles')
        .update({ status: 'active' })
        .eq('id', cycleId);

      if (activateError) throw activateError;

      toast({
        title: 'Success',
        description: 'Cycle activated successfully',
      });

      await refetchCycles();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to activate cycle',
        variant: 'destructive',
      });
    } finally {
      setActivatingCycleId(null);
    }
  };

  const handleDeleteCycle = async (cycleId: string) => {
    if (!confirm('Are you sure you want to delete this cycle? This will also delete all associated rallying cries, objectives, and initiatives.')) {
      return;
    }

    setDeletingCycleId(cycleId);
    try {
      const { error } = await supabase
        .from('rc_cycles')
        .delete()
        .eq('id', cycleId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Cycle deleted successfully',
      });

      await refetchCycles();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete cycle',
        variant: 'destructive',
      });
    } finally {
      setDeletingCycleId(null);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <GridBackground>
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex items-center justify-between mb-8">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-32" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </GridBackground>
    );
  }

  // Empty state - no strategies
  if (cyclesWithRC.length === 0) {
    return (
      <GridBackground>
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  RCDO Strategies
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  View and manage your strategic cycles
                </p>
              </div>
            </div>

            <Card className="p-12 text-center">
              <div className="max-w-md mx-auto">
                <Layers className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  No Strategies Yet
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Create a 6-month strategic cycle to define the company's rallying cry and
                  defining objectives on a visual canvas.
                </p>
                {canCreateCycle && (
                  <Button
                    size="lg"
                    onClick={handleCreateCycle}
                    disabled={isCreating}
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    {isCreating ? 'Creating...' : 'Create Strategy Cycle'}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                RCDO Strategies
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                View and manage your strategic cycles
              </p>
            </div>
            {canCreateCycle && (
              <Button onClick={handleCreateCycle} disabled={isCreating}>
                <Plus className="h-4 w-4 mr-2" />
                {isCreating ? 'Creating...' : 'Create New Cycle'}
              </Button>
            )}
          </div>

          {/* Info Card */}
          <Card className="mb-6 p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              About Strategy Cycles
            </h3>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <li>• Cycles are exactly 6 months long (Jan-Jun or Jul-Dec)</li>
              <li>• Only one active cycle per company at a time</li>
              <li>• Each cycle has one Rallying Cry with 4-6 Defining Objectives</li>
              <li>• Use the canvas to visually plan and track strategic initiatives</li>
            </ul>
          </Card>

          {/* Strategies Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Cycle Period
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Rallying Cry
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cyclesWithRC.map((cycle) => (
                    <tr
                      key={cycle.id}
                      className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {format(new Date(cycle.start_date), 'MMM dd, yyyy')} -{' '}
                            {format(new Date(cycle.end_date), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {cycle.rallying_cry ? (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {cycle.rallying_cry.title}
                            </div>
                            {cycle.rallying_cry.narrative && (
                              <div className="text-sm text-muted-foreground line-clamp-1 mt-1">
                                {cycle.rallying_cry.narrative}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">
                            No rallying cry defined
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            cycle.status === 'active'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : cycle.status === 'draft'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {cycle.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => navigate(`/dashboard/rcdo/canvas?cycle=${cycle.id}`)}
                          >
                            <Layers className="h-4 w-4 mr-2" />
                            Open Canvas
                          </Button>
                          
                          {canCreateCycle && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {cycle.status === 'draft' && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleActivateCycle(cycle.id)}
                                      disabled={activatingCycleId === cycle.id}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      {activatingCycleId === cycle.id ? 'Activating...' : 'Activate Cycle'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleDeleteCycle(cycle.id)}
                                  disabled={deletingCycleId === cycle.id}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {deletingCycleId === cycle.id ? 'Deleting...' : 'Delete Cycle'}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </GridBackground>
  );
}

