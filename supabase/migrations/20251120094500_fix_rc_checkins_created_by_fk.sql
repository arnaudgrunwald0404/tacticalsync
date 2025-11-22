-- Fix rc_checkins.created_by foreign key to reference profiles(id)
-- This enables PostgREST relationship hints like profiles!created_by

ALTER TABLE rc_checkins
  DROP CONSTRAINT IF EXISTS rc_checkins_created_by_fkey,
  ADD CONSTRAINT rc_checkins_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

COMMENT ON COLUMN rc_checkins.created_by IS 'User who created the check-in (references profiles.id)';
