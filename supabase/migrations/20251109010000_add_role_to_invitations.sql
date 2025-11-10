-- Add role column to invitations table if it doesn't exist
-- This migration ensures the invitations table has the role column that the application expects

-- Add the role column with a default value
ALTER TABLE invitations 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member'));

-- Add a comment to document the column
COMMENT ON COLUMN invitations.role IS 'Role that will be assigned to the user when they accept the invitation';


