-- =============================================================================
-- Fix RLS Infinite Recursion on Profiles Table - Alternative Approach
-- Migration: 20251106020000_fix_profiles_rls_separate_table.sql
-- 
-- Problem: Even with SECURITY DEFINER, functions called from RLS policies
-- still trigger RLS checks, causing infinite recursion.
--
-- Solution: Create a separate super_admins table WITHOUT RLS to store
-- super admin status, eliminating the need to query profiles table.
-- =============================================================================

-- Step 1: Create a separate super_admins table WITHOUT RLS
-- -----------------------------------------------------------------------------
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
-- -----------------------------------------------------------------------------
INSERT INTO public.super_admins (user_id)
SELECT id FROM public.profiles WHERE is_super_admin = TRUE
ON CONFLICT (user_id) DO NOTHING;

-- Step 3: Create a new is_super_admin() function that queries the separate table
-- -----------------------------------------------------------------------------
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
-- -----------------------------------------------------------------------------
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

-- Step 5: Verify the fix
-- -----------------------------------------------------------------------------
-- After this migration:
-- 1. is_super_admin() queries super_admins table (no RLS, no recursion)
-- 2. RLS policies can safely call is_super_admin()
-- 3. Changes to profiles.is_super_admin automatically sync to super_admins

