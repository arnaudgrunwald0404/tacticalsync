import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteDO, deleteInitiative, lockDO, unlockDO, lockInitiative, unlockInitiative } from '@/hooks/useRCDOMutations';
import { supabase } from '@/integrations/supabase/client';

// Regression coverage for f9f2e76 / 99695b3 (canvas delete only removed the
// local node, never the DB row) and for 5973481, which unified canvas and
// detail-page delete/lock/unlock behind this shared module so both screens
// call the same Supabase writes instead of maintaining separate,
// drifting implementations. These mutations previously had no direct test
// coverage.

type Call = { table: string; op: string; args: unknown[] };

function makeMockSupabase(error: { message: string } | null = null) {
  const calls: Call[] = [];

  const chain = (table: string) => {
    const record = (op: string, ...args: unknown[]) => {
      calls.push({ table, op, args });
      return node;
    };
    const node: Record<string, unknown> = {
      delete: () => { calls.push({ table, op: 'delete', args: [] }); return node; },
      update: (...args: unknown[]) => record('update', ...args),
      eq: (...args: unknown[]) => record('eq', ...args),
      in: (...args: unknown[]) => record('in', ...args),
      then: (resolve: (v: { data: null; error: unknown }) => unknown) => resolve({ data: null, error }),
    };
    return node;
  };

  vi.mocked(supabase.from).mockImplementation((table: string) => chain(table) as unknown as ReturnType<typeof supabase.from>);
  return calls;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);
});

describe('deleteDO', () => {
  it('deletes rc_links, rc_checkins, and the DO row itself — not just local state', async () => {
    const calls = makeMockSupabase();

    await deleteDO('do-1', []);

    const tables = calls.map((c) => c.table);
    expect(tables).toContain('rc_links');
    expect(tables).toContain('rc_checkins');
    expect(tables).toContain('rc_defining_objectives');

    const doDelete = calls.find((c) => c.table === 'rc_defining_objectives' && c.op === 'eq');
    expect(doDelete?.args).toEqual(['id', 'do-1']);
  });

  it('also cleans up rc_links/rc_checkins for nested SIs by parent_id', async () => {
    const calls = makeMockSupabase();

    await deleteDO('do-1', ['si-1', 'si-2']);

    const siLinkCleanup = calls.find((c) => c.table === 'rc_links' && c.op === 'in' && c.args[0] === 'parent_id');
    expect(siLinkCleanup?.args).toEqual(['parent_id', ['si-1', 'si-2']]);

    const siCheckinCleanup = calls.find((c) => c.table === 'rc_checkins' && c.op === 'in' && c.args[0] === 'parent_id');
    expect(siCheckinCleanup?.args).toEqual(['parent_id', ['si-1', 'si-2']]);
  });

  it('skips the SI in()-cleanup calls when the DO has no nested SIs', async () => {
    const calls = makeMockSupabase();

    await deleteDO('do-1', []);

    expect(calls.filter((c) => c.op === 'in')).toHaveLength(0);
  });

  it('throws instead of silently succeeding when the delete errors', async () => {
    makeMockSupabase({ message: 'permission denied' });

    await expect(deleteDO('do-1', [])).rejects.toMatchObject({ message: 'permission denied' });
  });
});

describe('deleteInitiative', () => {
  it('deletes rc_links, rc_checkins, and the SI row itself — not just local state', async () => {
    const calls = makeMockSupabase();

    await deleteInitiative('si-1');

    const tables = calls.map((c) => c.table);
    expect(tables).toContain('rc_links');
    expect(tables).toContain('rc_checkins');
    expect(tables).toContain('rc_strategic_initiatives');

    const siDelete = calls.find((c) => c.table === 'rc_strategic_initiatives' && c.op === 'eq');
    expect(siDelete?.args).toEqual(['id', 'si-1']);
  });

  it('throws instead of silently succeeding when the delete errors', async () => {
    makeMockSupabase({ message: 'row is referenced elsewhere' });

    await expect(deleteInitiative('si-1')).rejects.toMatchObject({ message: 'row is referenced elsewhere' });
  });
});

describe('lockDO / unlockDO', () => {
  it('locks a DO with status "locked" and stamps locked_at/locked_by, never the invalid "final" status', async () => {
    const calls = makeMockSupabase();

    await lockDO('do-1');

    const update = calls.find((c) => c.table === 'rc_defining_objectives' && c.op === 'update');
    const patch = update?.args[0] as { status: string; locked_by: string };
    expect(patch.status).toBe('locked');
    expect(patch.status).not.toBe('final');
    expect(patch.locked_by).toBe('user-1');
  });

  it('unlocks a DO back to draft and clears locked_at/locked_by', async () => {
    const calls = makeMockSupabase();

    await unlockDO('do-1');

    const update = calls.find((c) => c.table === 'rc_defining_objectives' && c.op === 'update');
    const patch = update?.args[0] as { status: string; locked_at: null; locked_by: null };
    expect(patch.status).toBe('draft');
    expect(patch.locked_at).toBeNull();
    expect(patch.locked_by).toBeNull();
  });
});

describe('lockInitiative / unlockInitiative', () => {
  it('locks an SI via locked_at/locked_by only, never writing a status field', async () => {
    const calls = makeMockSupabase();

    await lockInitiative('si-1');

    const update = calls.find((c) => c.table === 'rc_strategic_initiatives' && c.op === 'update');
    const patch = update?.args[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('status');
    expect(patch.locked_by).toBe('user-1');
  });

  it('unlocks an SI by clearing locked_at/locked_by only', async () => {
    const calls = makeMockSupabase();

    await unlockInitiative('si-1');

    const update = calls.find((c) => c.table === 'rc_strategic_initiatives' && c.op === 'update');
    const patch = update?.args[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('status');
    expect(patch.locked_at).toBeNull();
    expect(patch.locked_by).toBeNull();
  });
});
