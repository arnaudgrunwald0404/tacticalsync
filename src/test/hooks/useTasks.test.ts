import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTask } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';

// Regression coverage for the Phase 3 auth-context migration: createTask
// used to call supabase.auth.getUser() itself (a lock-contention hotspot on
// SIDetail.tsx, where dozens of queries fire on load). It now takes the
// current user id as a parameter, sourced by the caller from
// useCurrentUser().

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

function makeInsertChain(row: unknown, error: Error | null = null) {
  const single = vi.fn(() => Promise.resolve({ data: row, error }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert, select, single };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTask', () => {
  it('throws without calling supabase when no user id is available', async () => {
    await expect(
      createTask({ strategic_initiative_id: 'si-1', title: 'New task', owner_user_id: 'user-1' }, undefined),
    ).rejects.toMatchObject({ message: 'Not authenticated' });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('inserts with created_by set from the passed-in user id, not a getUser() call', async () => {
    const chain = makeInsertChain({ id: 'task-1', title: 'New task' });
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>);

    await createTask({ strategic_initiative_id: 'si-1', title: 'New task', owner_user_id: 'user-1' }, 'user-1');

    const insertedRow = chain.insert.mock.calls[0][0] as { created_by: string; status: string };
    expect(insertedRow.created_by).toBe('user-1');
    expect(insertedRow.status).toBe('not_assigned');
  });

  it('propagates the Postgrest error instead of swallowing it', async () => {
    const chain = makeInsertChain(null, new Error('permission denied'));
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>);

    await expect(
      createTask({ strategic_initiative_id: 'si-1', title: 'New task', owner_user_id: 'user-1' }, 'user-1'),
    ).rejects.toMatchObject({ message: 'permission denied' });
  });
});
