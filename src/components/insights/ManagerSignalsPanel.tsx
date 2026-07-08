import { useState, useMemo } from 'react';
import { Info, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  useManagerSignals,
  MIN_ITEMS_FOR_RATE,
  type ManagerCloseRateSummary,
  type ManagerAgingItem,
} from '@/hooks/useManagerSignals';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Manager load & health signals (Idea #9) — PLAN_idea9_manager_signals.md
//
// FRAMING IS LOAD-BEARING HERE, NOT DECORATION. Every string in this file must
// keep the manager as the grammatical subject ("items you've tagged", "your
// notes") and never the report ("Jane hasn't...") — see plan §2.2 and §4.
// This is because cos_team_members has no verified link to a report's own
// account: everything here is the manager's own inbox activity reflected back
// to them, not the report's behavior. If you're editing copy in this file,
// re-read plan §4 and §8a before changing any string.
//
// No cross-report ranking/leaderboard: reports are listed alphabetically
// (the hook already orders by member_name), never sorted by rate — see §4.1.
// ─────────────────────────────────────────────────────────────────────────────

const SEEN_CALLOUT_KEY = 'ts.managerSignals.seenWhatsNew';

const DISCLAIMER_COPY =
  "This reflects your own notes and tasks about this person — not their work or performance. " +
  "It's built from items you tagged to them in your inbox, so it's only as complete as your own tagging habits.";

function DisclaimerTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="What does this signal mean?"
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
        {DISCLAIMER_COPY}
      </TooltipContent>
    </Tooltip>
  );
}

function WhatsNewCallout({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">New: Coaching prep for your direct reports</p>
        <p className="text-sm text-muted-foreground">
          Before: no visibility into follow-through on things you'd noted for your reports.
          Now: a coaching-prep view of your own open items per person — what's still open,
          what's been waiting a while, all pulled from your own inbox notes. Nothing here is
          about their performance; it's a mirror on your own tracking, meant to prep for your
          next 1:1.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function EmptyNoReportsYet() {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground space-y-1">
      <p className="font-medium text-foreground">Nothing to show yet</p>
      <p>
        Tag inbox items to a direct report's name to start building a coaching view here —
        open items, follow-ups, and things worth raising in your next 1:1.
      </p>
    </div>
  );
}

function LowDataNotice({ total }: { total: number }) {
  return (
    <p className="text-sm text-muted-foreground">
      Not enough tagged items yet this period ({total} so far). Check back after a few more
      1:1s, or tag a few more notes to them.
    </p>
  );
}

function CloseRateCard({ summary }: { summary: ManagerCloseRateSummary }) {
  const open = summary.total - summary.done;
  return (
    <div className="rounded-xl border bg-white p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{summary.memberName}</h4>
        <DisclaimerTooltip />
      </div>
      {summary.hasEnoughData ? (
        <p className="text-sm text-foreground">
          {open > 0
            ? `${open} of ${summary.total} items from the last 30 days are still open — worth a check-in?`
            : `All ${summary.total} items you tagged to ${summary.memberName} in the last 30 days are closed out.`}
        </p>
      ) : (
        <LowDataNotice total={summary.total} />
      )}
    </div>
  );
}

function AgingItemsList({ memberName, items }: { memberName: string; items: ManagerAgingItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border bg-white p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Waiting on {memberName}</h4>
        <DisclaimerTooltip />
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.itemId} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{item.text}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                item.urgency === 'critical' && 'bg-red-100 text-red-700',
                item.urgency === 'warning' && 'bg-amber-100 text-amber-700',
                item.urgency === 'normal' && 'bg-muted text-muted-foreground',
              )}
            >
              {item.daysStale}d
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ManagerSignalsPanelProps {
  managerId: string | null;
}

export function ManagerSignalsPanel({ managerId }: ManagerSignalsPanelProps) {
  const members = useTeamMembers(managerId);
  const { closeRates, agingItemsForMember, loading } = useManagerSignals(managerId, 30);

  const [dismissedCallout, setDismissedCallout] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(SEEN_CALLOUT_KEY) === '1',
  );

  const dismissCallout = () => {
    setDismissedCallout(true);
    try { localStorage.setItem(SEEN_CALLOUT_KEY, '1'); } catch { /* best-effort */ }
  };

  const directReports = useMemo(
    () => members.filter((m) => m.relationship_type === 'direct_report'),
    [members],
  );

  const closeRateByMember = useMemo(() => {
    const map = new Map<string, ManagerCloseRateSummary>();
    closeRates.forEach((c) => map.set(c.memberId, c));
    return map;
  }, [closeRates]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const hasAnyTaggedActivity = closeRates.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Coaching prep</h2>
        <p className="text-sm text-muted-foreground">
          A coaching aid built from your own inbox notes about each direct report — not a
          performance scorecard.
        </p>
      </div>

      {!dismissedCallout && <WhatsNewCallout onDismiss={dismissCallout} />}

      {directReports.length === 0 || !hasAnyTaggedActivity ? (
        <EmptyNoReportsYet />
      ) : (
        // Alphabetical order only (per useTeamMembers/view ordering) — never sorted
        // by close rate or any other score, so this can't read as a leaderboard.
        <div className="grid gap-4 md:grid-cols-2">
          {directReports.map((member) => {
            const summary = closeRateByMember.get(member.id);
            const aging = agingItemsForMember(member.id);
            if (!summary && aging.length === 0) return null;
            return (
              <div key={member.id} className="space-y-3">
                {summary && <CloseRateCard summary={summary} />}
                <AgingItemsList memberName={member.name} items={aging} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ManagerSignalsPanel;
