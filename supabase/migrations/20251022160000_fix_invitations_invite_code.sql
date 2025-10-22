-- Fix invitations table to auto-generate invite_code
-- The issue is that invite_code is NOT NULL but not being provided in the code

-- Add a default value for invite_code column
ALTER TABLE invitations 
ALTER COLUMN invite_code SET DEFAULT gen_random_uuid()::text;

-- Update existing invitations that might have NULL invite_code
UPDATE invitations 
SET invite_code = gen_random_uuid()::text 
WHERE invite_code IS NULL;

-- Add a comment to document the change
COMMENT ON COLUMN invitations.invite_code IS 'Unique code for invitation links (auto-generated if not provided)';
