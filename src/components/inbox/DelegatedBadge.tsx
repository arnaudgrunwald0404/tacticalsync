import { formatDistanceToNowStrict, format } from 'date-fns';
import { User, ArrowRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Person-delegation badges (Idea #8, PLAN §8.3). Deliberately distinct from
 * the AI-agent DelegationStatusRow (bot icon, "Assistant is planning…") —
 * these use a person icon so a user can tell at a glance, without reading
 * text, whether a colleague or the AI assistant is on an item.
 *
 * Always visible (not hover-only): the whole point is a scannable paper
 * trail, so the "who" and "since when" must be readable without a click.
 * Hovering/tapping the badge expands to the full tooltip with the exact
 * date and any note.
 */

function shortRelative(dateIso: string): string {
  // "3d" / "2h" / "5m" — compact form for the always-visible badge; the
  // tooltip carries the precise date.
  const full = formatDistanceToNowStrict(new Date(dateIso));
  return full
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd')
    .replace(/ months?/, 'mo')
    .replace(/ years?/, 'y');
}

interface WaitingOnBadgeProps {
  delegateeName: string;
  since: string;
  note?: string | null;
}

/** Delegator-side: "Waiting on Alex · 3d" — replaces the generic
 *  "Waiting on someone" chip once a real delegatee exists. */
export function WaitingOnBadge({ delegateeName, since, note }: WaitingOnBadgeProps) {
  const firstName = delegateeName.split(' ')[0];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-medium whitespace-nowrap max-w-full truncate cursor-default"
        >
          <User className="h-2.5 w-2.5 flex-shrink-0" />
          Waiting on {firstName} · {shortRelative(since)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium">Waiting on {delegateeName}</p>
        <p className="text-xs text-muted-foreground">Delegated {format(new Date(since), 'MMM d, yyyy')}</p>
        {note && <p className="text-xs text-muted-foreground mt-1 italic">"{note}"</p>}
      </TooltipContent>
    </Tooltip>
  );
}

interface FromBadgeProps {
  delegatorName: string;
  since: string;
  note?: string | null;
}

/** Delegatee-side: "↳ From Dan · 3 days ago" — a persistent origin marker on
 *  every delegated item, per PLAN §8.3 ("don't make this discoverable only
 *  on hover"). */
export function FromBadge({ delegatorName, since, note }: FromBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-indigo-600 bg-indigo-50 whitespace-nowrap max-w-full truncate cursor-default">
          <ArrowRight className="h-2.5 w-2.5 flex-shrink-0 rotate-90" />
          From {delegatorName} · {shortRelative(since)} ago
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium">Delegated by {delegatorName}</p>
        <p className="text-xs text-muted-foreground">{format(new Date(since), 'MMM d, yyyy')}</p>
        {note && <p className="text-xs text-muted-foreground mt-1 italic">"{note}"</p>}
      </TooltipContent>
    </Tooltip>
  );
}
