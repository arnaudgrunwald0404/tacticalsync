-- The delegatee's inbox needs to render "From Dan · 3 days ago" (PLAN
-- §8.3), which requires reading the delegator's display name. `profiles`
-- RLS only lets a user read their own row (20251017000000_basic_tables.sql),
-- so the delegatee has no row-level path to the delegator's name — the same
-- "read across a relationship the caller doesn't otherwise have access to"
-- situation get_cos_team_member_invite_preview already solves for invites.
-- Same pattern here: a narrow, single-purpose SECURITY DEFINER function,
-- not a broadened RLS policy on profiles.

CREATE OR REPLACE FUNCTION get_inbox_delegation_display_names(p_delegation_ids uuid[])
RETURNS TABLE(
  delegation_id uuid,
  delegator_name text,
  delegatee_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be a party (delegator or delegatee) to every row they ask
  -- about — this function does not let an arbitrary caller resolve names for
  -- delegations they have no part in.
  RETURN QUERY
  SELECT
    d.id AS delegation_id,
    COALESCE(NULLIF(TRIM(delegator_profile.full_name), ''), delegator_user.email) AS delegator_name,
    COALESCE(NULLIF(TRIM(delegatee_profile.full_name), ''), delegatee_user.email) AS delegatee_name
  FROM inbox_item_delegations d
  JOIN auth.users delegator_user ON delegator_user.id = d.delegator_user_id
  JOIN auth.users delegatee_user ON delegatee_user.id = d.delegatee_user_id
  LEFT JOIN profiles delegator_profile ON delegator_profile.id = d.delegator_user_id
  LEFT JOIN profiles delegatee_profile ON delegatee_profile.id = d.delegatee_user_id
  WHERE d.id = ANY(p_delegation_ids)
    AND (auth.uid() = d.delegator_user_id OR auth.uid() = d.delegatee_user_id);
END;
$$;

COMMENT ON FUNCTION get_inbox_delegation_display_names(uuid[]) IS
  'SECURITY DEFINER: resolves display names for delegator/delegatee across '
  'auth.users/profiles, which the caller has no row-level SELECT access to '
  'beyond their own profile row. Safe because it only returns rows where the '
  'caller is the named delegator OR delegatee — never an arbitrary '
  'delegation_id the caller has no relationship to.';

GRANT EXECUTE ON FUNCTION get_inbox_delegation_display_names(uuid[]) TO authenticated;
