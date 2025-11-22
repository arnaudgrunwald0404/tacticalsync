-- Update SI status values to match PRD requirements
-- PRD specifies: Not Started / On Track / At Risk / Off Track / Completed
-- Old values: draft / not_started / active / blocked / done
-- New values: not_started / on_track / at_risk / off_track / completed

-- Step 1: Migrate existing data
UPDATE rc_strategic_initiatives
SET status = CASE
  WHEN status = 'draft' THEN 'not_started'
  WHEN status = 'not_started' THEN 'not_started'
  WHEN status = 'active' THEN 'on_track'
  WHEN status = 'blocked' THEN 'at_risk'
  WHEN status = 'done' THEN 'completed'
  ELSE 'not_started' -- fallback for any unexpected values
END;

-- Step 2: Drop the old CHECK constraint
ALTER TABLE rc_strategic_initiatives
  DROP CONSTRAINT IF EXISTS rc_strategic_initiatives_status_check;

-- Step 3: Add new CHECK constraint with PRD-aligned values
ALTER TABLE rc_strategic_initiatives
  ADD CONSTRAINT rc_strategic_initiatives_status_check
  CHECK (status IN ('not_started', 'on_track', 'at_risk', 'off_track', 'completed'));

-- Step 4: Update default value from 'draft' to 'not_started'
ALTER TABLE rc_strategic_initiatives
  ALTER COLUMN status SET DEFAULT 'not_started';


