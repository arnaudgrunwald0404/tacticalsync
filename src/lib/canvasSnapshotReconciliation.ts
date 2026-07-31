// Pure reconciliation logic for the Strategy Canvas's cached snapshot
// (rc_canvas_states), extracted so it is unit-testable independent of React
// Flow, Supabase fetching, and the rest of StrategyCanvas.tsx's state.
//
// rc_canvas_states caches canvas node text (rallying cry / DO / SI titles,
// owner, metrics) alongside layout. Detail pages write straight to the
// canonical rc_* tables and never touch that cache, so once a snapshot
// exists it can silently drift from — or simply omit — what's in the
// canonical tables. This module overlays live rows onto the cached
// snapshot by dbId, keeping only layout (position/size/color) from the
// cache, and fixes the three concrete bugs found in production (24d0541,
// 0fdf149):
//   1. Stale cached text (title/hypothesis/owner/status/metric) is
//      overwritten with the current DB row on every load.
//   2. Cards that collapsed onto the same underlying SI dbId (e.g. from a
//      duplicate/copy) are deduped down to one.
//   3. DOs/SIs created from a Detail page after the snapshot was last saved
//      — and therefore missing from the cache entirely — are appended.

export interface RawCanvasNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DOReconcileRow {
  id: string;
  title: string;
  hypothesis?: string | null;
  owner_user_id?: string | null;
  status?: string | null;
  locked_at?: string | null;
  display_order?: number | null;
}

export interface SIReconcileRow {
  id: string;
  title: string;
  owner_user_id?: string | null;
  participant_user_ids?: string[] | null;
  description?: string | null;
  primary_success_metric?: string | null;
  benchmark?: string | null;
  status?: string | null;
  locked_at?: string | null;
  defining_objective_id: string;
}

export interface DOMetricRow {
  defining_objective_id: string;
  name: string;
}

export interface ReconcileCanvasSnapshotParams {
  loadedNodes: RawCanvasNode[];
  rallyingCry?: { id: string; title: string } | null;
  doRows: DOReconcileRow[];
  siRows: SIReconcileRow[];
  doMetrics: DOMetricRow[];
  /** Finds a non-overlapping position for a newly-appended DO node, given the DOs laid out so far. */
  findNonOverlappingPosition: (
    existing: RawCanvasNode[],
    type: 'do',
    startX: number,
    startY: number
  ) => { x: number; y: number };
}

export interface ReconcileCanvasSnapshotResult {
  nodes: RawCanvasNode[];
  /** Number of DO nodes appended because they existed in the DB but had no card on the cached canvas. */
  appendedDoCount: number;
}

function siCardFromRow(cardIdPrefix: string, siRow: SIReconcileRow): Record<string, unknown> {
  return {
    id: `si-${cardIdPrefix}-${siRow.id.slice(0, 6)}`,
    dbId: siRow.id,
    title: siRow.title,
    ownerId: siRow.owner_user_id || undefined,
    participantIds: Array.isArray(siRow.participant_user_ids) ? siRow.participant_user_ids : undefined,
    description: siRow.description || '',
    metric: siRow.primary_success_metric || '',
    benchmark: siRow.benchmark || '',
  };
}

export function reconcileCanvasSnapshot(
  params: ReconcileCanvasSnapshotParams
): ReconcileCanvasSnapshotResult {
  const { loadedNodes, rallyingCry, doRows, siRows, doMetrics, findNonOverlappingPosition } = params;

  const doRowById = new Map(doRows.map((d) => [d.id, d]));
  const sisByDoId = new Map<string, SIReconcileRow[]>();
  for (const s of siRows) {
    const list = sisByDoId.get(s.defining_objective_id) || [];
    list.push(s);
    sisByDoId.set(s.defining_objective_id, list);
  }
  const metricByDoId = new Map<string, string>();
  for (const m of doMetrics) {
    if (!metricByDoId.has(m.defining_objective_id)) metricByDoId.set(m.defining_objective_id, m.name);
  }

  const matchedDoIds = new Set<string>();

  const reconciledExisting: RawCanvasNode[] = loadedNodes.map((n) => {
    if (n.type === 'rally' && rallyingCry?.title) {
      const rallyData = (n.data || {}) as { rallyFinalized?: boolean; rallyCandidates?: string[] };
      if (!rallyData.rallyFinalized) return n;
      const candidates = [rallyingCry.title, ...((rallyData.rallyCandidates || []).slice(1))];
      return { ...n, data: { ...rallyData, rallyCandidates: candidates } };
    }
    if (n.type === 'do' && n.data?.dbId) {
      const doDbId = String(n.data.dbId);
      const row = doRowById.get(doDbId);
      if (!row) return n; // DO no longer exists in DB — leave the cached card rather than guess
      matchedDoIds.add(doDbId);

      const canonicalSIs = sisByDoId.get(doDbId) || [];
      const siRowById = new Map(canonicalSIs.map((s) => [s.id, s]));

      const items = (n.data.saiItems as Array<Record<string, unknown>> | undefined) || [];
      const seenSiIds = new Set<string>();
      const reconciledItems: Array<Record<string, unknown>> = [];
      for (const it of items) {
        const siId = it.dbId ? String(it.dbId) : undefined;
        // Drop duplicate cards that point at an SI dbId already kept — a
        // real initiative shouldn't render twice just because the canvas
        // ended up with two node entries sharing one database row.
        if (siId && seenSiIds.has(siId)) continue;
        if (siId) seenSiIds.add(siId);
        const siRow = siId ? siRowById.get(siId) : undefined;
        if (!siRow) { reconciledItems.push(it); continue; }
        reconciledItems.push({
          ...it,
          title: siRow.title,
          ownerId: siRow.owner_user_id || undefined,
          participantIds: Array.isArray(siRow.participant_user_ids) ? siRow.participant_user_ids : undefined,
          description: siRow.description || '',
          metric: siRow.primary_success_metric || '',
          benchmark: siRow.benchmark || '',
        });
      }
      // Append canonical SIs with no matching card at all — created from
      // a Detail page after this snapshot was last saved.
      for (const siRow of canonicalSIs) {
        if (seenSiIds.has(siRow.id)) continue;
        reconciledItems.push(siCardFromRow(n.id, siRow));
      }

      return {
        ...n,
        data: {
          ...n.data,
          title: row.title,
          hypothesis: row.hypothesis || '',
          ownerId: row.owner_user_id || undefined,
          status: row.status === 'locked' ? 'locked' : 'draft',
          primarySuccessMetric: metricByDoId.get(doDbId) || '',
          saiItems: reconciledItems,
        },
      };
    }
    return n;
  });

  // Append DOs that exist in the database but have no card on this canvas at
  // all — e.g. added via the Detail page's "Add DO" flow after the snapshot
  // was last saved, so nothing ever pushed them here.
  const missingDos = doRows.filter((d) => !matchedDoIds.has(d.id));
  const appendedDoNodes: RawCanvasNode[] = [];
  let layoutCursor = reconciledExisting.filter((n) => n.type === 'do');
  missingDos.forEach((d, idx) => {
    const pos = findNonOverlappingPosition(layoutCursor, 'do', 200 + idx * 320, 700);
    const canonicalSIs = sisByDoId.get(d.id) || [];
    const saiItems = canonicalSIs.map((si) => siCardFromRow(`do-${d.id.slice(0, 6)}`, si));
    const newNode: RawCanvasNode = {
      id: `do-db-${d.id.slice(0, 8)}`,
      type: 'do',
      position: pos,
      data: {
        title: d.title,
        status: d.status === 'locked' ? 'locked' : 'draft',
        ownerId: d.owner_user_id || undefined,
        hypothesis: d.hypothesis || '',
        primarySuccessMetric: metricByDoId.get(d.id) || '',
        saiItems,
        size: { w: 260, h: 110 },
        dbId: d.id,
      },
    };
    appendedDoNodes.push(newNode);
    layoutCursor = [...layoutCursor, newNode];
  });

  return {
    nodes: [...reconciledExisting, ...appendedDoNodes],
    appendedDoCount: appendedDoNodes.length,
  };
}
