import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { StatusBadge, nextStatus } from './StatusBadge';
import { PrioritySlot } from './PrioritySlot';
import { CommitmentCell } from './CommitmentCell';
import { cn } from '@/lib/utils';
import type {
  CommitmentQuarter,
  CommitmentStatus,
  QuarterlyPriority,
  MonthlyCommitment,
  TeamReportingLine,
  UpsertPriorityForm,
  UpsertCommitmentForm,
} from '@/types/commitments';
import { getQuarterMonths } from '@/types/commitments';

const borderByStatus: Record<CommitmentStatus, string> = {
  draft:       'border-gray-300/50',
  in_progress: 'border-yellow-400/60',
  done:        'border-green-500/60',
  not_done:    'border-red-500/60',
};

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  avatar_name: string | null;
}

interface EditCallbacks {
  onUpsertPriority: (form: UpsertPriorityForm) => Promise<QuarterlyPriority | null>;
  onDeletePriority: (id: string) => Promise<void>;
  onUpsertCommitment: (form: UpsertCommitmentForm) => Promise<MonthlyCommitment | null>;
  onDeleteCommitment: (id: string) => Promise<void>;
  onCommitmentStatusChange: (id: string, status: CommitmentStatus) => Promise<void>;
  onPriorityStatusChange: (id: string, status: CommitmentStatus) => Promise<void>;
  onToggleCommitmentFlagged?: (id: string, flagged: boolean) => Promise<void>;
  onTogglePriorityFlagged?: (id: string, flagged: boolean) => Promise<void>;
}

interface TeamRollupViewProps {
  quarter: CommitmentQuarter;
  members: TeamMember[];
  priorities: QuarterlyPriority[];
  commitments: MonthlyCommitment[];
  currentUserId?: string;
  reportingLines?: TeamReportingLine[];
  editableUserId?: string;
  editAll?: boolean;
  editCallbacks?: EditCallbacks;
}

// ─── Editable member card (for the current user) ────────────────────────────

function EditableMemberCard({
  member,
  quarter,
  priorities,
  commitments,
  monthLabels,
  depth = 0,
  callbacks,
}: {
  member: TeamMember;
  quarter: CommitmentQuarter;
  priorities: QuarterlyPriority[];
  commitments: MonthlyCommitment[];
  monthLabels: string[];
  depth?: number;
  callbacks: EditCallbacks;
}) {
  const [monthsExpanded, setMonthsExpanded] = useState(false);
  const myPriorities = priorities.filter(p => p.user_id === member.id).sort((a, b) => a.display_order - b.display_order);
  const myCommitments = commitments.filter(c => c.user_id === member.id);
  const byMonth = (m: number) => myCommitments.filter(c => c.month_number === m).sort((a, b) => a.display_order - b.display_order);
  const indentPx = depth * 24;

  const priorityAt = (order: number) => myPriorities.find(p => p.display_order === order);
  const commitmentsFor = (month: number, order: number) =>
    myCommitments.find(c => c.month_number === month && c.display_order === order);

  const handleSavePriority = useCallback(async (order: number, title: string) => {
    const existing = priorityAt(order);
    await callbacks.onUpsertPriority({
      ...(existing ? { id: existing.id } : {}),
      quarter_id: quarter.id,
      user_id: member.id,
      title,
      display_order: order,
    });
  }, [myPriorities, quarter.id, member.id, callbacks.onUpsertPriority]);

  const handleSaveCommitment = useCallback(async (month: number, order: number, title: string) => {
    const existing = commitmentsFor(month, order);
    await callbacks.onUpsertCommitment({
      ...(existing ? { id: existing.id } : {}),
      quarter_id: quarter.id,
      user_id: member.id,
      month_number: month,
      title,
      display_order: order,
    });
  }, [myCommitments, quarter.id, member.id, callbacks.onUpsertCommitment]);

  return (
    <div
      className={cn('border-b border-border/40 last:border-b-0', depth > 0 && 'bg-muted/5')}
      style={{ paddingLeft: `${indentPx}px` }}
    >
      <div className="px-4 py-4 space-y-3">
        {/* Person header */}
        <div className="flex items-center gap-3">
          {depth > 0 && (
            <span className="flex-shrink-0 text-border text-xs">{'└'}</span>
          )}
          <FancyAvatar
            name={member.avatar_name ?? member.full_name}
            displayName={member.full_name}
            avatarUrl={member.avatar_url}
            size="sm"
          />
          <span className="text-sm font-semibold">{member.full_name}</span>
          <div className="ml-auto flex flex-shrink-0 gap-1">
            {myCommitments.slice(0, 9).map(c => {
              const colors: Record<string, string> = {
                done: 'bg-green-500', in_progress: 'bg-yellow-400',
                not_done: 'bg-red-500', draft: 'bg-gray-300',
              };
              return <span key={c.id} className={cn('h-2 w-2 rounded-full', colors[c.status])} />;
            })}
          </div>
        </div>

        {/* Q Priorities — editable */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Q Priorities
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[1, 2, 3].map(order => (
              <PrioritySlot
                key={order}
                order={order}
                priority={priorityAt(order)}
                onSave={title => handleSavePriority(order, title)}
                onDelete={() => { const p = priorityAt(order); if (p) callbacks.onDeletePriority(p.id); return Promise.resolve(); }}
                onStatusChange={status => { const p = priorityAt(order); return p ? callbacks.onPriorityStatusChange(p.id, status) : Promise.resolve(); }}
                onToggleFlagged={flagged => { const p = priorityAt(order); return p && callbacks.onTogglePriorityFlagged ? callbacks.onTogglePriorityFlagged(p.id, flagged) : Promise.resolve(); }}
              />
            ))}
          </div>
        </div>

        {/* Monthly commitments — collapsible + editable */}
        <div>
          <button
            onClick={() => setMonthsExpanded(e => !e)}
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="text-muted-foreground/50">
              {monthsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
            Monthly Commitments
            {myCommitments.length > 0 && (
              <span className="font-normal normal-case tracking-normal text-muted-foreground/50">
                ({myCommitments.length})
              </span>
            )}
          </button>

          {monthsExpanded && (
            <div className="mt-2 grid grid-cols-3 gap-4">
              {[1, 2, 3].map((monthNum, idx) => (
                <div key={monthNum} className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {monthLabels[idx]}
                  </p>
                  {[1, 2, 3].map(order => (
                    <CommitmentCell
                      key={order}
                      commitment={commitmentsFor(monthNum, order)}
                      quarterId={quarter.id}
                      userId={member.id}
                      monthNumber={monthNum}
                      displayOrder={order}
                      onSave={title => handleSaveCommitment(monthNum, order, title)}
                      onDelete={() => {
                        const c = commitmentsFor(monthNum, order);
                        return c ? callbacks.onDeleteCommitment(c.id) : Promise.resolve();
                      }}
                      onStatusChange={status => {
                        const c = commitmentsFor(monthNum, order);
                        return c ? callbacks.onCommitmentStatusChange(c.id, status) : Promise.resolve();
                      }}
                      onToggleFlagged={flagged => {
                        const c = commitmentsFor(monthNum, order);
                        return c && callbacks.onToggleCommitmentFlagged ? callbacks.onToggleCommitmentFlagged(c.id, flagged) : Promise.resolve();
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Read-only member card ───────────────────────────────────────────────────

function ReadOnlyMemberCard({
  member,
  priorities,
  commitments,
  monthLabels,
  depth = 0,
}: {
  member: TeamMember;
  priorities: QuarterlyPriority[];
  commitments: MonthlyCommitment[];
  monthLabels: string[];
  depth?: number;
}) {
  const [monthsExpanded, setMonthsExpanded] = useState(false);
  const myPriorities = priorities.filter(p => p.user_id === member.id).sort((a, b) => a.display_order - b.display_order);
  const myCommitments = commitments.filter(c => c.user_id === member.id);
  const byMonth = (m: number) => myCommitments.filter(c => c.month_number === m).sort((a, b) => a.display_order - b.display_order);

  const isEmpty = myPriorities.length === 0 && myCommitments.length === 0;
  const indentPx = depth * 24;

  return (
    <div
      className={cn('border-b border-border/40 last:border-b-0', depth > 0 && 'bg-muted/5')}
      style={{ paddingLeft: `${indentPx}px` }}
    >
      <div className="px-4 py-4 space-y-3">
        {/* Person header */}
        <div className="flex items-center gap-3">
          {depth > 0 && (
            <span className="flex-shrink-0 text-border text-xs">{'└'}</span>
          )}
          <FancyAvatar
            name={member.avatar_name ?? member.full_name}
            displayName={member.full_name}
            avatarUrl={member.avatar_url}
            size="sm"
          />
          <span className="text-sm font-semibold">{member.full_name}</span>
          <div className="ml-auto flex flex-shrink-0 gap-1">
            {myCommitments.slice(0, 9).map(c => {
              const colors: Record<string, string> = {
                done: 'bg-green-500', in_progress: 'bg-yellow-400',
                not_done: 'bg-red-500', draft: 'bg-gray-300',
              };
              return <span key={c.id} className={cn('h-2 w-2 rounded-full', colors[c.status])} />;
            })}
          </div>
        </div>

        {isEmpty ? (
          <p className="text-xs text-muted-foreground/40 italic pl-1">No commitments yet</p>
        ) : (
          <>
            {/* Q Priorities — read-only cards */}
            {myPriorities.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Q Priorities
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {myPriorities.map((p, i) => (
                    <div key={p.id} className={cn('flex min-h-[3rem] gap-2 rounded-md border bg-card p-3', p.flagged ? 'border-l-[6px] border-l-red-500' : borderByStatus[p.status])}>
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <div className="flex-1 flex flex-col gap-1">
                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{p.title}</p>
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly commitments — collapsible */}
            {myCommitments.length > 0 && (
              <div>
                <button
                  onClick={() => setMonthsExpanded(e => !e)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="text-muted-foreground/50">
                    {monthsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </span>
                  Monthly Commitments
                  <span className="font-normal normal-case tracking-normal text-muted-foreground/50">
                    ({myCommitments.length})
                  </span>
                </button>

                {monthsExpanded && (
                  <div className="mt-2 grid grid-cols-3 gap-4">
                    {[1, 2, 3].map((month, idx) => (
                      <div key={month} className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {monthLabels[idx]}
                        </p>
                        {byMonth(month).length === 0 ? (
                          <p className="text-xs text-muted-foreground/40 italic">—</p>
                        ) : (
                          byMonth(month).map(c => (
                            <div key={c.id} className={cn('rounded-md border bg-card p-2 text-xs', c.flagged ? 'border-l-[6px] border-l-red-500' : borderByStatus[c.status])}>
                              <p className="whitespace-pre-line leading-relaxed text-foreground/80">{c.title}</p>
                              <StatusBadge status={c.status} className="mt-1" />
                            </div>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tree builder ────────────────────────────────────────────────────────────

function buildTree(
  rootId: string,
  members: TeamMember[],
  lines: TeamReportingLine[],
): { member: TeamMember; depth: number }[] {
  const memberById: Record<string, TeamMember> = {};
  members.forEach(m => { memberById[m.id] = m; });

  const childrenOf = (id: string) =>
    lines.filter(l => l.manager_id === id).map(l => l.report_id);

  const result: { member: TeamMember; depth: number }[] = [];
  const visited = new Set<string>();
  const stack: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }];

  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const m = memberById[id];
    if (m) result.push({ member: m, depth });
    const children = childrenOf(id);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ id: children[i], depth: depth + 1 });
    }
  }

  return result;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function TeamRollupView({
  quarter,
  members,
  priorities,
  commitments,
  currentUserId,
  reportingLines,
  editableUserId,
  editAll,
  editCallbacks,
}: TeamRollupViewProps) {
  const months = getQuarterMonths(quarter);
  const monthLabels = [months.month1, months.month2, months.month3];

  const orderedMembers: { member: TeamMember; depth: number }[] =
    currentUserId && reportingLines
      ? buildTree(currentUserId, members, reportingLines)
      : members.map(m => ({ member: m, depth: 0 }));

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 py-12 text-center text-sm text-muted-foreground">
        No direct reports found. Set up reporting lines in team settings.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      {orderedMembers.map(({ member, depth }) =>
        (editAll || editableUserId === member.id) && editCallbacks ? (
          <EditableMemberCard
            key={member.id}
            member={member}
            quarter={quarter}
            priorities={priorities}
            commitments={commitments}
            monthLabels={monthLabels}
            depth={depth}
            callbacks={editCallbacks}
          />
        ) : (
          <ReadOnlyMemberCard
            key={member.id}
            member={member}
            priorities={priorities}
            commitments={commitments}
            monthLabels={monthLabels}
            depth={depth}
          />
        ),
      )}
    </div>
  );
}
