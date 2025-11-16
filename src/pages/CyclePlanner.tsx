import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Plus, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useCycles } from '@/hooks/useRCDO';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { suggestCycleDates } from '@/lib/rcdoValidation';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import GridBackground from '@/components/ui/grid-background';
import { Skeleton } from '@/components/ui/skeleton';

const statusColors = {
  draft: 'bg-gray-500',
  active: 'bg-green-500',
  review: 'bg-blue-500',
  archived: 'bg-purple-500',
};

const statusLabels = {
  draft: 'Draft',
  active: 'Active',
  review: 'Review',
  archived: 'Archived',
};

export default function CyclePlanner() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [activatingCycleId, setActivatingCycleId] = useState<string | null>(null);

  const { cycles, loading, createCycle, refetch } = useCycles();
  const { canCreateCycle } = useRCDOPermissions();

  const handleCreateCycle = async () => {
    setIsCreating(true);
    try {
      const dates = suggestCycleDates();
      const newCycle = await createCycle({
        start_date: dates.start_date,
        end_date: dates.end_date,
      });

      if (newCycle) {
        navigate('/dashboard/rcdo');
      }
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

      await refetch();
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

  if (loading) {
    return (
      <GridBackground>
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="container mx-auto px-4 py-8 max-w-6xl">
            <Skeleton className="h-12 w-full mb-8" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard/rcdo')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to RCDO
              </Button>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Strategy Cycles
              </h1>
            </div>
            {canCreateCycle && (
              <Button onClick={handleCreateCycle} disabled={isCreating}>
                <Plus className="h-4 w-4 mr-2" />
                Create New Cycle
              </Button>
            )}
          </div>

          {/* Cycles Table */}
          {cycles.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                No Strategy Cycles Yet
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create a 6-month strategic cycle to define your team's rallying cry and
                defining objectives.
              </p>
              {canCreateCycle && (
                <Button size="lg" onClick={handleCreateCycle} disabled={isCreating}>
                  <Plus className="h-5 w-5 mr-2" />
                  Create First Cycle
                </Button>
              )}
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cycles.map((cycle) => (
                    <TableRow key={cycle.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900">
                      <TableCell className="font-medium">
                        {format(new Date(cycle.start_date), 'MMM yyyy')} -{' '}
                        {format(new Date(cycle.end_date), 'MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        {format(new Date(cycle.start_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {format(new Date(cycle.end_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[cycle.status]}>
                          {statusLabels[cycle.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(cycle.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {cycle.status === 'active' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate('/dashboard/rcdo')}
                            >
                              View Strategy
                            </Button>
                          ) : cycle.status === 'draft' ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleActivateCycle(cycle.id)}
                                disabled={activatingCycleId === cycle.id || !canCreateCycle}
                              >
                                {activatingCycleId === cycle.id ? (
                                  'Activating...'
                                ) : (
                                  <>
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Activate
                                  </>
                                )}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              title="Archived cycles cannot be viewed"
                            >
                              Archived
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Info Card */}
          <Card className="mt-6 p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              About Strategy Cycles
            </h3>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <li>• Cycles are exactly 6 months long (Jan-Jun or Jul-Dec)</li>
              <li>• Only one active cycle per team at a time</li>
              <li>• Each cycle has one Rallying Cry with 4-6 Defining Objectives</li>
              <li>• Metrics and initiatives track progress throughout the cycle</li>
            </ul>
          </Card>
        </div>
      </div>
    </GridBackground>
  );
}

