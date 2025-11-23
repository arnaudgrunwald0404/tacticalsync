import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, MessageSquare } from 'lucide-react';
import { useDODetails, useDOMetrics, useStrategicInitiatives, useRCLinks, useCheckins } from '@/hooks/useRCDO';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { InitiativeCard } from '@/components/rcdo/InitiativeCard';
import { MetricDialog } from '@/components/rcdo/MetricDialog';
import { InitiativeDialog } from '@/components/rcdo/InitiativeDialog';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';
import { CheckinCard } from '@/components/rcdo/CheckinCard';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { DetailPageLayout } from '@/components/rcdo/DetailPageLayout';
import { DetailPageHeader } from '@/components/rcdo/DetailPageHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';

export default function DODetail() {
  const { doId } = useParams<{ doId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initiativeIdFromUrl = searchParams.get('initiative');
  const [activeTab, setActiveTab] = useState('performance');
  const [showMetricDialog, setShowMetricDialog] = useState(false);
  const [showInitiativeDialog, setShowInitiativeDialog] = useState(false);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedInitiative, setSelectedInitiative] = useState<any>(null);

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

  // Set selected initiative when initiativeId is in URL
  useEffect(() => {
    if (initiativeIdFromUrl) {
      const initiative = initiatives.find(i => i.id === initiativeIdFromUrl);
      if (initiative) {
        setSelectedInitiative(initiative);
      }
    } else {
      setSelectedInitiative(null);
    }
  }, [initiativeIdFromUrl, initiatives]);

  if (loading || !doDetails) {
    return (
      <DetailPageLayout
        rallyingCryId={doDetails?.rallying_cry_id || ''}
        currentDOId={doId}
        mobileNavOpen={mobileNavOpen}
        onMobileNavOpenChange={setMobileNavOpen}
        loading={true}
      >
        <Skeleton className="h-12 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </DetailPageLayout>
    );
  }

  const isLocked = !!doDetails.locked_at;
  const canEdit = canEditDO(doDetails.owner_user_id, doDetails.locked_at);
  const isOwner = currentUserId === doDetails.owner_user_id;
  const ownerName = getFullNameForAvatar(
    doDetails.owner?.first_name,
    doDetails.owner?.last_name,
    doDetails.owner?.full_name
  );

  const handleLock = async () => {
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
  };

  const handleUnlock = async () => {
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
  };

  // Additional content for selected initiative
  const additionalContent = selectedInitiative ? (
    <>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {selectedInitiative.title}
      </h2>
      {selectedInitiative.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {selectedInitiative.description.replace(/<[^>]*>/g, '').trim()}
        </p>
      )}
      {selectedInitiative.owner && (
        <div className="flex items-center gap-2 text-sm">
          <FancyAvatar
            name={selectedInitiative.owner?.avatar_name || getFullNameForAvatar(
              selectedInitiative.owner?.first_name,
              selectedInitiative.owner?.last_name,
              selectedInitiative.owner?.full_name
            )}
            displayName={getFullNameForAvatar(
              selectedInitiative.owner?.first_name,
              selectedInitiative.owner?.last_name,
              selectedInitiative.owner?.full_name
            )}
            avatarUrl={selectedInitiative.owner?.avatar_url}
            size="sm"
          />
          <span className="text-gray-700 dark:text-gray-300">
            {getFullNameForAvatar(
              selectedInitiative.owner?.first_name,
              selectedInitiative.owner?.last_name,
              selectedInitiative.owner?.full_name
            )}
          </span>
        </div>
      )}
    </>
  ) : undefined;

  return (
    <DetailPageLayout
      rallyingCryId={doDetails.rallying_cry_id}
      currentDOId={doId}
      mobileNavOpen={mobileNavOpen}
      onMobileNavOpenChange={setMobileNavOpen}
      loading={loading}
    >
      <DetailPageHeader
        title={doDetails.title}
        description={doDetails.hypothesis}
        owner={doDetails.owner}
        isLocked={isLocked}
        isOwner={isOwner}
        currentUserId={currentUserId}
        type="do"
        doId={doDetails.id}
        metrics={metrics}
        status={doDetails.status}
        primarySuccessMetric={metrics.find(m => m.type === 'lagging')?.name || ''}
        onPrimarySuccessMetricChange={async (value) => {
          const laggingMetric = metrics.find(m => m.type === 'lagging');
          if (laggingMetric) {
            const { error } = await supabase
              .from('rc_do_metrics')
              .update({ name: value })
              .eq('id', laggingMetric.id);
            if (!error) {
              refetchMetrics();
            }
          }
        }}
        onLock={handleLock}
        onUnlock={handleUnlock}
        onCheckIn={() => setShowCheckInDialog(true)}
        canLock={canLockDO}
        canEdit={canEdit}
        additionalContent={additionalContent}
      />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="performance">
                Performance
              </TabsTrigger>
              <TabsTrigger value="definition">
                Definition
              </TabsTrigger>
              <TabsTrigger value="checkins">
                Check-ins ({checkins.length})
              </TabsTrigger>
              <TabsTrigger value="details">
                Details
              </TabsTrigger>
            </TabsList>

            {/* Performance Tab */}
            <TabsContent value="performance">
              <Card className="p-6">
                <div className="space-y-6">
                  {/* Strategic Initiatives Table */}
                  <div>
                    {initiatives.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400">
                        No strategic initiatives yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                                Description
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                                XLT Project Owner
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                                Est. Completion Date
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                                Rate of Completion
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                                Pace
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {initiatives.map((initiative, index) => {
                              const initiativeOwnerName = getFullNameForAvatar(
                                initiative.owner?.first_name,
                                initiative.owner?.last_name,
                                initiative.owner?.full_name
                              );
                              const completionDate = initiative.end_date 
                                ? new Date(initiative.end_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                                : 'N/A';
                              
                              // Calculate completion rate (placeholder - could be from tasks or check-ins)
                              const completionRate = '0%'; // TODO: Calculate from tasks
                              
                              // Map status to pace
                              const getPaceStatus = (status: string) => {
                                switch (status) {
                                  case 'on_track':
                                  case 'initialized':
                                    return { text: 'On Track', color: 'text-green-600 dark:text-green-400' };
                                  case 'at_risk':
                                  case 'delayed':
                                    return { text: 'At Risk', color: 'text-yellow-600 dark:text-yellow-400' };
                                  case 'off_track':
                                  case 'cancelled':
                                    return { text: 'Off Track', color: 'text-red-600 dark:text-red-400' };
                                  case 'done':
                                  case 'completed':
                                    return { text: 'Done', color: 'text-purple-600 dark:text-purple-400' };
                                  default:
                                    return { text: 'Not Started', color: 'text-gray-600 dark:text-gray-400' };
                                }
                              };
                              const pace = getPaceStatus(initiative.status || 'draft');

                              return (
                                <tr 
                                  key={initiative.id}
                                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                                  onClick={() => {
                                    setSearchParams({ initiative: initiative.id });
                                  }}
                                >
                                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                                    {initiative.title}
                                  </td>
                                  <td className="py-3 px-4 text-sm">
                                    <div className="flex items-center gap-2">
                                      <FancyAvatar
                                        name={initiative.owner?.avatar_name || initiativeOwnerName}
                                        displayName={initiativeOwnerName}
                                        avatarUrl={initiative.owner?.avatar_url}
                                        size="sm"
                                      />
                                      <span className="text-gray-700 dark:text-gray-300">{initiativeOwnerName}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                                    {completionDate}
                                  </td>
                                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                                    {completionRate}
                                  </td>
                                  <td className="py-3 px-4 text-sm">
                                    <span className={pace.color}>{pace.text}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Details Tab */}
            <TabsContent value="details">
              <Card className="p-6">
                <div className="space-y-6">
                  {/* Name - Read-only when locked */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Name
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
                      <div 
                        className="text-gray-700 dark:text-gray-300 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: doDetails.hypothesis || 'No definition provided.' }}
                      />
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
                </div>
              </Card>
            </TabsContent>

            {/* Definition Tab */}
            <TabsContent value="definition">
              <Card className="p-6">
                <div className="space-y-6">
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
                          <InitiativeCard 
                            key={initiative.id} 
                            initiative={initiative}
                            onClick={() => {
                              setSearchParams({ initiative: initiative.id });
                            }}
                          />
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

      {/* Initiative Details Drawer */}
      <Sheet 
        open={!!selectedInitiative} 
        onOpenChange={(open) => {
          if (!open) {
            setSelectedInitiative(null);
            setSearchParams({});
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selectedInitiative && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="text-2xl font-bold">
                  {selectedInitiative.title}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-4">
                {/* Status */}
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                    Status
                  </label>
                  <Badge className={
                    selectedInitiative.status === 'draft' ? 'bg-blue-500' :
                    selectedInitiative.status === 'initialized' ? 'bg-cyan-500' :
                    selectedInitiative.status === 'on_track' ? 'bg-green-500' :
                    selectedInitiative.status === 'delayed' ? 'bg-yellow-500' :
                    selectedInitiative.status === 'cancelled' ? 'bg-red-500' :
                    // Legacy status mappings
                    selectedInitiative.status === 'not_started' ? 'bg-blue-500' :
                    selectedInitiative.status === 'at_risk' ? 'bg-yellow-500' :
                    selectedInitiative.status === 'off_track' ? 'bg-yellow-500' :
                    selectedInitiative.status === 'completed' ? 'bg-green-500' :
                    'bg-gray-500'
                  }>
                    {selectedInitiative.status?.replace('_', ' ').toUpperCase() || 'Draft'}
                  </Badge>
                </div>

                {/* Description */}
                {selectedInitiative.description && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                      Description
                    </label>
                    <p className="text-sm whitespace-pre-wrap">
                      {selectedInitiative.description.replace(/<[^>]*>/g, '').trim()}
                    </p>
                  </div>
                )}

                {/* Owner */}
                {selectedInitiative.owner && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                      Owner
                    </label>
                    <div className="flex items-center gap-2">
                      <FancyAvatar
                        name={selectedInitiative.owner?.avatar_name || getFullNameForAvatar(
                          selectedInitiative.owner?.first_name,
                          selectedInitiative.owner?.last_name,
                          selectedInitiative.owner?.full_name
                        )}
                        displayName={getFullNameForAvatar(
                          selectedInitiative.owner?.first_name,
                          selectedInitiative.owner?.last_name,
                          selectedInitiative.owner?.full_name
                        )}
                        avatarUrl={selectedInitiative.owner?.avatar_url}
                        size="sm"
                      />
                      <span className="text-sm">
                        {getFullNameForAvatar(
                          selectedInitiative.owner?.first_name,
                          selectedInitiative.owner?.last_name,
                          selectedInitiative.owner?.full_name
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Dates */}
                {(selectedInitiative.start_date || selectedInitiative.end_date) && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                      Timeline
                    </label>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>
                        {selectedInitiative.start_date && new Date(selectedInitiative.start_date).toLocaleDateString()}
                        {selectedInitiative.start_date && selectedInitiative.end_date && ' - '}
                        {selectedInitiative.end_date && new Date(selectedInitiative.end_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Primary Success Metric */}
                {selectedInitiative.primary_success_metric && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                      Primary Success Metric
                    </label>
                    <p className="text-sm">{selectedInitiative.primary_success_metric}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/rcdo/detail/si/${selectedInitiative.id}`)}
                    className="flex-1"
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </DetailPageLayout>
  );
}

