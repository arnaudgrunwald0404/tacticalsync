import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Lock, Unlock, TrendingUp, AlertTriangle, TrendingDown } from 'lucide-react';
import { useDODetails, useDOMetrics, useStrategicInitiatives, useRCLinks } from '@/hooks/useRCDO';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { MetricRow } from '@/components/rcdo/MetricRow';
import { InitiativeCard } from '@/components/rcdo/InitiativeCard';
import GridBackground from '@/components/ui/grid-background';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { calculateDOHealth, getHealthColor } from '@/lib/rcdoScoring';

export default function DODetail() {
  const { doId } = useParams<{ doId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('metrics');

  // Fetch DO details
  const { doDetails, loading: doLoading, refetch: refetchDO } = useDODetails(doId);

  // Fetch metrics
  const {
    metrics,
    loading: metricsLoading,
    refetch: refetchMetrics,
    updateMetric,
  } = useDOMetrics(doId);

  // Fetch initiatives
  const {
    initiatives,
    loading: initiativesLoading,
    refetch: refetchInitiatives,
  } = useStrategicInitiatives(doId);

  // Fetch links
  const { links, loading: linksLoading, refetch: refetchLinks } = useRCLinks('do', doId);

  // Permissions
  const { canEditDO, canLockDO } = useRCDOPermissions();

  // Real-time updates
  useRCDORealtime({
    doId,
    onDOUpdate: refetchDO,
    onMetricsUpdate: refetchMetrics,
    onInitiativesUpdate: refetchInitiatives,
    onLinksUpdate: refetchLinks,
  });

  const loading = doLoading || metricsLoading || initiativesLoading || linksLoading;

  if (loading || !doDetails) {
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
    doDetails.owner?.first_name,
    doDetails.owner?.last_name,
    doDetails.owner?.full_name
  );

  const isLocked = !!doDetails.locked_at;
  const canEdit = canEditDO(doDetails.owner_user_id, doDetails.locked_at);

  // Calculate health based on current metrics
  const healthResult = calculateDOHealth(doDetails.id, metrics);
  const healthColor = getHealthColor(healthResult.health);

  const healthIcons = {
    on_track: TrendingUp,
    at_risk: AlertTriangle,
    off_track: TrendingDown,
    done: TrendingUp,
  };

  const HealthIcon = healthIcons[healthResult.health];

  return (
    <GridBackground>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard/rcdo')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to RCDO
            </Button>
            {canLockDO && (
              <Button variant="outline">
                {isLocked ? (
                  <>
                    <Unlock className="h-4 w-4 mr-2" />
                    Unlock
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Lock
                  </>
                )}
              </Button>
            )}
          </div>

          {/* DO Header Card */}
          <Card className="p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {doDetails.title}
                  </h1>
                  {isLocked && (
                    <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  )}
                </div>
                {doDetails.hypothesis && (
                  <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                    {doDetails.hypothesis}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 items-end">
                <Badge
                  className={
                    healthResult.health === 'on_track'
                      ? 'bg-green-500'
                      : healthResult.health === 'at_risk'
                      ? 'bg-yellow-500'
                      : healthResult.health === 'off_track'
                      ? 'bg-red-500'
                      : 'bg-purple-500'
                  }
                >
                  <HealthIcon className="h-3 w-3 mr-1" />
                  {healthResult.health.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </div>

            {/* Owner & Confidence */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  Owner:
                </span>
                <div className="flex items-center gap-2">
                  {doDetails.owner?.avatar_url ? (
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={doDetails.owner.avatar_url} />
                      <AvatarFallback>{ownerName}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <FancyAvatar name={ownerName} size={28} />
                  )}
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {ownerName}
                  </span>
                </div>
              </div>

              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    Confidence:
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {doDetails.confidence_pct}%
                  </span>
                </div>
                <Slider
                  value={[doDetails.confidence_pct]}
                  max={100}
                  step={5}
                  disabled={!canEdit}
                  className="cursor-pointer"
                />
              </div>
            </div>

            {/* Health Summary */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Health Score: </span>
                  <span className={`font-bold ${healthColor}`}>
                    {healthResult.score.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">
                    Leading Metrics:{' '}
                  </span>
                  <span className="font-semibold">{healthResult.leadingMetricsCount}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-green-600">
                    {healthResult.onTrackCount} on track
                  </span>
                  <span className="text-yellow-600">
                    {healthResult.atRiskCount} at risk
                  </span>
                  <span className="text-red-600">
                    {healthResult.offTrackCount} off track
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="metrics">
                Metrics ({metrics.length})
              </TabsTrigger>
              <TabsTrigger value="initiatives">
                Initiatives ({initiatives.length})
              </TabsTrigger>
              <TabsTrigger value="links">Links ({links.length})</TabsTrigger>
            </TabsList>

            {/* Metrics Tab */}
            <TabsContent value="metrics">
              <Card>
                {metrics.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      No metrics defined yet. Add leading and lagging metrics to track
                      progress.
                    </p>
                    <Button disabled={!canEdit}>Add Metric</Button>
                  </div>
                ) : (
                  <div>
                    {metrics.map((metric) => (
                      <MetricRow
                        key={metric.id}
                        metric={metric}
                        onUpdate={updateMetric}
                        isLocked={isLocked}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Initiatives Tab */}
            <TabsContent value="initiatives">
              {initiatives.length === 0 ? (
                <Card className="p-12 text-center">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    No strategic initiatives yet. Create initiatives to drive this
                    objective forward.
                  </p>
                  <Button disabled={!canEdit}>Add Initiative</Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {initiatives.map((initiative) => (
                    <InitiativeCard key={initiative.id} initiative={initiative} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Links Tab */}
            <TabsContent value="links">
              <Card>
                {links.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400">
                      No linked items yet. Link meeting priorities and action items to
                      this DO using hashtags.
                    </p>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="space-y-3">
                      {links.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <Badge variant="outline" className="mr-2">
                              {link.kind.replace('_', ' ')}
                            </Badge>
                            <span className="text-sm">Linked item #{link.ref_id.slice(0, 8)}</span>
                          </div>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </GridBackground>
  );
}

