-- Update RLS policies to allow users to view invitations sent to their email

-- Drop existing policy
DROP POLICY IF EXISTS "Team members can view their team invitations" ON public.invitations;

-- Create new policy that allows:
-- 1. Team members to view their team's invitations (for admins)
-- 2. Users to view invitations sent to their email
CREATE POLICY "Users can view invitations sent to them or their team invitations"
  ON public.invitations
  FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = invitations.team_id
      AND team_members.user_id = auth.uid()
    )
  );

