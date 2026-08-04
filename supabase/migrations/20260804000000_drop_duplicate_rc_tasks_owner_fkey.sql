-- ============================================================================
-- Drop duplicate FK constraint on rc_tasks.owner_user_id -> profiles
-- ============================================================================
-- rc_tasks.owner_user_id ended up with two identical foreign key constraints
-- referencing profiles(id): rc_tasks_owner_user_id_fkey and
-- fk_rc_tasks_owner_user_id_profiles. PostgREST can't disambiguate between
-- them when embedding `profiles!owner_user_id`, returning HTTP 300
-- (PGRST201 "multiple relationships found") instead of data. Keep the
-- standard auto-named constraint and drop the redundant one.
-- ============================================================================

ALTER TABLE rc_tasks
  DROP CONSTRAINT IF EXISTS fk_rc_tasks_owner_user_id_profiles;
