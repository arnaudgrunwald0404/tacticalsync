import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import type {
  CommitmentQuarter,
  PersonalPriority,
  MonthlyCommitment,
  TeamReportingLine,
} from '@/types/commitments';
import { getQuarterMonths } from '@/types/commitments';

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  avatar_name: string | null;
}

interface TeamRollupViewProps {
  quarter: CommitmentQuarter;
  members: TeamMember[];
  priorities: PersonalPriority[];
  commitments: MonthlyCommitment[];
  /** When provided, renders a hierarchical tree rooted at this user */
  currentUserId?: string;
  reportingLines?: TeamReportingLine[];
}

function MemberRow({
  member,
  priorities,
  commitments,
  monthLabels,
  depth = 0,
}: {
  member: TeamMember;
  priorities: PersonalPriority[];
  commitments: MonthlyCommitment[];
  monthLabels: string[];
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const myPriorities = priorities.filter(p => p.user_id === member.id).sort((a, b) => a.display_order - b.display_order);
  const myCommitments = commitments.filter(c => c.user_id === member.id);
  const byMonth = (m: number) => myCommitments.filter(c => c.month_number === m).sort((a, b) => a.display_order - b.display_order);

  const isEmpty = myPriorities.length === 0 && myCommitments.length === 0;

  const indentPx = depth * 28;

  return (
    <div className={cn("border-b border-border/50 last:border-b-0", depth > 0 && "bg-muted/10")}>
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        style={{ paddingLeft: `${16 + indentPx}px` }}
      >
        {/* Tree connector line for indented rows */}
        {depth > 0 && (
          <span className="mr-1 flex-shrink-0 text-border">
            {'└'}
          </span>
        )}
        <span className="text-muted-foreground/50">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <FancyAvatar
          name={member.avatar_name ?? member.full_name}
          displayName={member.full_name}
          avatarUrl={member.avatar_url}
          size="sm"
        />
        <span className="w-28 flex-shrink-0 text-sm font-medium">{member.full_name}</span>

        {/* Priority pills preview */}
        <div className="flex flex-1 gap-2 overflow-hidden">
          {isEmpty ? (
            <span className="text-xs text-muted-foreground/40 italic">No commitments yet</span>
          ) : (
            myPriorities.slice(0, 3).map(p => (
              <span
                key={p.id}
                className="truncate rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
                title={p.title}
              >
                {p.title}
              </span>
            ))
          )}
        </div>

        {/* Status summary dots */}
        <div className="ml-auto flex flex-shrink-0 gap-1">
          {myCommitments.slice(0, 9).map(c => {
            const colors: Record<string, string> = {
              done: 'bg-green-500',
              in_progress: 'bg-yellow-400',
              at_risk: 'bg-red-500',
              pending: 'bg-gray-300',
            };
            return <span key={c.id} className={cn('h-2 w-2 rounded-full', colors[c.status])} />;
          })}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="bg-muted/20 px-4 pb-4 pt-2">
          <div className="grid grid-cols-4 gap-4">
            {/* Q Priorities column */}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Q Priorities
              </p>
              <div className="space-y-1.5">
                {myPriorities.length === 0 ? (
                  <p className="text-xs text-muted-foreground/40 italic">—</p>
                ) : (
                  myPriorities.map((p, i) => (
                    <div key={p.id} className="flex gap-2 text-xs">
                      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed text-foreground/80">{p.title}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Monthly columns */}
            {[1, 2, 3].map((month, idx) => (
              <div key={month}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {monthLabels[idx]}
                </p>
                <div className="space-y-1.5">
                  {byMonth(month).length === 0 ? (
                    <p className="text-xs text-muted-foreground/40 italic">—</p>
                  ) : (
                    byMonth(month).map(c => (
                      <div key={c.id} className="rounded border border-border/40 bg-card p-2 text-xs">
                        <p className="leading-relaxed text-foreground/80">{c.title}</p>
                        <StatusBadge status={c.status} className="mt-1" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Build a depth-annotated ordered list for tree rendering (DFS pre-order) */
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
  // Stack-based DFS: push children in reverse so first child is processed first
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

export function TeamRollupView({ quarter, members, priorities, commitments, currentUserId, reportingLines }: TeamRollupViewProps) {
  const months = getQuarterMonths(quarter);
  const monthLabels = [months.month1, months.month2, months.month3];

  // Build tree if org mode, otherwise flat list at depth 0
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
      {/* Column headers */}
      <div className="grid grid-cols-4 gap-4 border-b bg-muted/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <div className="col-span-1 flex items-center gap-[3.25rem]">
          <span className="w-28">Person</span>
          <span>Q Priorities</span>
        </div>
        <span>{months.month1}</span>
        <span>{months.month2}</span>
        <span>{months.month3}</span>
      </div>

      {orderedMembers.map(({ member, depth }) => (
        <MemberRow
          key={member.id}
          member={member}
          priorities={priorities}
          commitments={commitments}
          monthLabels={monthLabels}
          depth={depth}
        />
      ))}
    </div>
  );
}
