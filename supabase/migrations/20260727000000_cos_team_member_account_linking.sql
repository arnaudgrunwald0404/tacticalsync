-- Phase 0: account-linking for "People delegation with a paper trail".
--
-- Adds the ability for a cos_team_members row (a manager-owned, free-text
-- contact record — NOT a login) to be linked to the actual TacticalSync
-- account of the person it represents, via an email-verified invite/claim
-- flow. This is a DIFFERENT system from teams/team_members/invitations
-- (the RCDO join-team flow) — cos_team_member_invites is its own table
-- with its own invite_code column, deliberately not reusing teams.invite_code.

-- ── 1. Linking columns on cos_team_members ──────────────────────────────────
ALTER TABLE cos_team_members ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE cos_team_members ADD COLUMN IF NOT EXISTS linked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cos_team_members_linked_user_id
  ON cos_team_members(linked_user_id);

-- Additive RLS: the linked person can read (never write) the row that
-- represents them. This is OR'd with the existing "Users can manage own
-- cos_team_members" policy (Postgres RLS policies of the same command type
-- are combined with OR), so it only ever ADDS visibility for the linked
-- person — it can never reduce the manager's existing rights.
CREATE POLICY "linked user can view own cos_team_members row"
  ON cos_team_members FOR SELECT TO authenticated
  USING (auth.uid() = linked_user_id);

-- ── 2. cos_team_member_invites ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cos_team_member_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invite_code text NOT NULL UNIQUE DEFAULT replace(replace(encode(gen_random_bytes(18), 'base64'), '/', '_'), '+', '-'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cos_team_member_invites_team_member
  ON cos_team_member_invites(team_member_id);
CREATE INDEX IF NOT EXISTS idx_cos_team_member_invites_inviter
  ON cos_team_member_invites(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_cos_team_member_invites_status
  ON cos_team_member_invites(status);
-- invite_code already has a UNIQUE constraint (and its backing index), so
-- lookups by code use that index directly.

ALTER TABLE cos_team_member_invites ENABLE ROW LEVEL SECURITY;

-- The inviter (manager) can see and manage their own outgoing invites.
-- Deliberately NOT granting broad SELECT to all authenticated users: an
-- invite row contains invited_email, and letting any authenticated user
-- list/read arbitrary invite rows would be an enumeration/privacy leak.
-- The claimant's path into an invite they don't yet "own" a relationship to
-- is exclusively through the SECURITY DEFINER functions below, which do
-- their own authorization checks rather than relying on row-level grants.
CREATE POLICY "inviter can manage own cos_team_member_invites"
  ON cos_team_member_invites FOR ALL TO authenticated
  USING (auth.uid() = inviter_user_id)
  WITH CHECK (auth.uid() = inviter_user_id);

-- ── 3. SECURITY DEFINER functions ───────────────────────────────────────────

-- (a) Preview of an invite by exact code. Requires the caller to already be
-- logged in (mirrors JoinTeam.tsx's UX: unauth visitors are redirected to
-- /auth first, then land back on the claim page already authenticated) — so
-- EXECUTE is granted to `authenticated` only, not `anon`. Only supports
-- single-code lookup, never listing, so it cannot be used to enumerate
-- invites. Returns an empty result set (not an error) for invalid/expired
-- codes so the claim page can render a clean message.
CREATE OR REPLACE FUNCTION get_cos_team_member_invite_preview(p_invite_code text)
RETURNS TABLE(
  team_member_name text,
  inviter_name text,
  invited_email text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tm.name AS team_member_name,
    COALESCE(NULLIF(TRIM(inviter_profile.full_name), ''), inviter_user.email) AS inviter_name,
    inv.invited_email,
    inv.status,
    inv.expires_at
  FROM cos_team_member_invites inv
  JOIN cos_team_members tm ON tm.id = inv.team_member_id
  JOIN auth.users inviter_user ON inviter_user.id = inv.inviter_user_id
  LEFT JOIN profiles inviter_profile ON inviter_profile.id = inv.inviter_user_id
  WHERE inv.invite_code = p_invite_code
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_cos_team_member_invite_preview(text) IS
  'SECURITY DEFINER: reads across cos_team_member_invites/cos_team_members/auth.users/profiles '
  'that the caller has no row-level relationship to yet. Safe because it only supports exact '
  'invite_code lookup (no listing/enumeration) and returns non-sensitive preview fields only. '
  'Requires authenticated caller (EXECUTE not granted to anon) to mirror the existing '
  'JoinTeam.tsx auth-gate UX.';

-- (b) Claim an invite as the authenticated caller. Strict email-match
-- boundary: this is the anti-enumeration/anti-hijack check — a caller can
-- only claim an invite addressed to their own verified auth email.
CREATE OR REPLACE FUNCTION claim_cos_team_member_invite(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite cos_team_member_invites%ROWTYPE;
  v_caller_email text;
  v_existing_linked_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_invite
  FROM cos_team_member_invites
  WHERE invite_code = p_invite_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_found');
  END IF;

  IF v_invite.status = 'claimed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  IF v_invite.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_cancelled');
  END IF;

  IF v_invite.status <> 'pending' OR v_invite.expires_at < now() THEN
    -- Lazily mark as expired for future lookups, then report it.
    UPDATE cos_team_member_invites SET status = 'expired' WHERE id = v_invite.id AND status = 'pending';
    RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();

  IF v_caller_email IS NULL OR lower(v_caller_email) <> lower(v_invite.invited_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_mismatch');
  END IF;

  SELECT linked_user_id INTO v_existing_linked_user_id
  FROM cos_team_members
  WHERE id = v_invite.team_member_id
  FOR UPDATE;

  IF v_existing_linked_user_id IS NOT NULL AND v_existing_linked_user_id <> auth.uid() THEN
    -- Never silently overwrite an existing link to a different user.
    RETURN jsonb_build_object('success', false, 'error', 'already_linked_to_other_user');
  END IF;

  UPDATE cos_team_members
  SET linked_user_id = auth.uid(),
      linked_at = now()
  WHERE id = v_invite.team_member_id;

  UPDATE cos_team_member_invites
  SET status = 'claimed',
      claimed_at = now(),
      claimed_by_user_id = auth.uid()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'team_member_id', v_invite.team_member_id);
END;
$$;

COMMENT ON FUNCTION claim_cos_team_member_invite(text) IS
  'SECURITY DEFINER: writes to cos_team_members/cos_team_member_invites on behalf of the caller, '
  'who has no row-level relationship to either row before claiming. Safe because it: (1) requires '
  'auth.uid() to be set, (2) requires the invite''s invited_email to case-insensitively match the '
  'caller''s verified auth.users.email (the anti-hijack boundary — no bypass for "claim on someone '
  'else''s behalf"), (3) rejects already-claimed/cancelled/expired invites, (4) rejects clobbering '
  'an existing different linked_user_id, and (5) locks rows FOR UPDATE to be safe against concurrent '
  'double-claim attempts.';

-- (c) Unlink, callable by either side of the relationship.
CREATE OR REPLACE FUNCTION unlink_cos_team_member(p_team_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_user_id uuid;
  v_linked_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT user_id, linked_user_id INTO v_manager_user_id, v_linked_user_id
  FROM cos_team_members
  WHERE id = p_team_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_member_not_found';
  END IF;

  IF auth.uid() <> v_manager_user_id AND (v_linked_user_id IS NULL OR auth.uid() <> v_linked_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE cos_team_members
  SET linked_user_id = NULL,
      linked_at = NULL
  WHERE id = p_team_member_id;
END;
$$;

COMMENT ON FUNCTION unlink_cos_team_member(uuid) IS
  'SECURITY DEFINER: clears linked_user_id/linked_at on a cos_team_members row. Safe because it '
  'requires the caller to be EITHER the manager (cos_team_members.user_id) OR the linked person '
  '(cos_team_members.linked_user_id) for that specific row — any other caller gets not_authorized.';

-- ── 4. Grants ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_cos_team_member_invite_preview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_cos_team_member_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION unlink_cos_team_member(uuid) TO authenticated;
