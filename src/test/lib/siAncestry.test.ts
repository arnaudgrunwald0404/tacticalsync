import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTopLevelSiId, resolveTaskSiAncestry } from '@/lib/siAncestry';
import { supabase } from '@/integrations/supabase/client';

// siAncestry is the bridge between sub-SI rows and the SI detail route. Every
// navigation that lands on `/rcdo/detail/si/<id>` from a task feed, check-in card, or
// activity log relies on it returning the *top-level* SI id (the only one with a
// route). Regressions here send users to a 404 or to the wrong page.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const makeMaybeSingle = (data: unknown, error: unknown = null) => ({
  maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
});

const setSiQueryResult = (data: unknown, error: unknown = null) => {
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === 'rc_strategic_initiatives') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => makeMaybeSingle(data, error)),
        })),
      };
    }
    if (table === 'rc_tasks') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => makeMaybeSingle(data, error)),
        })),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
};

describe('resolveTopLevelSiId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the same id when the SI is already top-level', async () => {
    setSiQueryResult({ id: 'si-1', parent_si_id: null });
    const result = await resolveTopLevelSiId('si-1');
    expect(result).toBe('si-1');
  });

  it('walks one level up when the id refers to a sub-SI', async () => {
    setSiQueryResult({ id: 'sub-1', parent_si_id: 'si-parent' });
    const result = await resolveTopLevelSiId('sub-1');
    expect(result).toBe('si-parent');
  });

  it('falls back to the input id when the row is missing', async () => {
    setSiQueryResult(null);
    const result = await resolveTopLevelSiId('missing-id');
    // Defensive fallback — caller still gets a routable value even if the row was
    // deleted out from under them (better than navigating to an empty page).
    expect(result).toBe('missing-id');
  });

  it('falls back to the input id when the query errors', async () => {
    setSiQueryResult(null, { message: 'rls denied' });
    const result = await resolveTopLevelSiId('forbidden-id');
    expect(result).toBe('forbidden-id');
  });
});

describe('resolveTaskSiAncestry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns both ids when the task is on a top-level SI', async () => {
    let call = 0;
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      call++;
      if (table === 'rc_tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeMaybeSingle({ strategic_initiative_id: 'si-top' })),
          })),
        };
      }
      if (table === 'rc_strategic_initiatives') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeMaybeSingle({ id: 'si-top', parent_si_id: null })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table} (call ${call})`);
    });

    const result = await resolveTaskSiAncestry('task-1');
    expect(result).toEqual({ topLevelSiId: 'si-top', containerSiId: 'si-top' });
  });

  it('resolves container -> top-level for a task under a sub-SI', async () => {
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'rc_tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeMaybeSingle({ strategic_initiative_id: 'sub-1' })),
          })),
        };
      }
      if (table === 'rc_strategic_initiatives') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeMaybeSingle({ id: 'sub-1', parent_si_id: 'si-parent' })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await resolveTaskSiAncestry('task-under-sub');
    // containerSiId is what the caller appends `?task=` to (the sub-SI), but the URL
    // segment is the top-level SI because that's the only route we have.
    expect(result).toEqual({ topLevelSiId: 'si-parent', containerSiId: 'sub-1' });
  });

  it('returns both ids null when the task is missing', async () => {
    setSiQueryResult(null);
    const result = await resolveTaskSiAncestry('ghost-task');
    expect(result).toEqual({ topLevelSiId: null, containerSiId: null });
  });

  it('returns both ids null when the task has no strategic_initiative_id', async () => {
    setSiQueryResult({ strategic_initiative_id: null });
    const result = await resolveTaskSiAncestry('orphan-task');
    expect(result).toEqual({ topLevelSiId: null, containerSiId: null });
  });
});
