-- ============================================================================
-- Drop duplicate FK constraint on rc_tasks.created_by
-- ============================================================================
-- rc_tasks.created_by has two foreign key constraints:
--   fk_rc_tasks_created_by_profiles -> profiles(id)
--   rc_tasks_created_by_fkey        -> auth.users(id)
-- This is the same pattern that caused HTTP 300 (PGRST201) on
-- profiles!owner_user_id embeds, fixed in
-- 20260804000000_drop_duplicate_rc_tasks_owner_fkey.sql. The moment a query
-- embeds `profiles!created_by` (e.g. a task creator lookup), PostgREST will
-- be unable to disambiguate and return the same error.
--
-- Every other rc_* table (rc_cycles, rc_defining_objectives,
-- rc_strategic_initiatives, rc_checkins, rc_links) was deliberately migrated
-- to point created_by at profiles(id) instead of auth.users(id) specifically
-- to support PostgREST relationship embedding. Keep rc_tasks consistent with
-- that convention: drop the auth.users-referencing constraint and retain the
-- profiles one.
-- ============================================================================

ALTER TABLE rc_tasks
  DROP CONSTRAINT IF EXISTS rc_tasks_created_by_fkey;
