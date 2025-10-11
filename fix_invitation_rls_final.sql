-- Fix RLS policy to allow team members to view invitations for their team
-- Previous version failed because it tried to access auth.users table

-- Drop the existing policies
DROP POLICY IF EXISTS "Users can view invitations sent to them or their team invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can view invitations sent to them or their team invitatio" ON public.invitations;
DROP POLICY IF EXISTS "Users can view their invitations or team invitations" ON public.invitations;

-- Create a new policy that allows:
-- 1. Users to view invitations sent to their email (matched via profiles table)
-- 2. Team members to view all invitations for their team
CREATE POLICY "Team members can view team invitations and users can view their own"
  ON public.invitations
  FOR SELECT
  USING (
    -- Team members can see all invitations for their teams
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = invitations.team_id
      AND team_members.user_id = auth.uid()
    )
    OR
    -- Users can see invitations sent to their email (via profiles table)
    email IN (
      SELECT email FROM public.profiles
      WHERE id = auth.uid()
    )
  );

