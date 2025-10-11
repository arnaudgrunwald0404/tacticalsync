-- Allow users with pending invitations to view team meetings
-- This enables them to see what meetings exist before accepting an invitation

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Team members can view their recurring meetings" ON public.recurring_meetings;

-- Create a new policy that allows:
-- 1. Team members to view their team's meetings
-- 2. Users with pending invitations to view meetings for teams they're invited to
CREATE POLICY "Team members and invited users can view recurring meetings"
  ON public.recurring_meetings
  FOR SELECT
  USING (
    -- Team members can see their team's meetings
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = recurring_meetings.team_id
      AND team_members.user_id = auth.uid()
    )
    OR
    -- Users with pending invitations can see meetings for teams they're invited to
    EXISTS (
      SELECT 1 FROM public.invitations
      JOIN public.profiles ON profiles.id = auth.uid()
      WHERE invitations.team_id = recurring_meetings.team_id
      AND invitations.email = profiles.email
      AND invitations.status = 'pending'
      AND invitations.expires_at > NOW()
    )
  );

