-- Add expires_at column to invitations table
-- This column is needed for invitation expiration logic

ALTER TABLE invitations 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');

-- Create index for performance on expiration queries
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON invitations(expires_at);

-- Add a comment to document the column
COMMENT ON COLUMN invitations.expires_at IS 'When the invitation expires (default: 7 days from creation)';
