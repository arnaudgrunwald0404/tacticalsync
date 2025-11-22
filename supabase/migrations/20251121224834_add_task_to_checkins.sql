-- Update rc_checkins to support tasks
-- Add 'task' to parent_type enum
-- ============================================================================

-- Drop the existing check constraint
ALTER TABLE rc_checkins DROP CONSTRAINT IF EXISTS rc_checkins_parent_type_check;

-- Add new constraint with 'task' included
ALTER TABLE rc_checkins ADD CONSTRAINT rc_checkins_parent_type_check 
  CHECK (parent_type IN ('do', 'initiative', 'task'));

COMMENT ON COLUMN rc_checkins.parent_type IS 'Type of parent entity: do, initiative, or task';

