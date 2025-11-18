-- Fix infinite recursion in RLS policies by ensuring all policies use SECURITY DEFINER helper functions
-- This migration replaces all direct queries to team_members with helper function calls

-- 1. Ensure helper functions exist and are correct (with SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND role = 'admin'
  );
$$;

-- 2. Drop all existing policies that might cause recursion
-- Teams policies
DROP POLICY IF EXISTS "Users can view teams they belong to" ON public.teams;
DROP POLICY IF EXISTS "Users can view teams they have access to" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can view teams" ON public.teams;
DROP POLICY IF EXISTS "Team admins can update teams" ON public.teams;

-- Team members policies
DROP POLICY IF EXISTS "Users can view team members" ON public.team_members;
DROP POLICY IF EXISTS "Users can view team members of their teams" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can manage team members" ON public.team_members;
DROP POLICY IF EXISTS "Members can select team_members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can update team_members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can delete team_members" ON public.team_members;

-- Invitations policies
DROP POLICY IF EXISTS "Team members can view team invitations" ON public.invitations;
DROP POLICY IF EXISTS "Team admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Team admins and super admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can view invitations sent to them" ON public.invitations;

-- 3. Recreate teams policies using helper functions
CREATE POLICY "Users can view teams they belong to" ON public.teams
  FOR SELECT
  USING (
    -- User created the team
    auth.uid() = created_by
    OR
    -- User is a super admin
    public.is_super_admin()
    OR
    -- User is a team member (using helper function to avoid recursion)
    public.is_team_member(teams.id, auth.uid())
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

CREATE POLICY "Team admins can update teams" ON public.teams
  FOR UPDATE
  USING (
    auth.uid() = created_by
    OR public.is_super_admin()
    OR public.is_team_admin(teams.id, auth.uid())
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.is_super_admin()
    OR public.is_team_admin(teams.id, auth.uid())
  );

-- 4. Recreate team_members policies using helper functions
CREATE POLICY "Users can view team members" ON public.team_members
  FOR SELECT
  USING (
    -- Users can see themselves as members
    auth.uid() = user_id
    -- Team members can see other members of their teams (using helper function)
    OR public.is_team_member(team_members.team_id, auth.uid())
    -- Super admins can see all members
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can update team_members" ON public.team_members
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR public.is_team_admin(team_members.team_id, auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_team_admin(team_members.team_id, auth.uid())
  );

CREATE POLICY "Admins can delete team_members" ON public.team_members
  FOR DELETE
  USING (
    public.is_super_admin()
    OR public.is_team_admin(team_members.team_id, auth.uid())
  );

-- Keep INSERT policies that don't cause recursion
-- These should already exist and don't query team_members for membership checks
-- "Users can join teams" and "Team creators can add themselves as admin"

-- 5. Recreate invitations policies using helper functions
CREATE POLICY "Users can view invitations sent to them" ON public.invitations
  FOR SELECT
  USING (
    -- Match by JWT email (case-insensitive)
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR
    -- Match by profiles table email (case-insensitive)
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND LOWER(profiles.email) = LOWER(invitations.email)
    )
    -- Super admins can see all invitations
    OR public.is_super_admin()
  );

CREATE POLICY "Team members can view team invitations" ON public.invitations
  FOR SELECT
  USING (
    -- Team members can see invitations for their teams (using helper function)
    public.is_team_member(invitations.team_id, auth.uid())
    OR public.is_super_admin()
  );

CREATE POLICY "Team admins and super admins can manage invitations" ON public.invitations
  FOR ALL
  USING (
    public.is_super_admin()
    OR public.is_team_admin(invitations.team_id, auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_team_admin(invitations.team_id, auth.uid())
  );




