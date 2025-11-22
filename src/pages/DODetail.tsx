import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Lock, Unlock, TrendingUp, AlertTriangle, TrendingDown, Plus, MessageSquare } from 'lucide-react';
import { useDODetails, useDOMetrics, useStrategicInitiatives, useRCLinks, useCheckins } from '@/hooks/useRCDO';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { MetricRow } from '@/components/rcdo/MetricRow';
import { InitiativeCard } from '@/components/rcdo/InitiativeCard';
import { MetricDialog } from '@/components/rcdo/MetricDialog';
import { InitiativeDialog } from '@/components/rcdo/InitiativeDialog';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';
import { CheckinCard } from '@/components/rcdo/CheckinCard';
import GridBackground from '@/components/ui/grid-background';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { calculateDOHealth, getHealthColor } from '@/lib/rcdoScoring';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

export default function DODetail() {
  const { doId } = useParams<{ doId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('metrics');
  const [showMetricDialog, setShowMetricDialog] = useState(false);
  const [showInitiativeDialog, setShowInitiativeDialog] = useState(false);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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

  // Fetch check-ins
  const { checkins, loading: checkinsLoading, refetch: refetchCheckins } = useCheckins('do', doId);

  // Permissions
  const { canEditDO, canLockDO, canEditInitiative } = useRCDOPermissions();

  const handleMetricSuccess = () => {
    refetchMetrics();
  };

  const handleInitiativeSuccess = () => {
    refetchInitiatives();
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

  // Profiles for owner selection - load on mount
  const [profiles, setProfiles] = useState<any[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  
  useEffect(() => {
    const loadProfiles = async () => {
      setProfilesLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_name, avatar_url')
        .order('full_name', { ascending: true });
      if (!error && data) setProfiles(data as any[]);
      setProfilesLoading(false);
    };
    loadProfiles();
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
          for (const row of data as any[]) map.set(row.id, row);
          return Array.from(map.values());
        });
      });
  }, [doDetails, initiatives, profiles]);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

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
  const isOwner = currentUserId === doDetails.owner_user_id;

  // Calculate health based on current metrics
  const healthResult = calculateDOHealth(doDetails.id, metrics);
  const isDefaultState = doDetails.status === 'draft' || metrics.length === 0;
  const healthColor = isDefaultState ? 'text-slate-600 dark:text-slate-300' : getHealthColor(healthResult.health);

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
            <div className="flex items-center gap-2">
              {isOwner && (
                <Button
                  variant="outline"
                  onClick={() => setShowCheckInDialog(true)}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Check-In
                </Button>
              )}
              {canLockDO && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!doDetails) return;
                    const locking = !isLocked;
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      const updates: any = locking
                        ? { locked_at: new Date().toISOString(), locked_by: user?.id || null }
                        : { locked_at: null, locked_by: null };
                      const { error } = await supabase
                        .from('rc_defining_objectives')
                        .update(updates)
                        .eq('id', doDetails.id);
                      if (error) throw error;
                      // Refresh DO and its initiatives (SIs may have been cascade-locked)
                      await Promise.all([refetchDO(), refetchInitiatives()]);
                    } catch (e) {
                      console.warn('Failed to toggle DO lock', e);
                    }
                  }}
                >
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
                    isDefaultState
                      ? 'bg-slate-600'
                      : healthResult.health === 'on_track'
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
                <Select
                  disabled={!canEdit || profilesLoading}
                  value={doDetails.owner_user_id}
                  onValueChange={async (val) => {
                    const { error } = await supabase
                      .from('rc_defining_objectives')
                      .update({ owner_user_id: val })
                      .eq('id', doDetails.id);
                    if (!error) {
                      refetchDO();
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-[240px]">
                    <SelectValue placeholder="Select owner">
                      {doDetails.owner_user_id && (
                        <div className="flex items-center gap-2">
                          <FancyAvatar
                            name={doDetails.owner?.avatar_name || ownerName}
                            displayName={ownerName}
                            avatarUrl={doDetails.owner?.avatar_url}
                            size="sm"
                          />
                          <span className="text-sm">{ownerName}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <FancyAvatar 
                            name={p.avatar_name || p.full_name} 
                            displayName={p.full_name}
                            avatarUrl={p.avatar_url}
                            size="sm" 
                          />
                          <span>{p.full_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <TabsTrigger value="checkins">
                Check-ins ({checkins.length})
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
                    <Button disabled={!canEdit} onClick={() => setShowMetricDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Metric
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between p-4 border-b">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                        Metrics
                      </h3>
                      <Button
                        size="sm"
                        disabled={!canEdit}
                        onClick={() => setShowMetricDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Metric
                      </Button>
                    </div>
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
                  <Button disabled={!canEdit} onClick={() => setShowInitiativeDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Initiative
                  </Button>
                </Card>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      Strategic Initiatives
                    </h3>
                    <Button
                      size="sm"
                      disabled={!canEdit}
                      onClick={() => setShowInitiativeDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Initiative
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {initiatives.map((initiative) => {
                      const canEditSI = canEditInitiative(
                        initiative.owner_user_id,
                        initiative.locked_at,
                        doDetails.owner_user_id,
                        initiative.created_by || undefined
                      );
                      return (
                        <div key={initiative.id} className="space-y-2">
                          <InitiativeCard initiative={initiative} />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Owner</span>
                            <Select
                              disabled={!canEditSI || profilesLoading}
                              value={initiative.owner_user_id}
                              onValueChange={async (val) => {
                                const { error } = await supabase
                                  .from('rc_strategic_initiatives')
                                  .update({ owner_user_id: val })
                                  .eq('id', initiative.id);
                                if (!error) {
                                  refetchInitiatives();
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Select owner" />
                              </SelectTrigger>
                              <SelectContent>
                                {profiles.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    <span className="inline-flex items-center gap-2">
                                      <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                                        <FancyAvatar name={p.avatar_name || p.full_name} displayName={p.full_name} avatarUrl={p.avatar_url} size="sm" />
                                      </span>
                                      <span>{p.full_name}</span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Check-ins Tab */}
            <TabsContent value="checkins">
              <Card>
                {checkins.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      No check-ins yet. Add a check-in to track progress and updates.
                    </p>
                    {isOwner && (
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
    </GridBackground>
  );
}

