import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInboxItems } from '@/hooks/useInboxItems';
import { useInboxTags } from '@/hooks/useInboxTags';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Integration: prove the hook-level validation gate actually stops bad writes.
// The point of these tests is the negative case — invalid input must NEVER reach
// supabase.insert — plus the normalization contract on the happy path.
// ─────────────────────────────────────────────────────────────────────────────

const USER = '11111111-1111-1111-1111-111111111111';
// Stable reference: useInboxItems lists `filter` as a useCallback dep, so an
// inline {} each render would re-create load(), re-fire the effect, and loop.
const FILTER = {};

// A universal chainable query builder: every PostgREST-style method returns the
// same builder, the builder is awaitable (resolves to a configurable array), and
// terminal .single()/.maybeSingle() resolve to a row. This lets the hooks run
// their real load()/insert() chains without hand-rolling each one.
let arrayData: unknown[] = [];
let insertSpy: ReturnType<typeof vi.fn>;
let builder: Record<string, unknown>;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

const mockedFrom = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from;

function buildBuilder() {
  insertSpy = vi.fn(() => builder);
  builder = {};
  const passthrough = ['select', 'eq', 'in', 'order', 'update', 'delete', 'not', 'limit', 'contains'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.insert = insertSpy;
  builder.single = vi.fn(() => Promise.resolve({ data: { id: 'new-id' }, error: null }));
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  // Awaitable: `await query` resolves the array result.
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: arrayData, error: null });
}

beforeEach(() => {
  arrayData = [];
  buildBuilder();
  mockedFrom.mockReset();
  mockedFrom.mockImplementation(() => builder);
});

// ── useInboxItems.addItem ────────────────────────────────────────────────────

describe('useInboxItems.addItem validation gate', () => {
  async function mountHook() {
    const hook = renderHook(() => useInboxItems(USER, FILTER));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    insertSpy.mockClear();
    return hook;
  }

  it('rejects empty text without hitting the DB', async () => {
    const { result } = await mountHook();
    let returned: unknown;
    await act(async () => { returned = await result.current.addItem('   '); });
    expect(returned).toBeNull();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('rejects control-char-only text without hitting the DB', async () => {
    const { result } = await mountHook();
    await act(async () => { await result.current.addItem('\x00\x01'); });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('rejects over-long text without hitting the DB', async () => {
    const { result } = await mountHook();
    await act(async () => { await result.current.addItem('x'.repeat(5000)); });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('inserts normalized (trimmed) text on the happy path', async () => {
    const { result } = await mountHook();
    await act(async () => { await result.current.addItem('  Ship it  ', 'task'); });
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER, type: 'task', text: 'Ship it' }),
    );
  });

  it('rejects an over-long body even when text is valid', async () => {
    const { result } = await mountHook();
    await act(async () => {
      await result.current.addItem('valid', 'note', [], { body: 'x'.repeat(60_000) });
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

// ── useInboxTags.createTag ───────────────────────────────────────────────────

describe('useInboxTags.createTag validation gate', () => {
  async function mountHook() {
    const hook = renderHook(() => useInboxTags(USER));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    insertSpy.mockClear();
    return hook;
  }

  it('rejects an empty name without hitting the DB', async () => {
    const { result } = await mountHook();
    let returned: unknown;
    await act(async () => { returned = await result.current.createTag('   ', 'project', '#6366f1'); });
    expect(returned).toBeNull();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid color without hitting the DB', async () => {
    const { result } = await mountHook();
    await act(async () => { await result.current.createTag('Growth', 'project', 'green'); });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid tag type without hitting the DB', async () => {
    const { result } = await mountHook();
    await act(async () => {
      await result.current.createTag('Growth', 'label' as never, '#6366f1');
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('inserts a normalized name on the happy path', async () => {
    const { result } = await mountHook();
    await act(async () => { await result.current.createTag('  Growth   Team  ', 'project', '#AbC123'); });
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Growth Team', type: 'project', color: '#abc123' }),
    );
  });
});
