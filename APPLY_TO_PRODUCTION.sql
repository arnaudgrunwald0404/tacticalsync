-- =============================================================================
-- FIX RLS INFINITE RECURSION - PRODUCTION
-- Execute this SQL in Supabase Dashboard → SQL Editor
-- URL: https://supabase.com/dashboard/project/pxirfndomjlqpkwfpqxq/sql
-- =============================================================================
-- 
-- This script fixes the infinite recursion error in RLS policies by:
-- 1. Creating a separate super_admins table without RLS
-- 2. Fixing is_super_admin() to query super_admins instead of profiles
-- 3. Removing all profiles table queries from other RLS policies
-- 4. Using auth.jwt() ->> 'email' instead of querying profiles
-- =============================================================================

-- =============================================================================
-- PART 1: Create super_admins table and fix is_super_admin() function
-- =============================================================================

-- Step 1: Create a separate super_admins table WITHOUT RLS
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Disable RLS on this table - we want direct access without policy checks
ALTER TABLE public.super_admins DISABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users (they can read, but only service role can write)
GRANT SELECT ON public.super_admins TO authenticated;
GRANT SELECT ON public.super_admins TO anon;

COMMENT ON TABLE public.super_admins IS 'Stores super admin user IDs. No RLS to avoid recursion when checking admin status.';

-- Step 2: Migrate existing super admins from profiles table
INSERT INTO public.super_admins (user_id)
SELECT id FROM public.profiles WHERE is_super_admin = TRUE
ON CONFLICT (user_id) DO NOTHING;

-- Step 3: Create a new is_super_admin() function that queries the separate table
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN 
LANGUAGE sql 
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_super_admin() IS 'Returns true if the current user is a super admin. Queries super_admins table which has no RLS to avoid recursion.';

-- Step 4: Create triggers to keep super_admins table in sync with profiles.is_super_admin
CREATE OR REPLACE FUNCTION public.sync_super_admin_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_super_admin = TRUE THEN
    INSERT INTO public.super_admins (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sync_super_admin_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_super_admin IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE) THEN
    IF NEW.is_super_admin = TRUE THEN
      INSERT INTO public.super_admins (user_id) VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;
    ELSE
      DELETE FROM public.super_admins WHERE user_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop triggers if they exist
DROP TRIGGER IF EXISTS sync_super_admin_on_profiles_insert ON public.profiles;
DROP TRIGGER IF EXISTS sync_super_admin_on_profiles_update ON public.profiles;

-- Create triggers to sync when profiles.is_super_admin changes
CREATE TRIGGER sync_super_admin_on_profiles_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.is_super_admin = TRUE)
  EXECUTE FUNCTION public.sync_super_admin_on_insert();

CREATE TRIGGER sync_super_admin_on_profiles_update
  AFTER UPDATE OF is_super_admin ON public.profiles
  FOR EACH ROW
  WHEN (NEW.is_super_admin IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE))
  EXECUTE FUNCTION public.sync_super_admin_on_update();

COMMENT ON FUNCTION public.sync_super_admin_on_insert() IS 'Syncs super_admins table when a profile is inserted with is_super_admin = true.';
COMMENT ON FUNCTION public.sync_super_admin_on_update() IS 'Syncs super_admins table when profiles.is_super_admin column changes.';

-- =============================================================================
-- PART 2: Fix profiles RLS policies
-- =============================================================================

-- Drop ALL existing SELECT policies on profiles to start clean
DROP POLICY IF EXISTS "Users can view profiles of team members" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Team members can view each other's profiles" ON public.profiles;

-- Create three separate, non-overlapping SELECT policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

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

CREATE POLICY "Super admins can view all profiles" ON public.profiles
  FOR SELECT
  USING (public.is_super_admin());

-- Ensure INSERT and UPDATE policies exist and are correct
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================================================
-- PART 3: Fix invitations RLS policy
-- =============================================================================

DROP POLICY IF EXISTS "Users can view invitations sent to them" ON public.invitations;

CREATE POLICY "Users can view invitations sent to them" ON public.invitations
  FOR SELECT
  USING (
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR is_super_admin()
  );

COMMENT ON POLICY "Users can view invitations sent to them" ON public.invitations IS 
'Allows users to view invitations sent to their email. Uses JWT email to avoid querying profiles table and causing RLS recursion.';

-- =============================================================================
-- PART 4: Fix other RLS policies that query profiles
-- =============================================================================

-- Fix teams policy
DROP POLICY IF EXISTS "Users can view teams they belong to" ON public.teams;

CREATE POLICY "Users can view teams they belong to" ON public.teams
  FOR SELECT
  USING (
    auth.uid() = created_by
    OR is_super_admin()
    OR is_team_member(id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM invitations
      WHERE invitations.team_id = teams.id
      AND invitations.status = 'pending'
      AND LOWER(invitations.email) = LOWER(auth.jwt() ->> 'email')
    )
  );

-- Fix agenda_templates policy
DROP POLICY IF EXISTS "Users manage own templates" ON public.agenda_templates;

CREATE POLICY "Users manage own templates" ON public.agenda_templates
  FOR ALL
  USING (
    auth.uid() = user_id
    OR (is_system = true AND LOWER(auth.jwt() ->> 'email') = 'agrunwald@clearcompany.com')
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (is_system = true AND LOWER(auth.jwt() ->> 'email') = 'agrunwald@clearcompany.com')
  );

-- Fix agenda_template_items policy
DROP POLICY IF EXISTS "Users manage own template items" ON public.agenda_template_items;

CREATE POLICY "Users manage own template items" ON public.agenda_template_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agenda_templates t
      WHERE t.id = agenda_template_items.template_id
      AND (
        auth.uid() = t.user_id
        OR (t.is_system = true AND LOWER(auth.jwt() ->> 'email') = 'agrunwald@clearcompany.com')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agenda_templates t
      WHERE t.id = agenda_template_items.template_id
      AND (
        auth.uid() = t.user_id
        OR (t.is_system = true AND LOWER(auth.jwt() ->> 'email') = 'agrunwald@clearcompany.com')
      )
    )
  );

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running this script:
-- 1. No policies should query profiles table (except policies on profiles itself)
-- 2. is_super_admin() queries super_admins table (no RLS, no recursion)
-- 3. All email checks use auth.jwt() ->> 'email' instead of profiles table
-- 4. Refresh your dashboard - infinite recursion errors should be gone
-- =============================================================================

SELECT 'All migrations applied successfully!' as status;




