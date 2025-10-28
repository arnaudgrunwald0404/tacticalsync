-- Fix teams RLS policy to allow team members to view their teams
-- This ensures users can see teams they're members of after accepting invitations

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
    -- User is a team member
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = teams.id
      AND team_members.user_id = auth.uid()
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
