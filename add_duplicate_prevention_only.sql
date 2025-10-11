-- Add duplicate prevention for invitations
-- This prevents the same email from having multiple pending invitations to the same team

-- Step 1: Remove any existing duplicate invitations (keep the most recent one)
DELETE FROM public.invitations a
USING public.invitations b
WHERE a.id < b.id
  AND a.email = b.email
  AND a.team_id = b.team_id
  AND a.status = 'pending'
  AND b.status = 'pending';

-- Step 2: Create a unique index to prevent future duplicates
-- This allows only one pending invitation per email per team
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_unique_pending_email_team
  ON public.invitations (email, team_id)
  WHERE status = 'pending';

-- Done! Now the database will prevent duplicate pending invitations
-- and the frontend will show "Resend" buttons for existing invitations

