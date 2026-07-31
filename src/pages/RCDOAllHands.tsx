import { useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActiveCycle, useRallyingCry, useCycles } from '@/hooks/useRCDO';
import { useCycleAllSIs, type AllHandsSIRow, type CheckinStatus } from '@/hooks/useCycleAllSIs';
import { useRCDODetail } from '@/contexts/RCDODetailContext';
import { ProgressBadge, PercentCell, DeltaCell } from '@/components/rcdo/SIProgressCells';

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

// Worst-status-wins so a DO reads "at risk" the moment any of its SIs does.
const STATUS_PRIORITY: Record<CheckinStatus, number> = {
  off_track: 3,
  at_risk: 2,
  on_track: 1,
  unknown: 0,
};

interface DOGroup {
  doId: string;
  doNumber: string;
  doTitle: string;
  rows: (AllHandsSIRow & { siNumber: string })[];
  rollupStatus: CheckinStatus;
  rollupPercent: number | null;
  rollupPriorPercent: number | null;
  rollupPriorDate: string | null;
}

export default function RCDOAllHands() {
  const [searchParams] = useSearchParams();
  const cycleParam = searchParams.get('cycle') || undefined;
  const { setNavState } = useRCDODetail();

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

  // Publish nav state to the persistent layout — clear DO/SI/task selection
  useEffect(() => {
    if (!rallyingCry?.id) return;
    setNavState({
      rallyingCryId: rallyingCry.id,
      cycleId,
      currentDOId: undefined,
      currentSIId: undefined,
      currentTaskId: undefined,
    });
  }, [rallyingCry?.id, cycleId]);

  // Group rows by DO, numbering them like the canvas tree (1.0, 1.1, 1.2…)
  // and rolling up a DO-level status/% so the DO itself reads as a summary row.
  const grouped = useMemo<DOGroup[]>(() => {
    const map = new Map<string, AllHandsSIRow[]>();
    for (const r of rows) {
      const list = map.get(r.doId) ?? [];
      list.push(r);
      map.set(r.doId, list);
    }
    return Array.from(map.entries()).map(([doId, list], doIdx) => {
      const doNumber = `${doIdx + 1}.0`;
      const numberedRows = list.map((r, siIdx) => ({ ...r, siNumber: `${doIdx + 1}.${siIdx + 1}` }));

      const worstStatus = list.reduce<CheckinStatus>(
        (worst, r) => (STATUS_PRIORITY[r.status] > STATUS_PRIORITY[worst] ? r.status : worst),
        'unknown',
      );

      const percents = list.map((r) => r.latestPercent).filter((p): p is number => p !== null);
      const rollupPercent = percents.length > 0 ? percents.reduce((a, b) => a + b, 0) / percents.length : null;

      const priorPercents = list.filter((r) => r.priorPercent !== null && r.priorCheckinDate !== null);
      const rollupPriorPercent =
        priorPercents.length > 0
          ? priorPercents.reduce((a, r) => a + (r.priorPercent ?? 0), 0) / priorPercents.length
          : null;
      const rollupPriorDate =
        priorPercents.length > 0
          ? priorPercents.reduce((latest, r) => (r.priorCheckinDate! > latest ? r.priorCheckinDate! : latest), priorPercents[0].priorCheckinDate!)
          : null;

      return {
        doId,
        doNumber,
        doTitle: list[0]?.doTitle ?? '',
        rows: numberedRows,
        rollupStatus: worstStatus,
        rollupPercent,
        rollupPriorPercent,
        rollupPriorDate,
      };
    });
  }, [rows]);

  return (
    <div className="space-y-6">
      <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Rally Cry
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#2C2C2C]">
            {rallyingCry?.title || (shellLoading ? 'Loading…' : 'No active rallying cry')}
          </h1>
          {cycleMeta && (
            <p className="text-sm text-muted-foreground mt-1">
              {format(parseLocalDate(cycleMeta.start_date), 'MMM d, yyyy')} –{' '}
              {format(parseLocalDate(cycleMeta.end_date), 'MMM d, yyyy')}
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
                  grouped.flatMap((group) => [
                    <TableRow key={`${group.doId}-header`} className="align-top bg-muted/40 border-b-2 border-border hover:bg-muted/40">
                      <TableCell className="py-3" rowSpan={group.rows.length + 1}>
                        <OwnerCell row={group.rows[0]} />
                      </TableCell>
                      <TableCell className="py-3 text-sm font-semibold">
                        {group.doNumber} {group.doTitle}
                      </TableCell>
                      <TableCell className="py-3"><ProgressBadge status={group.rollupStatus} /></TableCell>
                      <TableCell className="py-3"><PercentCell value={group.rollupPercent} /></TableCell>
                      <TableCell className="py-3">
                        <DeltaCell
                          latestPercent={group.rollupPercent}
                          priorPercent={group.rollupPriorPercent}
                          priorCheckinDate={group.rollupPriorDate}
                        />
                      </TableCell>
                    </TableRow>,
                    ...group.rows.map((row) => (
                      <TableRow key={row.siId} className="align-top">
                        <TableCell className="py-3 text-sm pl-8 text-muted-foreground">
                          <span className="text-xs font-medium text-muted-foreground/70 mr-1.5">{row.siNumber}</span>
                          {row.siTitle}
                        </TableCell>
                        <TableCell className="py-3"><ProgressBadge status={row.status} /></TableCell>
                        <TableCell className="py-3"><PercentCell value={row.latestPercent} /></TableCell>
                        <TableCell className="py-3"><DeltaCell latestPercent={row.latestPercent} priorPercent={row.priorPercent} priorCheckinDate={row.priorCheckinDate} /></TableCell>
                      </TableRow>
                    )),
                  ])
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
    </div>
  );
}
