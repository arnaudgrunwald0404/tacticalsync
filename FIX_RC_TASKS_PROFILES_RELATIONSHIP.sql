-- =============================================================================
-- FIX RC_TASKS PROFILES RELATIONSHIP
-- Execute this SQL in Supabase Dashboard → SQL Editor
-- URL: https://supabase.com/dashboard/project/pxirfndomjlqpkwfpqxq/sql
-- =============================================================================
-- 
-- This script fixes the relationship between rc_tasks and profiles so that
-- Supabase can properly resolve the relationship when querying tasks with
-- owner profile information.
--
-- The issue: rc_tasks.owner_user_id references auth.users(id), but the
-- application queries profiles!owner_user_id. Since profiles.id = auth.users.id,
-- we need to add a foreign key constraint to profiles.id so Supabase can
-- find the relationship.
-- =============================================================================

-- Add foreign key constraint from rc_tasks.owner_user_id to profiles.id
-- This allows Supabase to resolve the relationship for queries like:
-- owner:profiles!owner_user_id(...)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_rc_tasks_owner_user_id_profiles'
  ) THEN
    ALTER TABLE rc_tasks 
    ADD CONSTRAINT fk_rc_tasks_owner_user_id_profiles 
    FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Also add constraint for created_by if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_rc_tasks_created_by_profiles'
  ) THEN
    ALTER TABLE rc_tasks 
    ADD CONSTRAINT fk_rc_tasks_created_by_profiles 
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add comments to document the relationships
COMMENT ON COLUMN rc_tasks.owner_user_id IS 'User ID that references profiles.id (same as auth.users.id)';
COMMENT ON COLUMN rc_tasks.created_by IS 'User ID that references profiles.id (same as auth.users.id)';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running this script:
-- 1. The foreign key constraints should be in place
-- 2. Queries like owner:profiles!owner_user_id(...) should work
-- 3. Refresh your dashboard - the error should be resolved
-- =============================================================================

SELECT 'RC Tasks profiles relationship fixed successfully!' as status;

