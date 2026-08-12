import { describe, it, expect, vi } from 'vitest';
import {
  reconcileCanvasSnapshot,
  type RawCanvasNode,
  type DOReconcileRow,
  type SIReconcileRow,
} from '@/lib/canvasSnapshotReconciliation';

// Regression coverage for two real production bugs found on a live cycle
// (24d0541, 0fdf149):
//   - rc_canvas_states caches node text; Detail-page edits write straight to
//     the canonical tables and never touch that cache, so the canvas kept
//     re-persisting stale text on every autosave.
//   - A DO created from a Detail page after a snapshot was first saved never
//     got added to that snapshot at all, and a duplicated SI card could end
//     up pointing at the same underlying row as another card on the same DO.

const noopFindPosition = vi.fn((_existing: RawCanvasNode[], _type: 'do', x: number, y: number) => ({ x, y }));

function doNode(overrides: Partial<RawCanvasNode> & { data: Record<string, unknown> }): RawCanvasNode {
  return { id: 'do-node-1', type: 'do', ...overrides };
}

describe('reconcileCanvasSnapshot', () => {
  it('overlays live DO text onto the cached card, overwriting stale cached values', () => {
    const cachedNode = doNode({
      data: { title: 'STALE TITLE', hypothesis: 'stale hypothesis', dbId: 'do-1', saiItems: [] },
    });

    const doRows: DOReconcileRow[] = [
      { id: 'do-1', title: 'Live Title', hypothesis: 'live hypothesis', owner_user_id: 'user-1', status: 'active' },
    ];

    const result = reconcileCanvasSnapshot({
      loadedNodes: [cachedNode],
      rallyingCry: null,
      doRows,
      siRows: [],
      doMetrics: [],
      findNonOverlappingPosition: noopFindPosition,
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].data).toMatchObject({
      title: 'Live Title',
      hypothesis: 'live hypothesis',
      ownerId: 'user-1',
    });
    expect(result.appendedDoCount).toBe(0);
  });

  it('maps DO status to only "locked" or "draft", never an invalid vocabulary value', () => {
    const cachedNode = doNode({ data: { title: 'X', dbId: 'do-1', saiItems: [] } });
    const doRows: DOReconcileRow[] = [{ id: 'do-1', title: 'X', status: 'locked' }];

    const result = reconcileCanvasSnapshot({
      loadedNodes: [cachedNode],
      rallyingCry: null,
      doRows,
      siRows: [],
      doMetrics: [],
      findNonOverlappingPosition: noopFindPosition,
    });

    expect(result.nodes[0].data?.status).toBe('locked');
  });

  it('leaves a cached DO card as-is when its dbId no longer exists in the DB (does not guess/delete)', () => {
    const cachedNode = doNode({ data: { title: 'Orphaned', dbId: 'do-deleted', saiItems: [] } });

    const result = reconcileCanvasSnapshot({
      loadedNodes: [cachedNode],
      rallyingCry: null,
      doRows: [],
      siRows: [],
      doMetrics: [],
      findNonOverlappingPosition: noopFindPosition,
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].data?.title).toBe('Orphaned');
  });

  it('overlays the primary success metric from rc_do_metrics', () => {
    const cachedNode = doNode({ data: { title: 'X', dbId: 'do-1', saiItems: [] } });
    const doRows: DOReconcileRow[] = [{ id: 'do-1', title: 'X', status: 'draft' }];

    const result = reconcileCanvasSnapshot({
      loadedNodes: [cachedNode],
      rallyingCry: null,
      doRows,
      siRows: [],
      doMetrics: [{ defining_objective_id: 'do-1', name: 'Revenue per seat' }],
      findNonOverlappingPosition: noopFindPosition,
    });

    expect(result.nodes[0].data?.primarySuccessMetric).toBe('Revenue per seat');
  });

  it('finalizes the rally node text with the live rallying cry title', () => {
    const rallyNode: RawCanvasNode = {
      id: 'rally-1',
      type: 'rally',
      data: { rallyFinalized: true, rallyCandidates: ['Stale headline', 'Alt 2'] },
    };

    const result = reconcileCanvasSnapshot({
      loadedNodes: [rallyNode],
      rallyingCry: { id: 'rc-1', title: 'Live headline' },
      doRows: [],
      siRows: [],
      doMetrics: [],
      findNonOverlappingPosition: noopFindPosition,
    });

    expect((result.nodes[0].data as { rallyCandidates: string[] }).rallyCandidates[0]).toBe('Live headline');
  });

  it('does not overwrite the rally node when it has not been finalized yet', () => {
    const rallyNode: RawCanvasNode = {
      id: 'rally-1',
      type: 'rally',
      data: { rallyFinalized: false, rallyCandidates: ['Draft your rallying cry'] },
    };

    const result = reconcileCanvasSnapshot({
      loadedNodes: [rallyNode],
      rallyingCry: { id: 'rc-1', title: 'Live headline' },
      doRows: [],
      siRows: [],
      doMetrics: [],
      findNonOverlappingPosition: noopFindPosition,
    });

    expect((result.nodes[0].data as { rallyCandidates: string[] }).rallyCandidates[0]).toBe('Draft your rallying cry');
  });

  describe('duplicate SI cards collapsing onto one dbId', () => {
    it('drops a duplicate card that points at an SI dbId already kept', () => {
      const cachedNode = doNode({
        data: {
          title: 'DO',
          dbId: 'do-1',
          saiItems: [
            { id: 'si-card-a', dbId: 'si-1', title: 'Copy A' },
            { id: 'si-card-b', dbId: 'si-1', title: 'Copy B (duplicate)' },
          ],
        },
      });
      const doRows: DOReconcileRow[] = [{ id: 'do-1', title: 'DO', status: 'draft' }];
      const siRows: SIReconcileRow[] = [
        { id: 'si-1', title: 'Live SI Title', defining_objective_id: 'do-1' },
      ];

      const result = reconcileCanvasSnapshot({
        loadedNodes: [cachedNode],
        rallyingCry: null,
        doRows,
        siRows,
        doMetrics: [],
        findNonOverlappingPosition: noopFindPosition,
      });

      const saiItems = result.nodes[0].data?.saiItems as Array<Record<string, unknown>>;
      expect(saiItems).toHaveLength(1);
      expect(saiItems[0].dbId).toBe('si-1');
      expect(saiItems[0].title).toBe('Live SI Title');
    });

    it('overlays live SI text (title/owner/metric) onto the surviving card', () => {
      const cachedNode = doNode({
        data: {
          title: 'DO',
          dbId: 'do-1',
          saiItems: [{ id: 'si-card-a', dbId: 'si-1', title: 'Stale SI Title', metric: 'stale metric' }],
        },
      });
      const doRows: DOReconcileRow[] = [{ id: 'do-1', title: 'DO', status: 'draft' }];
      const siRows: SIReconcileRow[] = [
        { id: 'si-1', title: 'Fresh SI Title', primary_success_metric: 'fresh metric', defining_objective_id: 'do-1' },
      ];

      const result = reconcileCanvasSnapshot({
        loadedNodes: [cachedNode],
        rallyingCry: null,
        doRows,
        siRows,
        doMetrics: [],
        findNonOverlappingPosition: noopFindPosition,
      });

      const saiItems = result.nodes[0].data?.saiItems as Array<Record<string, unknown>>;
      expect(saiItems[0].title).toBe('Fresh SI Title');
      expect(saiItems[0].metric).toBe('fresh metric');
    });

    it('keeps a cached SI card with no dbId untouched (not yet persisted)', () => {
      const cachedNode = doNode({
        data: {
          title: 'DO',
          dbId: 'do-1',
          saiItems: [{ id: 'si-card-local', title: 'Not yet saved' }],
        },
      });
      const doRows: DOReconcileRow[] = [{ id: 'do-1', title: 'DO', status: 'draft' }];

      const result = reconcileCanvasSnapshot({
        loadedNodes: [cachedNode],
        rallyingCry: null,
        doRows,
        siRows: [],
        doMetrics: [],
        findNonOverlappingPosition: noopFindPosition,
      });

      const saiItems = result.nodes[0].data?.saiItems as Array<Record<string, unknown>>;
      expect(saiItems).toHaveLength(1);
      expect(saiItems[0].title).toBe('Not yet saved');
    });
  });

  describe('DOs/SIs missing from the cached snapshot entirely', () => {
    it('appends a canonical SI created from a Detail page with no matching card yet', () => {
      const cachedNode = doNode({ data: { title: 'DO', dbId: 'do-1', saiItems: [] } });
      const doRows: DOReconcileRow[] = [{ id: 'do-1', title: 'DO', status: 'draft' }];
      const siRows: SIReconcileRow[] = [{ id: 'si-new', title: 'Brand new SI', defining_objective_id: 'do-1' }];

      const result = reconcileCanvasSnapshot({
        loadedNodes: [cachedNode],
        rallyingCry: null,
        doRows,
        siRows,
        doMetrics: [],
        findNonOverlappingPosition: noopFindPosition,
      });

      const saiItems = result.nodes[0].data?.saiItems as Array<Record<string, unknown>>;
      expect(saiItems).toHaveLength(1);
      expect(saiItems[0].dbId).toBe('si-new');
      expect(saiItems[0].title).toBe('Brand new SI');
    });

    it('appends a whole DO node for a DO that exists in the DB but has no card at all', () => {
      const result = reconcileCanvasSnapshot({
        loadedNodes: [],
        rallyingCry: null,
        doRows: [{ id: 'do-missing', title: 'Improve Customer Health', status: 'draft' }],
        siRows: [],
        doMetrics: [],
        findNonOverlappingPosition: noopFindPosition,
      });

      expect(result.appendedDoCount).toBe(1);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('do');
      expect(result.nodes[0].data?.title).toBe('Improve Customer Health');
      expect(result.nodes[0].data?.dbId).toBe('do-missing');
    });

    it('does not append a DO that already matched an existing card (no double-add)', () => {
      const cachedNode = doNode({ data: { title: 'DO', dbId: 'do-1', saiItems: [] } });
      const doRows: DOReconcileRow[] = [{ id: 'do-1', title: 'DO', status: 'draft' }];

      const result = reconcileCanvasSnapshot({
        loadedNodes: [cachedNode],
        rallyingCry: null,
        doRows,
        siRows: [],
        doMetrics: [],
        findNonOverlappingPosition: noopFindPosition,
      });

      expect(result.appendedDoCount).toBe(0);
      expect(result.nodes).toHaveLength(1);
    });

    it('lays out an appended DO using findNonOverlappingPosition against the DOs seen so far', () => {
      const findPos = vi.fn(() => ({ x: 999, y: 888 }));

      const result = reconcileCanvasSnapshot({
        loadedNodes: [],
        rallyingCry: null,
        doRows: [{ id: 'do-missing', title: 'New DO', status: 'draft' }],
        siRows: [],
        doMetrics: [],
        findNonOverlappingPosition: findPos,
      });

      expect(findPos).toHaveBeenCalledTimes(1);
      expect(result.nodes[0].position).toEqual({ x: 999, y: 888 });
    });

    it('reproduces the reported live-cycle scenario: 3 cards cached, 4 DOs in DB, one duplicated SI', () => {
      const cachedNodes: RawCanvasNode[] = [
        doNode({
          id: 'do-node-1',
          data: {
            title: 'DO 1',
            dbId: 'do-1',
            saiItems: [
              { id: 'si-a', dbId: 'si-1', title: 'SI One' },
              { id: 'si-a-dup', dbId: 'si-1', title: 'SI One (dup)' },
            ],
          },
        }),
        doNode({ id: 'do-node-2', data: { title: 'DO 2', dbId: 'do-2', saiItems: [] } }),
        doNode({ id: 'do-node-3', data: { title: 'DO 3', dbId: 'do-3', saiItems: [] } }),
      ];

      const doRows: DOReconcileRow[] = [
        { id: 'do-1', title: 'DO 1', status: 'draft' },
        { id: 'do-2', title: 'DO 2', status: 'draft' },
        { id: 'do-3', title: 'DO 3', status: 'draft' },
        { id: 'do-4', title: 'Improve Customer Health', status: 'draft' },
      ];
      const siRows: SIReconcileRow[] = [{ id: 'si-1', title: 'SI One', defining_objective_id: 'do-1' }];

      const result = reconcileCanvasSnapshot({
        loadedNodes: cachedNodes,
        rallyingCry: null,
        doRows,
        siRows,
        doMetrics: [],
        findNonOverlappingPosition: noopFindPosition,
      });

      // The missing "Improve Customer Health" DO is now present.
      expect(result.appendedDoCount).toBe(1);
      const titles = result.nodes.filter((n) => n.type === 'do').map((n) => n.data?.title);
      expect(titles).toContain('Improve Customer Health');
      expect(result.nodes.filter((n) => n.type === 'do')).toHaveLength(4);

      // The duplicated SI card collapsed to one.
      const do1 = result.nodes.find((n) => n.data?.dbId === 'do-1');
      expect(do1?.data?.saiItems).toHaveLength(1);
    });
  });
});
