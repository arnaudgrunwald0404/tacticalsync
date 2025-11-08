-- =============================================================================
-- FINAL FIX FOR INFINITE RECURSION IN PROFILES RLS
-- This separates policies and fixes the function to avoid recursion
-- =============================================================================

-- Step 1: Fix is_super_admin function to be more RLS-friendly
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN 
LANGUAGE sql 
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

-- Step 2: Drop all existing SELECT policies on profiles
DROP POLICY IF EXISTS "Users can view profiles of team members" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Team members can view each other's profiles" ON public.profiles;

-- Step 3: Create separate, non-overlapping policies
-- Policy 1: Users can always see their own profile (no function call)
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Team members can see each other (no function call)
CREATE POLICY "Team members can view each other's profiles" ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm1
      JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid()
      AND tm2.user_id = profiles.id
    )
  );

-- Policy 3: Super admins can see all (separate policy, function call is isolated)
CREATE POLICY "Super admins can view all profiles" ON public.profiles
  FOR SELECT
  USING (public.is_super_admin());

-- Step 4: Ensure INSERT and UPDATE policies exist
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

SELECT 'All policies updated successfully' as status;
