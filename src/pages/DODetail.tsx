import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Lock, Unlock, TrendingUp, AlertTriangle, TrendingDown, Plus, MessageSquare, MoreVertical } from 'lucide-react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { UserProfileHeader } from '@/components/ui/user-profile-header';
import Logo from '@/components/Logo';

export default function DODetail() {
  const { doId } = useParams<{ doId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('definition');
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
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard/rcdo')}
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
              onClick={() => navigate('/dashboard/rcdo')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to RCDO
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
              {canLockDO && !isLocked && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!doDetails) return;
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      const updates: any = { 
                        locked_at: new Date().toISOString(), 
                        locked_by: user?.id || null,
                        status: 'final'
                      };
                      const { error } = await supabase
                        .from('rc_defining_objectives')
                        .update(updates)
                        .eq('id', doDetails.id);
                      if (error) throw error;
                      await Promise.all([refetchDO(), refetchInitiatives()]);
                    } catch (e) {
                      console.warn('Failed to lock DO', e);
                    }
                  }}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Lock
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
                        if (!doDetails) return;
                        try {
                          const updates: any = { 
                            locked_at: null, 
                            locked_by: null,
                            status: 'draft'
                          };
                          const { error } = await supabase
                            .from('rc_defining_objectives')
                            .update(updates)
                            .eq('id', doDetails.id);
                          if (error) throw error;
                          await Promise.all([refetchDO(), refetchInitiatives()]);
                        } catch (e) {
                          console.warn('Failed to unlock DO', e);
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

          {/* DO Header Card - Simplified when locked */}
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
                  {/* DO Name - Read-only when locked */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      DO Name
                    </h3>
                    {isLocked ? (
                      <p className="text-lg text-gray-900 dark:text-gray-100">
                        {doDetails.title}
                      </p>
                    ) : (
                      <input
                        type="text"
                        value={doDetails.title}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('rc_defining_objectives')
                            .update({ title: e.target.value })
                            .eq('id', doDetails.id);
                          if (!error) {
                            refetchDO();
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md text-lg"
                        disabled={!canEdit}
                      />
                    )}
                  </div>

                  {/* Definition & Hypothesis - Read-only when locked */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Definition & Hypothesis
                    </h3>
                    {isLocked ? (
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {doDetails.hypothesis || 'No definition provided.'}
                      </p>
                    ) : (
                      <textarea
                        value={doDetails.hypothesis || ''}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from('rc_defining_objectives')
                            .update({ hypothesis: e.target.value })
                            .eq('id', doDetails.id);
                          if (!error) {
                            refetchDO();
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md min-h-[100px]"
                        disabled={!canEdit}
                        placeholder="Enter definition and hypothesis..."
                      />
                    )}
                  </div>

                  {/* Primary Success Metric - Read-only when locked */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Primary Success Metric
                    </h3>
                    {isLocked ? (
                      <p className="text-gray-700 dark:text-gray-300">
                        {metrics.find(m => m.type === 'lagging')?.name || 'No primary success metric defined.'}
                      </p>
                    ) : (
                      <textarea
                        value={metrics.find(m => m.type === 'lagging')?.name || ''}
                        onChange={async (e) => {
                          const laggingMetric = metrics.find(m => m.type === 'lagging');
                          if (laggingMetric) {
                            const { error } = await supabase
                              .from('rc_do_metrics')
                              .update({ name: e.target.value })
                              .eq('id', laggingMetric.id);
                            if (!error) {
                              refetchMetrics();
                            }
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md min-h-[60px]"
                        disabled={!canEdit}
                        placeholder="e.g., OpEx management and achievement of SI-level metrics"
                      />
                    )}
                  </div>

                  {/* Owner - Read-only when locked */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Owner
                    </h3>
                    {isLocked ? (
                      <div className="flex items-center gap-2">
                        <FancyAvatar
                          name={doDetails.owner?.avatar_name || ownerName}
                          displayName={ownerName}
                          avatarUrl={doDetails.owner?.avatar_url}
                          size="sm"
                        />
                        <span className="text-sm">{ownerName}</span>
                      </div>
                    ) : (
                      <Select
                        disabled={profilesLoading}
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
                    )}
                  </div>

                  {/* Strategic Initiatives - Read-only when locked, can't add new */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Strategic Initiatives
                      </h3>
                      {!isLocked && (
                        <Button
                          size="sm"
                          disabled={!canEdit}
                          onClick={() => setShowInitiativeDialog(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Initiative
                        </Button>
                      )}
                    </div>
                    {initiatives.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400">
                        No strategic initiatives yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {initiatives.map((initiative) => (
                          <InitiativeCard key={initiative.id} initiative={initiative} />
                        ))}
                      </div>
                    )}
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

