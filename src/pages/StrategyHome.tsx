import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Settings } from 'lucide-react';
import { useActiveCycle, useRallyingCry, useCycleDOs } from '@/hooks/useRCDO';
import { useStrategyHomeRealtime } from '@/hooks/useRCDORealtime';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { RCBanner } from '@/components/rcdo/RCBanner';
import { DOTile } from '@/components/rcdo/DOTile';
import GridBackground from '@/components/ui/grid-background';
import { Skeleton } from '@/components/ui/skeleton';

export default function StrategyHome() {
  const navigate = useNavigate();

  // Fetch active cycle (company-wide)
  const { cycle, loading: cycleLoading, refetch: refetchCycle } = useActiveCycle();

  // Fetch rallying cry for the active cycle
  const {
    rallyingCry,
    loading: rcLoading,
    refetch: refetchRC,
  } = useRallyingCry(cycle?.id);

  // Fetch DOs for the rallying cry
  const { dos, loading: dosLoading, refetch: refetchDOs } = useCycleDOs(rallyingCry?.id);

  // Permissions
  const { canCreateCycle } = useRCDOPermissions();

  // Real-time updates
  useStrategyHomeRealtime(() => {
    refetchCycle();
    refetchRC();
    refetchDOs();
  });

  const loading = cycleLoading || rcLoading || dosLoading;

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
            <Skeleton className="h-48 w-full mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          </div>
        </div>
      </GridBackground>
    );
  }

  // No active cycle state
  if (!cycle) {
    return (
      <GridBackground>
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="container mx-auto px-4 py-8 max-w-7xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                RCDO Strategy
              </h1>
              <Button onClick={() => navigate('/dashboard/rcdo/cycles')}>
                <Settings className="h-4 w-4 mr-2" />
                Manage Cycles
              </Button>
            </div>

            {/* Empty state */}
            <Card className="p-12 text-center">
              <div className="max-w-md mx-auto">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  No Active Strategy Cycle
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Create a 6-month strategic cycle to define the company's rallying cry and
                  defining objectives.
                </p>
                {canCreateCycle && (
                  <Button
                    size="lg"
                    onClick={() => navigate('/dashboard/rcdo/cycles')}
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Create Strategy Cycle
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      </GridBackground>
    );
  }

  // No rallying cry state
  if (!rallyingCry) {
    return (
      <GridBackground>
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                RCDO Strategy
              </h1>
              <Button onClick={() => navigate('/dashboard/rcdo/cycles')}>
                <Settings className="h-4 w-4 mr-2" />
                Manage Cycles
              </Button>
            </div>

            <Card className="p-12 text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                Define Your Rallying Cry
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create a rallying cry to align the company around a common goal for this cycle.
              </p>
              <Button
                size="lg"
                onClick={() => navigate('/dashboard/rcdo/cycles')}
              >
                <Plus className="h-5 w-5 mr-2" />
                Create Rallying Cry
              </Button>
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
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              RCDO Strategy
            </h1>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate('/dashboard/rcdo/cycles')}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage Cycles
              </Button>
            </div>
          </div>

          {/* Rallying Cry Banner */}
          <div className="mb-8">
            <RCBanner
              rallyingCry={rallyingCry}
              startDate={cycle.start_date}
              endDate={cycle.end_date}
            />
          </div>

          {/* Defining Objectives Grid */}
          {dos.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                No Defining Objectives Yet
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create 4-6 defining objectives to break down your rallying cry into
                actionable goals.
              </p>
              <Button
                size="lg"
                onClick={() => navigate('/dashboard/rcdo/cycles')}
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Defining Objectives
              </Button>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Defining Objectives
                </h2>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {dos.length} objective{dos.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dos.map((doItem) => (
                  <DOTile key={doItem.id} definingObjective={doItem} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </GridBackground>
  );
}

