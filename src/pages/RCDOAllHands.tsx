import { useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActiveCycle, useRallyingCry, useCycles } from '@/hooks/useRCDO';
import { useCycleAllSIs, type AllHandsSIRow } from '@/hooks/useCycleAllSIs';
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
                  grouped.flatMap((group) =>
                    group.rows.map((row, idx) => (
                      <TableRow key={row.siId} className="align-top">
                        <TableCell className="py-3">
                          {idx === 0 ? <OwnerCell row={row} /> : null}
                        </TableCell>
                        <TableCell className="py-3 text-sm">{row.siTitle}</TableCell>
                        <TableCell className="py-3"><ProgressBadge status={row.status} /></TableCell>
                        <TableCell className="py-3"><PercentCell value={row.latestPercent} /></TableCell>
                        <TableCell className="py-3"><DeltaCell latestPercent={row.latestPercent} priorPercent={row.priorPercent} priorCheckinDate={row.priorCheckinDate} /></TableCell>
                      </TableRow>
                    )),
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
    </div>
  );
}
