import { describe, it, expect } from 'vitest';
import { buildTargetOptions, resolveTarget } from '@/lib/meetingSuggestions';
import type { CosLayoutConfig } from '@/types/cos';

// ─────────────────────────────────────────────────────────────────
// Pure routing logic for the "Suggested from your 1:1s" panel:
// turning the user's board layout into pickable destination lists, and
// resolving a suggested category key back to "column · section".
// ─────────────────────────────────────────────────────────────────

const layout: CosLayoutConfig = {
  columnCount: 3,
  columns: [
    { id: 'col1', headerLabel: 'NOW', widthPct: 33, sections: [
      { id: 'now',       type: 'now',       label: 'ASAP',      enabled: true },
      { id: 'this_week', type: 'this_week', label: 'This Week', enabled: false },
    ]},
    { id: 'col2', headerLabel: 'STRATEGIC', widthPct: 33, sections: [
      { id: 'strategic', type: 'custom', label: 'Strategic Opps', enabled: true },
    ]},
    { id: 'col3', headerLabel: 'Direct Reports', widthPct: 34, sections: [
      { id: 'direct_reports', type: 'direct_reports', label: null, enabled: true },
    ]},
  ],
};

describe('buildTargetOptions', () => {
  it('flattens enabled non-direct-report sections into column·section options', () => {
    const opts = buildTargetOptions(layout);
    expect(opts).toEqual([
      { category: 'now', columnLabel: 'NOW', sectionLabel: 'ASAP' },
      { category: 'strategic', columnLabel: 'STRATEGIC', sectionLabel: 'Strategic Opps' },
    ]);
  });

  it('skips disabled sections and the direct-reports section', () => {
    const opts = buildTargetOptions(layout);
    expect(opts.map(o => o.category)).not.toContain('this_week');
    expect(opts.map(o => o.category)).not.toContain('direct_reports');
  });

  it('returns [] for a missing layout', () => {
    expect(buildTargetOptions(null)).toEqual([]);
    expect(buildTargetOptions(undefined)).toEqual([]);
  });
});

describe('resolveTarget', () => {
  const opts = buildTargetOptions(layout);

  it('resolves a known category to its destination list', () => {
    expect(resolveTarget('strategic', opts)?.columnLabel).toBe('STRATEGIC');
  });

  it('falls back to the first list for a stale/unknown category', () => {
    expect(resolveTarget('next_quarter', opts)?.category).toBe('now');
    expect(resolveTarget(null, opts)?.category).toBe('now');
  });

  it('returns undefined when there are no lists to route to', () => {
    expect(resolveTarget('now', [])).toBeUndefined();
  });
});
