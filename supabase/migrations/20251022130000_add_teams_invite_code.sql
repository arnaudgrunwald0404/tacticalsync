-- Add invite_code column to teams table
-- This column is needed for team invitation links

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE DEFAULT gen_random_uuid()::text;

-- Create index for performance on invite code lookups
CREATE INDEX IF NOT EXISTS idx_teams_invite_code ON teams(invite_code);

-- Add a comment to document the column
COMMENT ON COLUMN teams.invite_code IS 'Unique code for team invitation links';

-- Update existing teams to have invite codes if they don't have them
UPDATE teams 
SET invite_code = gen_random_uuid()::text 
WHERE invite_code IS NULL;
