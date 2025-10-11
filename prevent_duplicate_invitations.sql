-- Prevent duplicate invitations in the database
-- This ensures the same email can't have multiple pending invitations to the same team

-- First, remove any existing duplicate invitations (keep the most recent one for each email/team combo)
DELETE FROM public.invitations a
USING public.invitations b
WHERE a.id < b.id
  AND a.email = b.email
  AND a.team_id = b.team_id
  AND a.status = 'pending'
  AND b.status = 'pending';

-- Create a unique index to prevent future duplicates
-- This allows only one pending invitation per email per team
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_unique_pending_email_team
  ON public.invitations (email, team_id)
  WHERE status = 'pending';

-- Note: This partial unique index only applies to pending invitations
-- The same email can have multiple accepted/declined invitations (for audit purposes)

