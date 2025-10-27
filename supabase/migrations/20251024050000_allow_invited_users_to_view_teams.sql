-- Allow users with pending invitations to view team details
-- This fixes the issue where invited users couldn't see team names

DROP POLICY IF EXISTS "Simple teams access" ON public.teams;
DROP POLICY IF EXISTS "Users can view teams they have access to" ON public.teams;

CREATE POLICY "Users can view teams they have access to" ON public.teams
  FOR SELECT
  USING (
    -- User created the team
    auth.uid() = created_by
    OR
    -- User is a super admin
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND is_super_admin = true
    )
    OR
    -- User has a pending invitation to the team
    EXISTS (
      SELECT 1 FROM public.invitations
      WHERE invitations.team_id = teams.id
      AND invitations.status = 'pending'
      AND (
        LOWER(invitations.email) = LOWER(auth.jwt() ->> 'email')
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND LOWER(profiles.email) = LOWER(invitations.email)
        )
      )
    )
  );
