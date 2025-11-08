-- Create function to get user login information
-- This allows super admins to see when users last logged in

CREATE OR REPLACE FUNCTION public.get_user_login_info(user_id UUID)
RETURNS TABLE (
  has_logged_in BOOLEAN,
  last_active TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_user_record RECORD;
BEGIN
  -- Query auth.users table (requires SECURITY DEFINER)
  SELECT 
    last_sign_in_at,
    created_at
  INTO auth_user_record
  FROM auth.users
  WHERE id = user_id;

  -- Return login info
  RETURN QUERY SELECT
    COALESCE(auth_user_record.last_sign_in_at IS NOT NULL, FALSE) as has_logged_in,
    COALESCE(auth_user_record.last_sign_in_at, auth_user_record.created_at) as last_active;
END;
$$;

COMMENT ON FUNCTION public.get_user_login_info(UUID) IS 'Returns login information for a user. Requires super admin privileges.';

