import { CheckSquare, ArrowRight, PartyPopper, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dueBadge } from '@/components/cos/OneOnOnePrepDrawer';
import { useMyOneOnOneTodos } from '@/hooks/useMyOneOnOneTodos';
import type { CosTeamMember } from '@/pages/ChiefOfStaff';

// ── "My 1:1 To-Dos" — central aggregation across ALL one-on-ones ───────────
//
// TODO.md item 7 (flagged critical): today, "to-dos for me" captured in a 1:1
// prep are only visible one person at a time, inside that person's prep
// drawer. This view is the connective piece: every open "to-do for me" across
// every direct report / collaborator, in one place, without opening each
// prep. Clicking a to-do jumps straight into that person's prep drawer for
// full context. These items also sync into the Inbox in real time (see
// sync_cos_meeting_action_to_inbox) — this view is a 1:1-scoped lens on the
// same underlying data, not a separate list to keep in sync by hand.

const RELATIONSHIP_LABEL: Record<string, string> = {
  direct_report: 'Direct report',
  collaborator: 'Collaborator',
};

interface MyOneOnOneTodosPanelProps {
  members: CosTeamMember[];
  onOpenPrep: (member: CosTeamMember) => void;
}

export function MyOneOnOneTodosPanel({ members, onOpenPrep }: MyOneOnOneTodosPanelProps) {
  const { groupedByMember, overdueCount, loading, markDone } = useMyOneOnOneTodos();
  const totalOpen = groupedByMember.reduce((sum, g) => sum + g.todos.length, 0);

  const openMemberPrep = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (member) onOpenPrep(member);
  };

  if (loading && totalOpen === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading your 1:1 to-dos…
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-9 h-9 rounded-lg bg-accent grid place-items-center flex-shrink-0">
          <CheckSquare className="h-[18px] w-[18px] text-primary" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">My 1:1 To-Dos</h2>
          <p className="text-sm text-muted-foreground">
            Everything <span className="font-medium text-foreground">you</span> committed to across all your one-on-ones, in one place.
          </p>
        </div>
        {totalOpen > 0 && (
          <span className={cn(
            'ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-[11px] py-[3px] rounded-full flex-shrink-0',
            overdueCount > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
          )}>
            {overdueCount > 0 ? `${overdueCount} overdue` : `${totalOpen} open`}
          </span>
        )}
      </div>

      {totalOpen === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-6 py-16 text-center">
          <PartyPopper className="h-6 w-6 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">You&apos;re all caught up</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            No open to-dos for you across your one-on-ones. Anything you add for yourself in a
            1:1 prep — via &quot;Add for me&quot; — will show up here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {groupedByMember.map(group => (
            <div key={group.memberId} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => openMemberPrep(group.memberId)}
                className="w-full flex items-center gap-2.5 px-[18px] py-3 border-b border-border/60 hover:bg-muted/40 transition-colors text-left rounded-t-lg"
              >
                <span className="font-semibold text-sm">{group.memberName}</span>
                <span className="text-[11px] text-muted-foreground">{RELATIONSHIP_LABEL[group.relationshipType] ?? group.relationshipType}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary flex-shrink-0">
                  Open prep <ArrowRight className="h-3 w-3" />
                </span>
              </button>
              <div>
                {group.todos.map(todo => {
                  const badge = dueBadge(todo.due_date, false);
                  const DueIcon = badge.icon;
                  return (
                    <button
                      key={todo.id}
                      onClick={() => markDone(todo.id)}
                      className="w-full flex gap-3 items-start px-[18px] py-3 text-left border-b border-border/40 last:border-b-0 hover:bg-muted/40 transition-colors"
                      title="Mark done"
                    >
                      <span className="w-[18px] h-[18px] flex-shrink-0 mt-px rounded-[5px] border-[1.5px] border-input bg-background" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug">{todo.text}</div>
                        <span className={cn('inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold px-[9px] py-0.5 rounded-md', badge.cls)}>
                          <DueIcon className="h-3 w-3" />{badge.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11.5px] text-muted-foreground text-center mt-1 flex items-center justify-center gap-1.5">
            These also show up in your <a href="/inbox" className="underline underline-offset-2 hover:text-foreground inline-flex items-center gap-0.5">Inbox<ExternalLink className="h-3 w-3" /></a>.
          </p>
        </div>
      )}
    </div>
  );
}
