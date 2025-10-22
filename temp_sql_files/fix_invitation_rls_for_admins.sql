-- Fix RLS policy to allow team admins to view all invitations for their team
-- This is needed so admins can see pending invitations on the Team Setup page

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view invitations sent to them or their team invitations" ON public.invitations;

-- Create a new policy that allows:
-- 1. Users to view invitations sent to their email (for accepting invitations)
-- 2. Team members to view all invitations for their team (for managing invitations)
CREATE POLICY "Users can view their invitations or team invitations"
  ON public.invitations
  FOR SELECT
  USING (
    -- Users can see invitations sent to their email
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR
    -- Team members can see all invitations for their teams
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = invitations.team_id
      AND team_members.user_id = auth.uid()
    )
  );

