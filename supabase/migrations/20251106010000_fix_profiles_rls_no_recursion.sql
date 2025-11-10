-- =============================================================================
-- Fix RLS Infinite Recursion on Profiles Table
-- Migration: 20251106010000_fix_profiles_rls_no_recursion.sql
-- 
-- Problem: RLS policies on profiles table call is_super_admin() which queries
-- profiles, causing infinite recursion even with SECURITY DEFINER.
--
-- Solution: 
-- 1. Fix is_super_admin() to bypass RLS using SET LOCAL row_security = off
-- 2. Drop all existing SELECT policies and create separate non-overlapping ones
-- 3. Ensure policies don't call functions that query profiles directly
-- =============================================================================

-- Step 1: Fix is_super_admin() function to bypass RLS completely
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result BOOLEAN;
BEGIN
  -- Temporarily disable RLS for this function's execution
  -- This allows the function to read profiles without triggering RLS policies
  PERFORM set_config('row_security', 'off', true);
  
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    false
  ) INTO result;
  
  -- Re-enable RLS (though this is local to the function)
  PERFORM set_config('row_security', 'on', true);
  
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.is_super_admin() IS 'Returns true if the current user is a super admin. Uses RLS bypass to avoid recursion.';

-- Step 2: Drop ALL existing SELECT policies on profiles to start clean
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view profiles of team members" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Team members can view each other's profiles" ON public.profiles;

-- Step 3: Create three separate, non-overlapping SELECT policies
-- Policy order matters: PostgreSQL evaluates them in order and stops at first match
-- -----------------------------------------------------------------------------

-- Policy 1: Users can always see their own profile (no function calls, no recursion)
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Team members can see each other's profiles (no function calls, uses team_members table)
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

-- Policy 3: Super admins can see all profiles (uses fixed function that bypasses RLS)
CREATE POLICY "Super admins can view all profiles" ON public.profiles
  FOR SELECT
  USING (public.is_super_admin());

-- Step 4: Ensure INSERT and UPDATE policies exist and are correct
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Step 5: Verify the fix
-- -----------------------------------------------------------------------------
-- After this migration, test:
-- 1. Users can fetch their own profile
-- 2. Team members can see each other's profiles
-- 3. Super admins can see all profiles
-- 4. No infinite recursion errors occur


