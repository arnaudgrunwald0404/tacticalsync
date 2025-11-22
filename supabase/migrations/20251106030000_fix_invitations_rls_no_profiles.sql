-- =============================================================================
-- Fix Invitations RLS Policy - Remove profiles table query
-- Migration: 20251106030000_fix_invitations_rls_no_profiles.sql
-- 
-- Problem: The "Users can view invitations sent to them" policy queries
-- the profiles table, which triggers RLS policies and causes recursion.
--
-- Solution: Use auth.jwt() ->> 'email' instead of querying profiles table.
-- =============================================================================

-- Drop the problematic policy that queries profiles table
DROP POLICY IF EXISTS "Users can view invitations sent to them" ON public.invitations;

-- Create new policy that uses JWT email instead of querying profiles
CREATE POLICY "Users can view invitations sent to them" ON public.invitations
  FOR SELECT
  USING (
    -- Match by JWT email (no profiles table query, no recursion)
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR
    -- Super admins can see all (uses super_admins table, no recursion)
    is_super_admin()
  );

COMMENT ON POLICY "Users can view invitations sent to them" ON public.invitations IS 
'Allows users to view invitations sent to their email. Uses JWT email to avoid querying profiles table and causing RLS recursion.';







