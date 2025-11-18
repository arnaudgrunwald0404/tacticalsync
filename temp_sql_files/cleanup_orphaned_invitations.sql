-- Clean up orphaned pending invitations
-- This script marks invitations as "accepted" when the user is already a team member
-- Run this in Supabase SQL Editor to fix the duplicate invitation issue

-- Update pending invitations to "accepted" where the user's email matches an existing team member
UPDATE public.invitations
SET 
  status = 'accepted',
  updated_at = NOW()
WHERE 
  status = 'pending'
  AND EXISTS (
    SELECT 1 
    FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.user_id
    WHERE tm.team_id = invitations.team_id
      AND LOWER(p.email) = LOWER(invitations.email)
  );

-- Log the results
-- This will show how many invitations were updated
SELECT 
  'Cleanup complete' as message,
  COUNT(*) as invitations_fixed
FROM public.invitations
WHERE status = 'accepted'
  AND updated_at > NOW() - INTERVAL '1 minute';



