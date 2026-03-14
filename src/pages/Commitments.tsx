import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useActiveQuarter, useMyCommitments, useTeamCommitments, useReportingLines } from '@/hooks/useCommitments';
import { QuarterSelector } from '@/components/commitments/QuarterSelector';
import { MyCommitmentsPanel } from '@/components/commitments/MyCommitmentsPanel';
import { TeamRollupView } from '@/components/commitments/TeamRollupView';

interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  avatar_name: string | null;
}

export default function Commitments() {
  const [userId, setUserId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(true);

  // Bootstrap: get current user + their first team
  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      setUserId(uid);

      const { data: memberships } = await supabase
        .from('team_members')
        .select('team_id, role')
        .eq('user_id', uid)
        .limit(1)
        .single();

      if (!memberships) { setProfilesLoading(false); return; }
      setTeamId(memberships.team_id);
      setIsAdmin(memberships.role === 'admin');

      // Load all profiles in team for rollup views
      const { data: members } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', memberships.team_id);

      const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, avatar_name')
          .in('id', memberIds);
        setTeamMembers((profiles ?? []) as Profile[]);
      }
      setProfilesLoading(false);
    }
    load();
  }, []);

  const { quarter, quarters, loading: quarterLoading, setQuarter, createQuarter } = useActiveQuarter(teamId);
  const { priorities, commitments, loading: myLoading, upsertPriority, deletePriority, upsertCommitment, deleteCommitment, updateCommitmentStatus } = useMyCommitments(quarter?.id ?? null, userId);
  const { lines: reportingLines, loading: linesLoading, getDirectReportIds, getAllReportIds } = useReportingLines(teamId);

  const directReportIds = useMemo(() => userId ? getDirectReportIds(userId) : [], [userId, getDirectReportIds]);
  const allReportIds = useMemo(() => userId ? getAllReportIds(userId) : [], [userId, getAllReportIds]);

  // Team tab: direct reports + self
  const teamUserIds = useMemo(() => [...directReportIds, ...(userId ? [userId] : [])], [directReportIds, userId]);
  const { priorities: teamPriorities, commitments: teamCommitments, loading: teamLoading } = useTeamCommitments(quarter?.id ?? null, teamUserIds);

  // Org tab: all reports recursively
  const orgUserIds = useMemo(() => [...allReportIds, ...(userId ? [userId] : [])], [allReportIds, userId]);
  const { priorities: orgPriorities, commitments: orgCommitments, loading: orgLoading } = useTeamCommitments(quarter?.id ?? null, orgUserIds);

  const profileById = useMemo(() => {
    const map: Record<string, Profile> = {};
    teamMembers.forEach(m => { map[m.id] = m; });
    return map;
  }, [teamMembers]);

  const membersFor = (ids: string[]) =>
    ids.map(id => profileById[id]).filter(Boolean) as Profile[];

  const loading = profilesLoading || quarterLoading;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!quarter) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Commitments</h1>
          {isAdmin && (
            <QuarterSelector
              quarters={quarters}
              selected={null}
              onSelect={setQuarter}
              onCreateQuarter={createQuarter}
              isAdmin={isAdmin}
            />
          )}
        </div>
        <div className="mt-12 text-center text-muted-foreground">
          {isAdmin
            ? 'No active quarter yet. Create one to get started.'
            : 'No active quarter yet. Ask your team admin to create one.'}
        </div>
      </div>
    );
  }

  const hasDirectReports = directReportIds.length > 0;
  const hasOrgReports = allReportIds.length > 0;

  // Org view scope filter: null = all, or a direct-report manager's userId
  const [orgScope, setOrgScope] = useState<string | null>(null);
  // Reset scope when quarter changes
  useEffect(() => { setOrgScope(null); }, [quarter?.id]);

  // Direct reports who are themselves managers (have their own reports)
  const subManagerIds = useMemo(
    () => directReportIds.filter(id => getDirectReportIds(id).length > 0),
    [directReportIds, getDirectReportIds]
  );

  // Scoped org: either full tree or just one sub-manager's subtree
  const scopedRootId = orgScope ?? userId ?? undefined;
  const scopedReportIds = useMemo(
    () => scopedRootId ? getAllReportIds(scopedRootId) : allReportIds,
    [scopedRootId, getAllReportIds, allReportIds]
  );
  const scopedOrgUserIds = useMemo(
    () => [...scopedReportIds, ...(scopedRootId ? [scopedRootId] : [])],
    [scopedReportIds, scopedRootId]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Commitments</h1>
          <p className="text-sm text-muted-foreground">{quarter.label}</p>
        </div>
        <QuarterSelector
          quarters={quarters}
          selected={quarter}
          onSelect={setQuarter}
          onCreateQuarter={isAdmin ? createQuarter : undefined}
          isAdmin={isAdmin}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My Quarter</TabsTrigger>
          {hasDirectReports && <TabsTrigger value="team">My Team</TabsTrigger>}
          {hasOrgReports && hasDirectReports && allReportIds.length > directReportIds.length && (
            <TabsTrigger value="org">Org View</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine" className="mt-6">
          {myLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : userId ? (
            <MyCommitmentsPanel
              quarter={quarter}
              userId={userId}
              priorities={priorities}
              commitments={commitments}
              onUpsertPriority={upsertPriority}
              onDeletePriority={deletePriority}
              onUpsertCommitment={upsertCommitment}
              onDeleteCommitment={deleteCommitment}
              onStatusChange={updateCommitmentStatus}
            />
          ) : null}
        </TabsContent>

        {hasDirectReports && (
          <TabsContent value="team" className="mt-6">
            {teamLoading || linesLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <TeamRollupView
                quarter={quarter}
                members={membersFor(teamUserIds)}
                priorities={teamPriorities}
                commitments={teamCommitments}
              />
            )}
          </TabsContent>
        )}

        {hasOrgReports && hasDirectReports && allReportIds.length > directReportIds.length && (
          <TabsContent value="org" className="mt-6">
            {/* Scope filter chips */}
            {subManagerIds.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setOrgScope(null)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-colors',
                    orgScope === null
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  All
                </button>
                {subManagerIds.map(id => {
                  const m = profileById[id];
                  if (!m) return null;
                  const label = m.full_name.split(' ')[0] + "'s team";
                  return (
                    <button
                      key={id}
                      onClick={() => setOrgScope(id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm transition-colors',
                        orgScope === id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {orgLoading || linesLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <TeamRollupView
                quarter={quarter}
                members={membersFor(scopedOrgUserIds)}
                priorities={orgPriorities.filter(p => scopedOrgUserIds.includes(p.user_id))}
                commitments={orgCommitments.filter(c => scopedOrgUserIds.includes(c.user_id))}
                currentUserId={scopedRootId}
                reportingLines={reportingLines}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
