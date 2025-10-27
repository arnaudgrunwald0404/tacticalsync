-- Fix invitations RLS to allow super admins to manage invitations
-- Run this in your local database

DROP POLICY IF EXISTS "Team admins can manage invitations" ON public.invitations;

CREATE POLICY "Team admins and super admins can manage invitations" ON public.invitations
  FOR ALL
  USING (
    -- Team admins can manage invitations for their teams
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = invitations.team_id
      AND team_members.user_id = auth.uid()
      AND team_members.role = 'admin'
    )
    OR
    -- Super admins can manage all invitations
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = invitations.team_id
      AND team_members.user_id = auth.uid()
      AND team_members.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND is_super_admin = true
    )
  );
