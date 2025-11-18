-- Add participant_user_ids field to rc_strategic_initiatives
-- This allows tracking additional participants who help the owner accomplish the goal

ALTER TABLE rc_strategic_initiatives
ADD COLUMN IF NOT EXISTS participant_user_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_rc_strategic_initiatives_participant_user_ids 
ON rc_strategic_initiatives USING GIN (participant_user_ids);

-- Add comment to document the column
COMMENT ON COLUMN rc_strategic_initiatives.participant_user_ids IS 'Array of user IDs representing additional participants who help the owner accomplish the strategic initiative goal';

