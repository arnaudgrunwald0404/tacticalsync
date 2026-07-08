import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Phase 0 account-linking: fetches both directions of the relationship
 * between the current user and their cos_team_members rows, and exposes
 * actions to send/resend an invite or unlink.
 *
 * Hand-rolled useState/useEffect (not React Query), matching the existing
 * convention for cos_* hooks (see useTeamMembers.ts). cos_team_member_invites
 * and the linking columns on cos_team_members are not yet in the generated
 * Supabase types, so this follows CosZoomSyncPanel.tsx's escape hatch of
 * `(supabase as any)` for those calls.
 */

export interface OutgoingTeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  relationship_type: string;
  linked_user_id: string | null;
  linked_at: string | null;
  pendingInvite: {
    id: string;
    invited_email: string;
    created_at: string;
    expires_at: string;
  } | null;
}

export interface IncomingLinkedMember {
  id: string;
  name: string;
  role: string;
  relationship_type: string;
  linked_at: string | null;
  managerUserId: string;
}

interface UseCosTeamMemberLinkingResult {
  loading: boolean;
  yourTeam: OutgoingTeamMember[];
  linkedToYou: IncomingLinkedMember[];
  error: string | null;
  refresh: () => Promise<void>;
  sendInvite: (teamMemberId: string, email: string) => Promise<{ success: boolean; error?: string }>;
  resendInvite: (teamMemberId: string, email: string) => Promise<{ success: boolean; error?: string }>;
  unlink: (teamMemberId: string) => Promise<{ success: boolean; error?: string }>;
}

export function useCosTeamMemberLinking(userId: string | null): UseCosTeamMemberLinkingResult {
  const [loading, setLoading] = useState(true);
  const [yourTeam, setYourTeam] = useState<OutgoingTeamMember[]>([]);
  const [linkedToYou, setLinkedToYou] = useState<IncomingLinkedMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setYourTeam([]);
      setLinkedToYou([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // "Your team": rows you manage, via the existing owner policy.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ownRows, error: ownErr } = await (supabase as any)
        .from('cos_team_members')
        .select('id, name, email, role, relationship_type, linked_user_id, linked_at')
        .eq('user_id', userId);

      if (ownErr) throw ownErr;

      const teamRows = (ownRows ?? []) as Array<{
        id: string;
        name: string;
        email: string | null;
        role: string;
        relationship_type: string;
        linked_user_id: string | null;
        linked_at: string | null;
      }>;

      // Pending invites for those rows (RLS: only the inviter can see their
      // own outgoing invites, so this naturally scopes to `userId`'s invites).
      const teamMemberIds = teamRows.map(r => r.id);
      let pendingByTeamMemberId = new Map<string, { id: string; invited_email: string; created_at: string; expires_at: string }>();

      if (teamMemberIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invites, error: invitesErr } = await (supabase as any)
          .from('cos_team_member_invites')
          .select('id, team_member_id, invited_email, created_at, expires_at, status')
          .in('team_member_id', teamMemberIds)
          .eq('status', 'pending');

        if (invitesErr) throw invitesErr;

        pendingByTeamMemberId = new Map(
          ((invites ?? []) as Array<{ id: string; team_member_id: string; invited_email: string; created_at: string; expires_at: string }>)
            .map(inv => [inv.team_member_id, { id: inv.id, invited_email: inv.invited_email, created_at: inv.created_at, expires_at: inv.expires_at }])
        );
      }

      const outgoing: OutgoingTeamMember[] = teamRows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        relationship_type: r.relationship_type,
        linked_user_id: r.linked_user_id,
        linked_at: r.linked_at,
        pendingInvite: pendingByTeamMemberId.get(r.id) ?? null,
      }));

      // "People who can send you items": rows where you ARE the linked
      // person, visible only via the additive linked-user SELECT policy.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: linkedRows, error: linkedErr } = await (supabase as any)
        .from('cos_team_members')
        .select('id, name, role, relationship_type, linked_at, user_id')
        .eq('linked_user_id', userId);

      if (linkedErr) throw linkedErr;

      const incoming: IncomingLinkedMember[] = ((linkedRows ?? []) as Array<{
        id: string;
        name: string;
        role: string;
        relationship_type: string;
        linked_at: string | null;
        user_id: string;
      }>).map(r => ({
        id: r.id,
        name: r.name,
        role: r.role,
        relationship_type: r.relationship_type,
        linked_at: r.linked_at,
        managerUserId: r.user_id,
      }));

      setYourTeam(outgoing);
      setLinkedToYou(incoming);
    } catch (err) {
      console.error('useCosTeamMemberLinking: failed to load', err);
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const invokeSendInvite = useCallback(async (teamMemberId: string, email: string) => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('send-cos-team-member-invite', {
        body: { teamMemberId, email },
      });
      if (fnError) throw fnError;
      const result = (data ?? {}) as { success?: boolean; error?: string };
      if (!result.success) {
        return { success: false, error: result.error ?? 'unknown_error' };
      }
      await load();
      return { success: true };
    } catch (err) {
      console.error('useCosTeamMemberLinking: sendInvite failed', err);
      return { success: false, error: err instanceof Error ? err.message : 'unknown_error' };
    }
  }, [load]);

  const unlink = useCallback(async (teamMemberId: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcError } = await (supabase as any).rpc('unlink_cos_team_member', {
        p_team_member_id: teamMemberId,
      });
      if (rpcError) throw rpcError;
      await load();
      return { success: true };
    } catch (err) {
      console.error('useCosTeamMemberLinking: unlink failed', err);
      return { success: false, error: err instanceof Error ? err.message : 'unknown_error' };
    }
  }, [load]);

  return {
    loading,
    yourTeam,
    linkedToYou,
    error,
    refresh: load,
    sendInvite: invokeSendInvite,
    resendInvite: invokeSendInvite,
    unlink,
  };
}
