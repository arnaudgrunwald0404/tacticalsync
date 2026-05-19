import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DetailPageLayout } from '@/components/rcdo/DetailPageLayout';
import { useActiveCycle, useRallyingCry, useCycles } from '@/hooks/useRCDO';
import { useCycleAllSIs, type AllHandsSIRow, type CheckinStatus } from '@/hooks/useCycleAllSIs';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<CheckinStatus, string> = {
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

function ProgressBadge({ status }: { status: CheckinStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap font-medium', STATUS_TEXT[status])}>
      <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function PercentCell({ value }: { value: number | null }) {
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

function DeltaCell({ row }: { row: AllHandsSIRow }) {
  if (row.priorPercent === null || row.priorCheckinDate === null) {
    return <span className="text-xs text-muted-foreground italic">—</span>;
  }
  const direction =
    row.latestPercent === null
      ? null
      : row.latestPercent > row.priorPercent
        ? 'Up'
        : row.latestPercent < row.priorPercent
          ? 'Down'
          : 'Flat';
  const month = format(new Date(row.priorCheckinDate), 'MMMM');
  const verb = direction === 'Flat' || direction === null ? 'from' : `${direction} from`;
  return (
    <span className="text-xs text-muted-foreground italic whitespace-nowrap">
      {verb} {Math.round(row.priorPercent)}% in {month}
    </span>
  );
}

function OwnerCell({ row }: { row: AllHandsSIRow }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <FancyAvatar
        name={row.doOwnerAvatarName || row.doOwnerName}
        displayName={row.doOwnerName}
        avatarUrl={row.doOwnerAvatarUrl ?? undefined}
        size="sm"
      />
      <span className="text-sm font-medium truncate">{row.doOwnerName}</span>
    </div>
  );
}

export default function RCDOAllHands() {
  const [searchParams] = useSearchParams();
  const cycleParam = searchParams.get('cycle') || undefined;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { cycle: activeCycle, loading: activeCycleLoading } = useActiveCycle();
  const { cycles, loading: cyclesLoading } = useCycles();

  const cycleId = useMemo(() => {
    if (cycleParam) return cycleParam;
    return activeCycle?.id;
  }, [cycleParam, activeCycle?.id]);

  const cycleMeta = useMemo(() => {
    if (!cycleId) return null;
    return cycles.find((c) => c.id === cycleId) || (activeCycle?.id === cycleId ? activeCycle : null);
  }, [cycleId, cycles, activeCycle]);

  const { rallyingCry, loading: rcLoading } = useRallyingCry(cycleId);
  const { rows, loading: rowsLoading } = useCycleAllSIs(rallyingCry?.id);

  const shellLoading = activeCycleLoading || cyclesLoading || rcLoading;
  const tableLoading = shellLoading || rowsLoading;

  // Group rows visually by DO so the owner column reads as a section header
  const grouped = useMemo(() => {
    const map = new Map<string, AllHandsSIRow[]>();
    for (const r of rows) {
      const list = map.get(r.doId) ?? [];
      list.push(r);
      map.set(r.doId, list);
    }
    return Array.from(map.entries()).map(([doId, list]) => ({
      doId,
      doTitle: list[0]?.doTitle ?? '',
      rows: list,
    }));
  }, [rows]);

  return (
    <DetailPageLayout
      rallyingCryId={rallyingCry?.id ?? ''}
      cycleId={cycleId}
      mobileNavOpen={mobileNavOpen}
      onMobileNavOpenChange={setMobileNavOpen}
      loading={shellLoading}
    >
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            All-hands progress
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#2C2C2C]">
            {rallyingCry?.title || (shellLoading ? 'Loading…' : 'No active rallying cry')}
          </h1>
          {cycleMeta && (
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(cycleMeta.start_date), 'MMM d, yyyy')} –{' '}
              {format(new Date(cycleMeta.end_date), 'MMM d, yyyy')}
            </p>
          )}
        </header>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#2C3E50] hover:bg-[#2C3E50]">
                  <TableHead className="text-white font-semibold w-[180px]">DO Owner</TableHead>
                  <TableHead className="text-white font-semibold">Strategic Initiative</TableHead>
                  <TableHead className="text-white font-semibold w-[140px]">Progress</TableHead>
                  <TableHead className="text-white font-semibold w-[180px]">% Complete</TableHead>
                  <TableHead className="text-white font-semibold w-[180px]">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full max-w-md" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-2 w-full" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                      No strategic initiatives have been created for this cycle yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.flatMap((group) =>
                    group.rows.map((row, idx) => (
                      <TableRow key={row.siId} className="align-top">
                        <TableCell className="py-3">
                          {idx === 0 ? <OwnerCell row={row} /> : null}
                        </TableCell>
                        <TableCell className="py-3 text-sm">{row.siTitle}</TableCell>
                        <TableCell className="py-3"><ProgressBadge status={row.status} /></TableCell>
                        <TableCell className="py-3"><PercentCell value={row.latestPercent} /></TableCell>
                        <TableCell className="py-3"><DeltaCell row={row} /></TableCell>
                      </TableRow>
                    )),
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </DetailPageLayout>
  );
}
