import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteDOCascade, deleteSICascade } from '@/lib/rcdoCascadeDelete';
import { supabase } from '@/integrations/supabase/client';

// Regression coverage for f9f2e76 / 99695b3: the canvas delete handlers used
// to only remove the node from local React Flow state and never touched the
// database, so the DO/SI (and its rc_links/rc_checkins rows, which reference
// parents by parent_type+parent_id with no FK) stayed behind and could
// resurface on the next canvas snapshot reconciliation. These tests assert
// the exact table/filter sequence so that regression can't silently return.

type Call = { table: string; op: string; args: unknown[] };

function makeMockSupabase(deleteError: { message: string } | null = null) {
  const calls: Call[] = [];

  const chain = (table: string) => {
    const record = (op: string, ...args: unknown[]) => {
      calls.push({ table, op, args });
      return node;
    };
    const node: Record<string, unknown> = {
      delete: () => { calls.push({ table, op: 'delete', args: [] }); return node; },
      eq: (...args: unknown[]) => record('eq', ...args),
      in: (...args: unknown[]) => record('in', ...args),
      then: (resolve: (v: { data: null; error: unknown }) => unknown) =>
        resolve({ data: null, error: deleteError }),
    };
    return node;
  };

  vi.mocked(supabase.from).mockImplementation((table: string) => chain(table) as unknown as ReturnType<typeof supabase.from>);
  return calls;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('rcdoCascadeDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deleteDOCascade', () => {
    it('deletes rc_links, rc_checkins, and the DO row itself — not just local state', async () => {
      const calls = makeMockSupabase();

      const result = await deleteDOCascade('do-1', []);

      expect(result.error).toBeNull();
      const tables = calls.map((c) => c.table);
      expect(tables).toContain('rc_links');
      expect(tables).toContain('rc_checkins');
      expect(tables).toContain('rc_defining_objectives');

      const doDelete = calls.find((c) => c.table === 'rc_defining_objectives' && c.op === 'eq');
      expect(doDelete?.args).toEqual(['id', 'do-1']);
    });

    it('also cleans up rc_links/rc_checkins for nested SIs by parent_id', async () => {
      const calls = makeMockSupabase();

      await deleteDOCascade('do-1', ['si-1', 'si-2']);

      const siLinkCleanup = calls.find(
        (c) => c.table === 'rc_links' && c.op === 'in' && c.args[0] === 'parent_id'
      );
      expect(siLinkCleanup?.args).toEqual(['parent_id', ['si-1', 'si-2']]);

      const siCheckinCleanup = calls.find(
        (c) => c.table === 'rc_checkins' && c.op === 'in' && c.args[0] === 'parent_id'
      );
      expect(siCheckinCleanup?.args).toEqual(['parent_id', ['si-1', 'si-2']]);
    });

    it('skips the SI in()-cleanup calls when the DO has no nested SIs', async () => {
      const calls = makeMockSupabase();

      await deleteDOCascade('do-1', []);

      const siCleanupCalls = calls.filter((c) => c.op === 'in');
      expect(siCleanupCalls).toHaveLength(0);
    });

    it('surfaces a delete error instead of silently succeeding', async () => {
      makeMockSupabase({ message: 'permission denied' });

      const result = await deleteDOCascade('do-1', []);

      expect(result.error).not.toBeNull();
      expect((result.error as unknown as { message: string }).message).toBe('permission denied');
    });
  });

  describe('deleteSICascade', () => {
    it('deletes rc_links, rc_checkins, and the SI row itself — not just local state', async () => {
      const calls = makeMockSupabase();

      const result = await deleteSICascade('si-1');

      expect(result.error).toBeNull();
      const tables = calls.map((c) => c.table);
      expect(tables).toContain('rc_links');
      expect(tables).toContain('rc_checkins');
      expect(tables).toContain('rc_strategic_initiatives');

      const siDelete = calls.find((c) => c.table === 'rc_strategic_initiatives' && c.op === 'eq');
      expect(siDelete?.args).toEqual(['id', 'si-1']);

      const linkCleanup = calls.find((c) => c.table === 'rc_links' && c.op === 'eq' && c.args[0] === 'parent_id');
      expect(linkCleanup?.args).toEqual(['parent_id', 'si-1']);
    });

    it('surfaces a delete error instead of silently succeeding', async () => {
      makeMockSupabase({ message: 'row is referenced elsewhere' });

      const result = await deleteSICascade('si-1');

      expect(result.error).not.toBeNull();
      expect((result.error as unknown as { message: string }).message).toBe('row is referenced elsewhere');
    });
  });
});
