-- Fix rc_tasks to reference profiles instead of auth.users for owner_user_id
-- ============================================================================
-- rc_tasks was added (20251121224833_create_tasks_table.sql) after the RCDO
-- owner-FK-to-profiles fix (20251113000000_fix_rcdo_profiles_relationship.sql
-- and 20251113233500_fix_fk_rcdo_profiles_if_missing.sql) and never received
-- the same treatment. Every `owner:profiles!owner_user_id(...)` embed in
-- useTasks.ts (src/hooks/useTasks.ts) fails with PGRST200 ("Could not find a
-- relationship between 'rc_tasks' and 'profiles'") because PostgREST needs a
-- direct FK to the embedded table, and owner_user_id only pointed at
-- auth.users. Since profiles.id references auth.users.id with ON DELETE
-- CASCADE, repointing the FK preserves the same referential integrity.
-- ============================================================================

ALTER TABLE rc_tasks
  DROP CONSTRAINT IF EXISTS rc_tasks_owner_user_id_fkey,
  ADD CONSTRAINT rc_tasks_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
