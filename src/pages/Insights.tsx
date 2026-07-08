import { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useActiveQuarter, useTeamCommitments } from '@/hooks/useCommitments';
import { usePriorityAnalysis, type PriorityCategory } from '@/hooks/usePriorityAnalysis';
import { useRoles } from '@/hooks/useRoles';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { QuarterSelector } from '@/components/commitments/QuarterSelector';
import { ManagerSignalsPanel } from '@/components/insights/ManagerSignalsPanel';
import { cn } from '@/lib/utils';

const CATEGORY_OPTIONS: { value: PriorityCategory; label: string; color: string }[] = [
  { value: 'churn_reduction', label: 'Churn Reduction', color: '#4A5D5F' },
  { value: 'net_new_functionality', label: 'Net New Functionality', color: '#4A5D5F' },
  { value: 'net_new_accounts', label: 'Net New Accounts', color: '#7B9E89' },
  { value: 'uncategorized', label: 'Uncategorized', color: '#9CA3AF' },
];

function PercentageBar({ breakdown }: { breakdown: { category: PriorityCategory; label: string; count: number; percentage: number; color: string }[] }) {
  const categorized = breakdown.filter(b => b.category !== 'uncategorized' && b.count > 0);
  const uncategorized = breakdown.find(b => b.category === 'uncategorized');

  if (categorized.length === 0 && (!uncategorized || uncategorized.count === 0)) {
    return <div className="text-sm text-muted-foreground">No items to analyze</div>;
  }

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        {breakdown.filter(b => b.count > 0).map(b => (
          <div
            key={b.category}
            className="flex items-center justify-center text-xs font-medium text-white transition-all"
            style={{ width: `${b.percentage}%`, backgroundColor: b.color, minWidth: b.count > 0 ? '2rem' : 0 }}
            title={`${b.label}: ${b.count} (${b.percentage}%)`}
          >
            {b.percentage >= 10 ? `${b.percentage}%` : ''}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {breakdown.filter(b => b.count > 0).map(b => (
          <div key={b.category} className="flex items-center gap-2 text-sm">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
            <span className="text-muted-foreground">{b.label}</span>
            <span className="font-semibold">{b.count} ({b.percentage}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryPicker({
  currentCategory,
  onSelect,
}: {
  currentCategory: PriorityCategory;
  onSelect: (cat: PriorityCategory) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {CATEGORY_OPTIONS.filter(o => o.value !== 'uncategorized').map(opt => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
            currentCategory === opt.value
              ? 'text-white'
              : 'border-border bg-background text-muted-foreground hover:bg-muted',
          )}
          style={currentCategory === opt.value ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface Profile {
  id: string;
  full_name: string;
}

export default function Insights() {
  const { isAdmin, isSuperAdmin, loading: rolesLoading } = useRoles();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);

  // Manager-signals access gate (PLAN_idea9_manager_signals.md §6/§8): this
  // section is for the direct manager, not gated on admin status. `useTeamMembers`
  // reads cos_team_members scoped to the current user via RLS, so an empty
  // result here just means "no direct reports tracked yet," not a denial.
  const cosMembers = useTeamMembers(currentUserId);
  const hasDirectReports = useMemo(
    () => cosMembers.some((m) => m.relationship_type === 'direct_report'),
    [cosMembers],
  );

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { setBootstrapLoading(false); return; }
      setCurrentUserId(uid);

      const { data: membership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', uid)
        .limit(1)
        .single();

      if (!membership) { setBootstrapLoading(false); return; }
      setTeamId(membership.team_id);

      const { data: members } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', membership.team_id);

      const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', memberIds);
        setTeamMembers((profiles ?? []) as Profile[]);
      }
      setBootstrapLoading(false);
    }
    load();
  }, []);

  const { quarter, quarters, loading: quarterLoading, setQuarter } = useActiveQuarter();

  const allUserIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);
  const { priorities, commitments, loading: dataLoading } = useTeamCommitments(quarter?.id ?? null, allUserIds);

  const { summary, getCategory, setCategorization, loading: catLoading } = usePriorityAnalysis(
    quarter?.id ?? null,
    priorities,
    commitments,
  );

  const profileById = useMemo(() => {
    const map: Record<string, Profile> = {};
    teamMembers.forEach(m => { map[m.id] = m; });
    return map;
  }, [teamMembers]);

  const loading = bootstrapLoading || rolesLoading || quarterLoading;
  const canSeeAdminAnalysis = isAdmin || isSuperAdmin;

  // Access control (PLAN_idea9_manager_signals.md §6.1): the coaching-signals
  // section below is scoped to "has at least one direct report," independent
  // of admin status — an admin who isn't the direct manager has no reason to
  // see another manager's coaching notes, and a non-admin manager should still
  // see their own. Only block the page entirely if the user is neither an
  // admin nor a manager with direct reports.
  if (!rolesLoading && !canSeeAdminAnalysis && !hasDirectReports) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">
          This page is available to admins and to managers with direct reports.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // A manager with direct reports but no admin access still gets the coaching
  // panel even without an active RCDO quarter — the quarter gate below only
  // applies to the admin priority-analysis sections.
  if (!quarter && !hasDirectReports) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="mt-4 text-muted-foreground">No active quarter. Create one in the Commitments tab first.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Insights</h1>
          <p className="text-sm text-muted-foreground">
            {canSeeAdminAnalysis && quarter
              ? <>Priority &amp; commitment analysis &mdash; {quarter.label}</>
              : 'Coaching signals for your direct reports'}
          </p>
        </div>
        {canSeeAdminAnalysis && quarter && (
          <QuarterSelector
            quarters={quarters}
            selected={quarter}
            onSelect={setQuarter}
            isAdmin={false}
          />
        )}
      </div>

      {/* Manager coaching signals (Idea #9) — visible to any manager with direct
          reports, regardless of admin status. Rendered above the admin-only
          priority analysis so it isn't buried under unrelated team-wide content. */}
      {hasDirectReports && (
        <section>
          <ManagerSignalsPanel managerId={currentUserId} />
        </section>
      )}

      {/* Everything below is the pre-existing admin-only RCDO priority/commitment
          analysis — unchanged, still gated on admin status. */}
      {canSeeAdminAnalysis && quarter && (
      <>
      {/* Overall breakdown */}
      <section className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Overall Breakdown</h2>
        <p className="text-sm text-muted-foreground">
          {summary.totalItems} total items &mdash; {summary.categorizedItems} categorized, {summary.uncategorizedItems} uncategorized
        </p>
        {dataLoading || catLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <PercentageBar breakdown={summary.breakdown} />
        )}
      </section>

      {/* Priorities vs Commitments side-by-side */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-semibold">Quarterly Priorities</h2>
          <p className="text-xs text-muted-foreground">{priorities.length} priorities</p>
          {dataLoading || catLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <PercentageBar breakdown={summary.priorityBreakdown} />
          )}
        </section>

        <section className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-semibold">Monthly Commitments</h2>
          <p className="text-xs text-muted-foreground">{commitments.length} commitments</p>
          {dataLoading || catLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <PercentageBar breakdown={summary.commitmentBreakdown} />
          )}
        </section>
      </div>

      {/* Item-level categorization */}
      <section className="rounded-xl border bg-white p-6 shadow-sm space-y-6">
        <h2 className="text-lg font-semibold">Categorize Items</h2>
        <p className="text-sm text-muted-foreground">
          Click a category chip to tag each priority or commitment.
        </p>

        {/* Priorities */}
        {priorities.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Priorities</h3>
            <div className="divide-y rounded-lg border">
              {priorities.map(p => {
                const owner = profileById[p.user_id];
                return (
                  <div key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.title}</div>
                      <div className="text-xs text-muted-foreground">{owner?.full_name ?? 'Unknown'}</div>
                    </div>
                    <CategoryPicker
                      currentCategory={getCategory('priority', p.id)}
                      onSelect={(cat) => setCategorization('priority', p.id, cat)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Commitments */}
        {commitments.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Commitments</h3>
            <div className="divide-y rounded-lg border">
              {commitments.map(c => {
                const owner = profileById[c.user_id];
                return (
                  <div key={c.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {owner?.full_name ?? 'Unknown'} &middot; Month {c.month_number}
                      </div>
                    </div>
                    <CategoryPicker
                      currentCategory={getCategory('commitment', c.id)}
                      onSelect={(cat) => setCategorization('commitment', c.id, cat)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {priorities.length === 0 && commitments.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Nothing to analyze yet</p>
            <p>Add quarterly priorities and monthly commitments in the <strong>Commitments</strong> tab to see analysis here.</p>
          </div>
        )}
      </section>
      </>
      )}
    </div>
  );
}
