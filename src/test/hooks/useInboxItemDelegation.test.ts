import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useOutgoingDelegation,
  useIncomingDelegations,
  useIncomingDelegationForItem,
  delegateInboxItemToPerson,
  cancelInboxItemDelegation,
} from '@/hooks/useInboxItemDelegation';
import { supabase } from '@/integrations/supabase/client';

// Mirrors the chainable-builder mock pattern used in useCosTeamMemberLinking.test.ts:
// `.from(table)` returns a builder whose methods all return the same builder,
// and the builder itself is awaitable via a configurable resolved value.
// `.channel(...)` returns a minimal chainable stub (`.on().subscribe()`) since
// these hooks subscribe to realtime but the tests here only exercise the
// initial fetch, not live updates.
vi.mock('@/integrations/supabase/client', () => {
  const from = vi.fn();
  const functionsInvoke = vi.fn();
  const rpc = vi.fn();
  const channel = vi.fn(() => {
    const chan: Record<string, unknown> = {};
    chan.on = vi.fn(() => chan);
    chan.subscribe = vi.fn(() => chan);
    return chan;
  });
  const removeChannel = vi.fn();
  return {
    supabase: {
      from,
      functions: { invoke: functionsInvoke },
      rpc,
      channel,
      removeChannel,
    },
  };
});

const mockedSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  functions: { invoke: ReturnType<typeof vi.fn> };
  rpc: ReturnType<typeof vi.fn>;
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
};

function makeBuilder(resolvedValue: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'in', 'order', 'limit', 'update'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolvedValue));
  // Awaitable for calls that don't terminate with maybeSingle (e.g. plain
  // `.select().eq().in()` list queries).
  (builder as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(onFulfilled);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const DELEGATION_ID = 'd1111111-1111-1111-1111-111111111111';
const SOURCE_ITEM_ID = 'i1111111-1111-1111-1111-111111111111';
const DELEGATEE_ITEM_ID = 'i2222222-2222-2222-2222-222222222222';
const DELEGATOR_ID = 'u1111111-1111-1111-1111-111111111111';
const DELEGATEE_ID = 'u2222222-2222-2222-2222-222222222222';

const baseDelegationRow = {
  id: DELEGATION_ID,
  source_item_id: SOURCE_ITEM_ID,
  delegator_user_id: DELEGATOR_ID,
  delegatee_user_id: DELEGATEE_ID,
  delegatee_item_id: DELEGATEE_ITEM_ID,
  team_member_id: 'tm-1',
  status: 'pending',
  note: 'Please review before Friday',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  completed_at: null,
};

describe('delegateInboxItemToPerson', () => {
  it('returns success with the created ids on a successful invoke', async () => {
    mockedSupabase.functions.invoke.mockResolvedValueOnce({
      data: { success: true, delegationId: DELEGATION_ID, delegateeItemId: DELEGATEE_ITEM_ID },
      error: null,
    });

    const result = await delegateInboxItemToPerson(SOURCE_ITEM_ID, 'tm-1', 'a note');

    expect(result).toEqual({ success: true, delegationId: DELEGATION_ID, delegateeItemId: DELEGATEE_ITEM_ID });
    expect(mockedSupabase.functions.invoke).toHaveBeenCalledWith('delegate-inbox-item-to-person', {
      body: { sourceItemId: SOURCE_ITEM_ID, teamMemberId: 'tm-1', note: 'a note' },
    });
  });

  it('surfaces the server-reported error when the function reports failure', async () => {
    mockedSupabase.functions.invoke.mockResolvedValueOnce({
      data: { success: false, error: 'not_linked' },
      error: null,
    });

    const result = await delegateInboxItemToPerson(SOURCE_ITEM_ID, 'tm-1');

    expect(result).toEqual({ success: false, error: 'not_linked' });
  });

  it('returns success:false when the invoke call itself throws', async () => {
    mockedSupabase.functions.invoke.mockRejectedValueOnce(new Error('network down'));

    const result = await delegateInboxItemToPerson(SOURCE_ITEM_ID, 'tm-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });
});

describe('cancelInboxItemDelegation', () => {
  it('updates the delegation status to cancelled and reports success', async () => {
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: null, error: null }));

    const result = await cancelInboxItemDelegation(DELEGATION_ID);

    expect(result).toEqual({ success: true });
    expect(mockedSupabase.from).toHaveBeenCalledWith('inbox_item_delegations');
  });

  it('reports failure when the update errors', async () => {
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: null, error: new Error('boom') }));

    const result = await cancelInboxItemDelegation(DELEGATION_ID);

    expect(result.success).toBe(false);
  });
});

describe('useOutgoingDelegation', () => {
  it('returns null without querying when sourceItemId is null', async () => {
    const { result } = renderHook(() => useOutgoingDelegation(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.delegation).toBeNull();
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('fetches the live delegation and resolves the delegatee display name', async () => {
    mockedSupabase.from
      .mockReturnValueOnce(makeBuilder({ data: baseDelegationRow, error: null })) // inbox_item_delegations
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: [{ delegation_id: DELEGATION_ID, delegator_name: 'Dan Pope', delegatee_name: 'Alex Chen' }],
      error: null,
    });

    const { result } = renderHook(() => useOutgoingDelegation(SOURCE_ITEM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.delegation).toMatchObject({
      id: DELEGATION_ID,
      delegateeName: 'Alex Chen',
      note: 'Please review before Friday',
    });
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('get_inbox_delegation_display_names', {
      p_delegation_ids: [DELEGATION_ID],
    });
  });

  it('falls back to a generic label when the names RPC returns nothing', async () => {
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: baseDelegationRow, error: null }));
    mockedSupabase.rpc.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useOutgoingDelegation(SOURCE_ITEM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.delegation?.delegateeName).toBe('teammate');
  });

  it('returns null when there is no live delegation for the item', async () => {
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: null, error: null }));

    const { result } = renderHook(() => useOutgoingDelegation(SOURCE_ITEM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.delegation).toBeNull();
    expect(mockedSupabase.rpc).not.toHaveBeenCalled();
  });
});

describe('useIncomingDelegationForItem', () => {
  it('returns null without querying when itemId is null', async () => {
    const { result } = renderHook(() => useIncomingDelegationForItem(null));
    await waitFor(() => expect(mockedSupabase.from).not.toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('resolves the delegator display name for a delegated-to-me item', async () => {
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: baseDelegationRow, error: null }));
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: [{ delegation_id: DELEGATION_ID, delegator_name: 'Dan Pope', delegatee_name: 'Alex Chen' }],
      error: null,
    });

    const { result } = renderHook(() => useIncomingDelegationForItem(DELEGATEE_ITEM_ID));
    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current).toMatchObject({ id: DELEGATION_ID, delegatorName: 'Dan Pope' });
  });

  it('returns null for an item with no incoming delegation', async () => {
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: null, error: null }));

    const { result } = renderHook(() => useIncomingDelegationForItem(DELEGATEE_ITEM_ID));
    await waitFor(() => expect(mockedSupabase.rpc).not.toHaveBeenCalled());

    expect(result.current).toBeNull();
  });
});

describe('useIncomingDelegations', () => {
  it('returns an empty map without querying when userId is null', async () => {
    const { result } = renderHook(() => useIncomingDelegations(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byDelegateeItemId).toEqual({});
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('builds a map keyed by delegatee_item_id with resolved delegator names', async () => {
    const secondRow = { ...baseDelegationRow, id: 'd2222222-2222-2222-2222-222222222222', delegatee_item_id: 'i3333333-3333-3333-3333-333333333333' };
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: [baseDelegationRow, secondRow], error: null }));
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: [
        { delegation_id: baseDelegationRow.id, delegator_name: 'Dan Pope' },
        { delegation_id: secondRow.id, delegator_name: 'Priya Shah' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useIncomingDelegations(DELEGATEE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Object.keys(result.current.byDelegateeItemId)).toHaveLength(2);
    expect(result.current.byDelegateeItemId[DELEGATEE_ITEM_ID]).toMatchObject({ delegatorName: 'Dan Pope' });
    expect(result.current.byDelegateeItemId['i3333333-3333-3333-3333-333333333333']).toMatchObject({ delegatorName: 'Priya Shah' });
  });

  it('skips the names RPC entirely when there are no rows', async () => {
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: [], error: null }));

    const { result } = renderHook(() => useIncomingDelegations(DELEGATEE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byDelegateeItemId).toEqual({});
    expect(mockedSupabase.rpc).not.toHaveBeenCalled();
  });
});
