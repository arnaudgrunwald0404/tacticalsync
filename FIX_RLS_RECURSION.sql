-- =============================================================================
-- FIX INFINITE RECURSION IN PROFILES RLS POLICY
-- Execute this SQL in Supabase SQL Editor to fix the recursion issue
-- =============================================================================

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Users can view profiles of team members" ON public.profiles;

-- Create new policy using SECURITY DEFINER function to avoid recursion
CREATE POLICY "Users can view profiles of team members" ON public.profiles
  FOR SELECT
  USING (
    -- Users can see their own profile
    auth.uid() = id
    OR
    -- Users can see profiles of other team members
    EXISTS (
      SELECT 1 FROM public.team_members tm1
      JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid()
      AND tm2.user_id = profiles.id
    )
    OR
    -- Super admins can see all profiles (using SECURITY DEFINER function to avoid recursion)
    public.is_super_admin()
  );

-- Ensure users can insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Ensure users can update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running this, test by refreshing your dashboard
-- The "infinite recursion" errors should be gone
-- =============================================================================

