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
    rpc: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// deleteDO/deleteInitiative moved to single-transaction RPCs (delete_rc_do /
// delete_rc_initiative, added in
// 20260808000434_add_delete_rc_do_and_initiative_rpcs.sql) so that a whole
// DO/SI delete — main row plus its rc_links/rc_checkins cleanup — lands in
// one Postgres transaction/batch_id for the rc_deleted_items trash-capture
// trigger, instead of being split across the separate transactions that
// separate .from(...).delete() calls each get. The RPC body now owns the
// rc_links/rc_checkins cleanup and the child-SI lookup, so these tests only
// need to verify the RPC is called with the right name/args and that errors
// propagate — the cleanup-logic coverage moved to the migration itself.
describe('deleteDO', () => {
  it('calls the delete_rc_do RPC with the DO id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as unknown as ReturnType<typeof supabase.rpc>);

    await deleteDO('do-1');

    expect(supabase.rpc).toHaveBeenCalledWith('delete_rc_do', { p_do_id: 'do-1' });
  });

  it('throws instead of silently succeeding when the RPC errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'permission denied' } } as unknown as ReturnType<typeof supabase.rpc>);

    await expect(deleteDO('do-1')).rejects.toMatchObject({ message: 'permission denied' });
  });
});

describe('deleteInitiative', () => {
  it('calls the delete_rc_initiative RPC with the SI id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as unknown as ReturnType<typeof supabase.rpc>);

    await deleteInitiative('si-1');

    expect(supabase.rpc).toHaveBeenCalledWith('delete_rc_initiative', { p_si_id: 'si-1' });
  });

  it('throws instead of silently succeeding when the RPC errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'row is referenced elsewhere' } } as unknown as ReturnType<typeof supabase.rpc>);

    await expect(deleteInitiative('si-1')).rejects.toMatchObject({ message: 'row is referenced elsewhere' });
  });
});

describe('lockDO / unlockDO', () => {
  it('locks a DO with status "locked" and stamps locked_at/locked_by, never the invalid "final" status', async () => {
    const calls = makeMockSupabase();

    await lockDO('do-1', 'user-1');

    const update = calls.find((c) => c.table === 'rc_defining_objectives' && c.op === 'update');
    const patch = update?.args[0] as { status: string; locked_by: string };
    expect(patch.status).toBe('locked');
    expect(patch.status).not.toBe('final');
    expect(patch.locked_by).toBe('user-1');
  });

  it('throws instead of writing when no user id is available', async () => {
    makeMockSupabase();

    await expect(lockDO('do-1', undefined)).rejects.toMatchObject({ message: 'You must be logged in.' });
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

    await lockInitiative('si-1', 'user-1');

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
