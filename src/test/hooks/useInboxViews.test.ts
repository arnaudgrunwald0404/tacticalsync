import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInboxViews } from '@/hooks/useInboxViews';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests for useInboxViews: load/create/rename/delete/toggleStar
// against inbox_views. Star semantics are exclusive by design (starring one
// view unstars any previously-starred view) per
// PLAN_idea2_dormant20.md Section 2's resolved open question.
// ─────────────────────────────────────────────────────────────────────────────

const USER = '11111111-1111-1111-1111-111111111111';

let rows: Array<{ id: string; user_id: string; name: string; filter_json: unknown; sort_json: unknown; is_starred: boolean; sort_order: number; created_at: string }>;
// Spies are shared across every builder instance (not recreated per .from()
// call) so assertions can see the full call history across multiple
// .from('inbox_views') invocations within a single mutation (e.g. the
// exclusive-star toggle issues one update per previously-starred view, plus
// one more for the target — each a separate .from() call in the real code).
let insertSpy: ReturnType<typeof vi.fn>;
let updateSpy: ReturnType<typeof vi.fn>;
let deleteSpy: ReturnType<typeof vi.fn>;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from;

function buildBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve({
    data: { id: 'new-view-id', user_id: USER, name: 'New View', filter_json: {}, sort_json: {}, is_starred: false, sort_order: 0, created_at: 'now' },
    error: null,
  }));
  builder.insert = insertSpy;
  builder.update = updateSpy;
  builder.delete = deleteSpy;
  // Awaitable for the initial load() select-chain and for update()/delete()
  // chains that aren't followed by .select().single().
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows, error: null });
  return builder;
}

beforeEach(() => {
  rows = [];
  // Assigned before use via the spies below (each is only invoked once
  // sharedBuilder has been built), but declared with `let` since the spy
  // factories close over it ahead of that assignment.
  // eslint-disable-next-line prefer-const
  let sharedBuilder: Record<string, unknown>;
  insertSpy = vi.fn(() => sharedBuilder);
  updateSpy = vi.fn(() => sharedBuilder);
  deleteSpy = vi.fn(() => sharedBuilder);
  sharedBuilder = buildBuilder();
  mockedFrom.mockReset();
  mockedFrom.mockImplementation(() => sharedBuilder);
});

async function mountHook() {
  const hook = renderHook(() => useInboxViews(USER));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useInboxViews.createView', () => {
  it('rejects an empty name without hitting the DB', async () => {
    const { result } = await mountHook();
    let returned: unknown;
    await act(async () => { returned = await result.current.createView('   ', {}, { sortMode: 'byProject', prioritizeMode: false }); });
    expect(returned).toBeNull();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('inserts a normalized name with the given filter/sort on the happy path', async () => {
    const { result } = await mountHook();
    await act(async () => {
      await result.current.createView('  My View  ', { builtIn: 'all' }, { sortMode: 'grouped', prioritizeMode: true });
    });
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER,
        name: 'My View',
        filter_json: { builtIn: 'all' },
        sort_json: { sortMode: 'grouped', prioritizeMode: true },
      }),
    );
  });
});

describe('useInboxViews.toggleStar (exclusive semantics)', () => {
  it('unstars every other view when starring one', async () => {
    rows = [
      { id: 'v1', user_id: USER, name: 'A', filter_json: {}, sort_json: {}, is_starred: true, sort_order: 0, created_at: 'now' },
      { id: 'v2', user_id: USER, name: 'B', filter_json: {}, sort_json: {}, is_starred: false, sort_order: 1, created_at: 'now' },
    ];
    const { result } = await mountHook();
    expect(result.current.views).toHaveLength(2);

    await act(async () => { await result.current.toggleStar('v2', true); });

    // v1 (previously starred) gets an is_starred:false update; v2 gets true.
    expect(updateSpy).toHaveBeenCalledWith({ is_starred: false });
    expect(updateSpy).toHaveBeenCalledWith({ is_starred: true });
    expect(result.current.views.find(v => v.id === 'v1')?.is_starred).toBe(false);
    expect(result.current.views.find(v => v.id === 'v2')?.is_starred).toBe(true);
  });

  it('only the target view ends up starred', async () => {
    rows = [
      { id: 'v1', user_id: USER, name: 'A', filter_json: {}, sort_json: {}, is_starred: false, sort_order: 0, created_at: 'now' },
      { id: 'v2', user_id: USER, name: 'B', filter_json: {}, sort_json: {}, is_starred: false, sort_order: 1, created_at: 'now' },
    ];
    const { result } = await mountHook();
    await act(async () => { await result.current.toggleStar('v1', true); });
    const starredCount = result.current.views.filter(v => v.is_starred).length;
    expect(starredCount).toBe(1);
    expect(result.current.starredView?.id).toBe('v1');
  });

  it('unstarring clears the flag with no default left', async () => {
    rows = [
      { id: 'v1', user_id: USER, name: 'A', filter_json: {}, sort_json: {}, is_starred: true, sort_order: 0, created_at: 'now' },
    ];
    const { result } = await mountHook();
    await act(async () => { await result.current.toggleStar('v1', false); });
    expect(result.current.starredView).toBeNull();
  });
});

describe('useInboxViews.deleteView', () => {
  it('removes the view from state', async () => {
    rows = [
      { id: 'v1', user_id: USER, name: 'A', filter_json: {}, sort_json: {}, is_starred: false, sort_order: 0, created_at: 'now' },
    ];
    const { result } = await mountHook();
    await act(async () => { await result.current.deleteView('v1'); });
    expect(result.current.views).toHaveLength(0);
  });
});
