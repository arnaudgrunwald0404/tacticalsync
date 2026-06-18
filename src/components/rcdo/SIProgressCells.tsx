import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { CheckinStatus } from '@/hooks/useCycleAllSIs';

export const STATUS_LABEL: Record<CheckinStatus, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  off_track: 'Off Track',
  unknown: 'No update',
};

const STATUS_DOT: Record<CheckinStatus, string> = {
  on_track: 'bg-green-500',
  at_risk: 'bg-yellow-500',
  off_track: 'bg-red-500',
  unknown: 'bg-gray-300',
};

const STATUS_TEXT: Record<CheckinStatus, string> = {
  on_track: 'text-green-700',
  at_risk: 'text-yellow-700',
  off_track: 'text-red-700',
  unknown: 'text-gray-500',
};

export function ProgressBadge({ status }: { status: CheckinStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap font-medium', STATUS_TEXT[status])}>
      <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PercentCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <Progress value={value} className="h-2 flex-1" />
      <span className="text-sm font-medium tabular-nums w-10 text-right">{Math.round(value)}%</span>
    </div>
  );
}

export function DeltaCell({
  latestPercent,
  priorPercent,
  priorCheckinDate,
}: {
  latestPercent: number | null;
  priorPercent: number | null;
  priorCheckinDate: string | null;
}) {
  if (priorPercent === null || priorCheckinDate === null) {
    return <span className="text-xs text-muted-foreground italic">—</span>;
  }
  const direction =
    latestPercent === null
      ? null
      : latestPercent > priorPercent
        ? 'Up'
        : latestPercent < priorPercent
          ? 'Down'
          : 'Flat';
  const month = format(new Date(priorCheckinDate), 'MMMM');
  const verb = direction === 'Flat' || direction === null ? 'from' : `${direction} from`;
  return (
    <span className="text-xs text-muted-foreground italic whitespace-nowrap">
      {verb} {Math.round(priorPercent)}% in {month}
    </span>
  );
}
