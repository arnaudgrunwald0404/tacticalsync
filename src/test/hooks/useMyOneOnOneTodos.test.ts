import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMyOneOnOneTodos, sortMyTodos, type MyOneOnOneTodo } from '@/hooks/useMyOneOnOneTodos';
import { supabase } from '@/integrations/supabase/client';

// Coverage for TODO.md item 7 (flagged critical): a central aggregation of
// "to-dos for me" across every 1:1, sourced directly from cos_meeting_actions
// (owner='me', status='pending', member_id NOT NULL) rather than the Inbox,
// which commingles this with unrelated item types. The interesting behavior
// here is the sort order (overdue-first, then soonest due date, then most
// recent), the member-name join, and the optimistic markDone with revert.

const USER_ID = 'user-1';

let actionRows: Array<{ id: string; text: string; due_date: string | null; created_at: string; member_id: string | null }> = [];
let memberRows: Array<{ id: string; name: string; relationship_type: string }> = [];
let updateError: unknown = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

const mockedAuth = supabase.auth as unknown as { getUser: ReturnType<typeof vi.fn> };
const mockedFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;

function buildSelectBuilder(resolveWith: unknown[]) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'not', 'order', 'in'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: resolveWith, error: null });
  return builder;
}

function buildUpdateBuilder() {
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: null, error: updateError });
  return builder;
}

beforeEach(() => {
  actionRows = [];
  memberRows = [];
  updateError = null;
  mockedAuth.getUser.mockReset();
  mockedAuth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mockedFrom.mockReset();
  mockedFrom.mockImplementation((table: string) => {
    if (table === 'cos_meeting_actions') {
      // update() and select() both start from the same `.from()` call — return
      // a builder whose `.update` and passthrough methods are both wired.
      const b = buildSelectBuilder(actionRows) as Record<string, unknown>;
      b.update = buildUpdateBuilder().update;
      return b;
    }
    if (table === 'cos_team_members') return buildSelectBuilder(memberRows);
    throw new Error(`Unexpected table in test: ${table}`);
  });
});

describe('sortMyTodos', () => {
  const base = (overrides: Partial<MyOneOnOneTodo> & { id: string }): MyOneOnOneTodo => ({
    id: overrides.id,
    text: 'text',
    due_date: null,
    created_at: '2026-07-01T00:00:00Z',
    member_id: 'm1',
    member_name: 'Alex',
    member_relationship_type: 'direct_report',
    ...overrides,
  });

  it('puts overdue items before everything else', () => {
    const todos = [
      base({ id: 'future', due_date: '2099-01-01' }),
      base({ id: 'overdue', due_date: '2000-01-01' }),
    ];
    const sorted = sortMyTodos(todos);
    expect(sorted.map(t => t.id)).toEqual(['overdue', 'future']);
  });

  it('orders non-overdue items by soonest due date', () => {
    const todos = [
      base({ id: 'later', due_date: '2099-06-01' }),
      base({ id: 'soon', due_date: '2099-01-01' }),
      base({ id: 'no-date', due_date: null }),
    ];
    const sorted = sortMyTodos(todos);
    expect(sorted.map(t => t.id)).toEqual(['soon', 'later', 'no-date']);
  });

  it('falls back to most-recently-created when dates tie or are absent', () => {
    const todos = [
      base({ id: 'older', due_date: null, created_at: '2026-01-01T00:00:00Z' }),
      base({ id: 'newer', due_date: null, created_at: '2026-06-01T00:00:00Z' }),
    ];
    const sorted = sortMyTodos(todos);
    expect(sorted.map(t => t.id)).toEqual(['newer', 'older']);
  });
});

describe('useMyOneOnOneTodos', () => {
  it('returns an empty list when there is no authenticated user', async () => {
    mockedAuth.getUser.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useMyOneOnOneTodos());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.todos).toEqual([]);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('joins member names onto the raw action rows', async () => {
    actionRows = [
      { id: 'a1', text: 'Follow up on comp review', due_date: null, created_at: '2026-07-01T00:00:00Z', member_id: 'm1' },
    ];
    memberRows = [{ id: 'm1', name: 'Jamie', relationship_type: 'direct_report' }];

    const { result } = renderHook(() => useMyOneOnOneTodos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.todos).toHaveLength(1);
    expect(result.current.todos[0].member_name).toBe('Jamie');
    expect(result.current.todos[0].member_relationship_type).toBe('direct_report');
  });

  it('groups todos by member for the per-person sections', async () => {
    actionRows = [
      { id: 'a1', text: 'A', due_date: null, created_at: '2026-07-01T00:00:00Z', member_id: 'm1' },
      { id: 'a2', text: 'B', due_date: null, created_at: '2026-07-02T00:00:00Z', member_id: 'm2' },
      { id: 'a3', text: 'C', due_date: null, created_at: '2026-07-03T00:00:00Z', member_id: 'm1' },
    ];
    memberRows = [
      { id: 'm1', name: 'Jamie', relationship_type: 'direct_report' },
      { id: 'm2', name: 'Sam', relationship_type: 'collaborator' },
    ];

    const { result } = renderHook(() => useMyOneOnOneTodos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.groupedByMember).toHaveLength(2);
    const jamie = result.current.groupedByMember.find(g => g.memberId === 'm1');
    expect(jamie?.todos).toHaveLength(2);
  });

  it('counts overdue todos independently of the total', async () => {
    actionRows = [
      { id: 'a1', text: 'Overdue one', due_date: '2000-01-01', created_at: '2026-07-01T00:00:00Z', member_id: 'm1' },
      { id: 'a2', text: 'Future one', due_date: '2099-01-01', created_at: '2026-07-01T00:00:00Z', member_id: 'm1' },
    ];
    memberRows = [{ id: 'm1', name: 'Jamie', relationship_type: 'direct_report' }];

    const { result } = renderHook(() => useMyOneOnOneTodos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.todos).toHaveLength(2);
    expect(result.current.overdueCount).toBe(1);
  });

  it('markDone optimistically removes the todo from the list', async () => {
    actionRows = [
      { id: 'a1', text: 'Ship the doc', due_date: null, created_at: '2026-07-01T00:00:00Z', member_id: 'm1' },
    ];
    memberRows = [{ id: 'm1', name: 'Jamie', relationship_type: 'direct_report' }];

    const { result } = renderHook(() => useMyOneOnOneTodos());
    await waitFor(() => expect(result.current.todos).toHaveLength(1));

    await act(async () => {
      await result.current.markDone('a1');
    });

    expect(result.current.todos).toHaveLength(0);
  });
});
