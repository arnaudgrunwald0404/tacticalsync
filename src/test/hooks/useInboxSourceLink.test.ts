import { describe, it, expect, vi } from 'vitest';
import { getSourceLink, isSyncedSourceRef } from '@/hooks/useInboxItems';
import type { SourceRef } from '@/types/inbox';

// Pure-function tests for the "open the source" / "is this a synced item"
// helpers added for the unified funnel (Idea #1). Importing useInboxItems.ts
// pulls in the supabase client and useToast, so both are mocked the same way
// other hook tests in this suite do it (see src/test/hooks/useSubSIs.test.ts)
// even though these two exports don't touch either.
vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

describe('getSourceLink', () => {
  it('returns null for a null/undefined source_ref', () => {
    expect(getSourceLink(null)).toBeNull();
    expect(getSourceLink(undefined)).toBeNull();
  });

  it('returns null for source_ref types with no deep link (e.g. manual, zoom_recording)', () => {
    expect(getSourceLink({ type: 'manual' })).toBeNull();
    expect(getSourceLink({ type: 'zoom_recording', id: 'abc' })).toBeNull();
    expect(getSourceLink({ type: 'dci_brief', id: '2026-07-01' })).toBeNull();
    expect(getSourceLink({ type: 'dci_weekly_brief', id: '2026-07-01' })).toBeNull();
    expect(getSourceLink({ type: 'calendar', id: 'abc' })).toBeNull();
  });

  it('links meeting_action_item to /my-meetings with an explanatory label', () => {
    const link = getSourceLink({ type: 'meeting_action_item', id: 'item-1' });
    expect(link).not.toBeNull();
    expect(link?.href).toBe('/my-meetings');
    expect(link?.label).toMatch(/meeting/i);
  });

  it('links cos_meeting_action to the 1:1s tab with an explanatory label', () => {
    const link = getSourceLink({ type: 'cos_meeting_action', id: 'item-2' });
    expect(link).not.toBeNull();
    expect(link?.href).toBe('/check-ins/meetings');
    expect(link?.label).toMatch(/1:1/i);
  });

  it('does not throw for an unrecognized/future type string', () => {
    const bogus = { type: 'something_new' } as unknown as SourceRef;
    expect(() => getSourceLink(bogus)).not.toThrow();
    expect(getSourceLink(bogus)).toBeNull();
  });
});

describe('SourceRef union includes the two unified-funnel sync types', () => {
  it('accepts meeting_action_item and cos_meeting_action as valid SourceRef.type values', () => {
    // Compile-time check: these assignments only type-check if the union in
    // src/types/inbox.ts actually includes both literals. If someone reverts
    // that union, `tsc`/vitest's type-checking (or a future strict build)
    // catches it here rather than only at the call sites that use it.
    const a: SourceRef = { type: 'meeting_action_item', id: '1' };
    const b: SourceRef = { type: 'cos_meeting_action', id: '2' };
    expect(a.type).toBe('meeting_action_item');
    expect(b.type).toBe('cos_meeting_action');

    // Runtime check mirroring the mapper pattern in useInboxItems.ts's
    // rowToItem: parsing a DB row with either type string must not throw.
    const rows: SourceRef[] = [a, b];
    expect(() => rows.map(r => getSourceLink(r))).not.toThrow();
  });
});

describe('isSyncedSourceRef', () => {
  it('is false for null/undefined', () => {
    expect(isSyncedSourceRef(null)).toBe(false);
    expect(isSyncedSourceRef(undefined)).toBe(false);
  });

  it('is true only for the two DB-trigger-synced source kinds', () => {
    expect(isSyncedSourceRef({ type: 'meeting_action_item', id: '1' })).toBe(true);
    expect(isSyncedSourceRef({ type: 'cos_meeting_action', id: '2' })).toBe(true);
  });

  it('is false for every other existing source_ref type', () => {
    expect(isSyncedSourceRef({ type: 'manual' })).toBe(false);
    expect(isSyncedSourceRef({ type: 'zoom_recording', id: 'x' })).toBe(false);
    expect(isSyncedSourceRef({ type: 'dci_brief', id: 'x' })).toBe(false);
    expect(isSyncedSourceRef({ type: 'dci_weekly_brief', id: 'x' })).toBe(false);
    expect(isSyncedSourceRef({ type: 'calendar', id: 'x' })).toBe(false);
  });
});
