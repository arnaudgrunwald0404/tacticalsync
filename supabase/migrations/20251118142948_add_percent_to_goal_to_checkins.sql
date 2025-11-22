-- Add percent_to_goal column to rc_checkins table
-- This stores the percentage progress toward goal (0-100) for each check-in
-- This creates a time-series audit trail of progress updates

ALTER TABLE rc_checkins
ADD COLUMN IF NOT EXISTS percent_to_goal INTEGER CHECK (percent_to_goal >= 0 AND percent_to_goal <= 100);

COMMENT ON COLUMN rc_checkins.percent_to_goal IS 'Percentage progress toward goal (0-100) for Strategic Initiatives, updated during check-ins';




