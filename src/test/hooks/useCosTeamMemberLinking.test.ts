import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCosTeamMemberLinking } from '@/hooks/useCosTeamMemberLinking';
import { supabase } from '@/integrations/supabase/client';

// Mirrors the chainable-builder mock pattern used in useSubSIs.test.ts /
// useInboxValidation.test.ts: `.from(table)` returns a builder whose methods
// (select/eq/in) all return the same builder, and the builder itself is
// awaitable via a configurable resolved value.
vi.mock('@/integrations/supabase/client', () => {
  const from = vi.fn();
  const functionsInvoke = vi.fn();
  const rpc = vi.fn();
  return {
    supabase: {
      from,
      functions: { invoke: functionsInvoke },
      rpc,
    },
  };
});

const mockedSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  functions: { invoke: ReturnType<typeof vi.fn> };
  rpc: ReturnType<typeof vi.fn>;
};

const USER_ID = '11111111-1111-1111-1111-111111111111';

function makeBuilder(resolvedValue: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'in'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  // Awaitable: `await query` resolves to the configured value.
  (builder as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(onFulfilled);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCosTeamMemberLinking', () => {
  it('returns empty lists and stops loading when userId is null', async () => {
    const { result } = renderHook(() => useCosTeamMemberLinking(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.yourTeam).toEqual([]);
    expect(result.current.linkedToYou).toEqual([]);
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('fetches "your team" with pending invites merged in, and "linked to you" separately', async () => {
    const ownRows = [
      { id: 'tm-1', name: 'Alice', email: 'alice@example.com', role: 'Engineer', relationship_type: 'direct_report', linked_user_id: null, linked_at: null },
      { id: 'tm-2', name: 'Bob', email: 'bob@example.com', role: 'Designer', relationship_type: 'direct_report', linked_user_id: 'user-bob', linked_at: '2026-01-01T00:00:00Z' },
    ];
    const invites = [
      { id: 'inv-1', team_member_id: 'tm-1', invited_email: 'alice@example.com', created_at: '2026-01-02T00:00:00Z', expires_at: '2026-01-09T00:00:00Z', status: 'pending' },
    ];
    const linkedRows = [
      { id: 'tm-3', name: 'Carol', role: 'Manager', relationship_type: 'collaborator', linked_at: '2026-01-03T00:00:00Z', user_id: 'manager-carol' },
    ];

    mockedSupabase.from
      .mockReturnValueOnce(makeBuilder({ data: ownRows, error: null })) // cos_team_members (own rows)
      .mockReturnValueOnce(makeBuilder({ data: invites, error: null })) // cos_team_member_invites
      .mockReturnValueOnce(makeBuilder({ data: linkedRows, error: null })); // cos_team_members (linked to you)

    const { result } = renderHook(() => useCosTeamMemberLinking(USER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.yourTeam).toHaveLength(2);
    const alice = result.current.yourTeam.find(m => m.id === 'tm-1');
    expect(alice?.pendingInvite).toMatchObject({ id: 'inv-1', invited_email: 'alice@example.com' });
    const bob = result.current.yourTeam.find(m => m.id === 'tm-2');
    expect(bob?.linked_user_id).toBe('user-bob');
    expect(bob?.pendingInvite).toBeNull();

    expect(result.current.linkedToYou).toHaveLength(1);
    expect(result.current.linkedToYou[0]).toMatchObject({ id: 'tm-3', name: 'Carol', managerUserId: 'manager-carol' });
  });

  it('surfaces an error and empty lists when the fetch fails', async () => {
    mockedSupabase.from.mockReturnValueOnce(makeBuilder({ data: null, error: new Error('boom') }));

    const { result } = renderHook(() => useCosTeamMemberLinking(USER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.yourTeam).toEqual([]);
  });

  describe('sendInvite', () => {
    it('invokes the edge function and refreshes on success', async () => {
      mockedSupabase.from
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }));
      mockedSupabase.functions.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { result } = renderHook(() => useCosTeamMemberLinking(USER_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Refresh call after a successful invite.
      mockedSupabase.from
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }));

      let outcome: { success: boolean; error?: string } | undefined;
      await act(async () => {
        outcome = await result.current.sendInvite('tm-1', 'alice@example.com');
      });

      expect(outcome).toEqual({ success: true });
      expect(mockedSupabase.functions.invoke).toHaveBeenCalledWith('send-cos-team-member-invite', {
        body: { teamMemberId: 'tm-1', email: 'alice@example.com' },
      });
    });

    it('returns success:false with the server error when the function reports failure', async () => {
      mockedSupabase.from
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }));
      mockedSupabase.functions.invoke.mockResolvedValueOnce({ data: { success: false, error: 'forbidden' }, error: null });

      const { result } = renderHook(() => useCosTeamMemberLinking(USER_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let outcome: { success: boolean; error?: string } | undefined;
      await act(async () => {
        outcome = await result.current.sendInvite('tm-1', 'alice@example.com');
      });

      expect(outcome).toEqual({ success: false, error: 'forbidden' });
    });
  });

  describe('unlink', () => {
    it('calls the unlink RPC and refreshes on success', async () => {
      mockedSupabase.from
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }));
      mockedSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      const { result } = renderHook(() => useCosTeamMemberLinking(USER_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockedSupabase.from
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }));

      let outcome: { success: boolean; error?: string } | undefined;
      await act(async () => {
        outcome = await result.current.unlink('tm-1');
      });

      expect(outcome).toEqual({ success: true });
      expect(mockedSupabase.rpc).toHaveBeenCalledWith('unlink_cos_team_member', { p_team_member_id: 'tm-1' });
    });

    it('returns success:false when the RPC errors (e.g. not_authorized)', async () => {
      mockedSupabase.from
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }));
      mockedSupabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('not_authorized') });

      const { result } = renderHook(() => useCosTeamMemberLinking(USER_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let outcome: { success: boolean; error?: string } | undefined;
      await act(async () => {
        outcome = await result.current.unlink('tm-1');
      });

      expect(outcome?.success).toBe(false);
      expect(outcome?.error).toContain('not_authorized');
    });
  });
});
