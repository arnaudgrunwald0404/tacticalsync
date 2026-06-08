-- Batch version of get_user_login_info to avoid N+1 RPC calls.
-- Accepts an array of user IDs and returns login info for all of them in one round-trip.

CREATE OR REPLACE FUNCTION public.get_users_login_info_batch(user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  has_logged_in BOOLEAN,
  last_active TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    (u.last_sign_in_at IS NOT NULL) AS has_logged_in,
    COALESCE(u.last_sign_in_at, u.created_at) AS last_active
  FROM auth.users u
  WHERE u.id = ANY(user_ids);
END;
$$;

COMMENT ON FUNCTION public.get_users_login_info_batch(UUID[]) IS 'Returns login information for multiple users in a single call. Requires super admin privileges.';
