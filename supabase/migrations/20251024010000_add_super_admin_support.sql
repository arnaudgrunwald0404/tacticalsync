-- Add super admin support for agrunwald@clearcompany.com
-- This allows super admins to view all teams and meetings even if not a member

-- 1. Add is_super_admin column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- 2. Create function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Set agrunwald@clearcompany.com as super admin
UPDATE public.profiles
SET is_super_admin = TRUE
WHERE email = 'agrunwald@clearcompany.com';

-- 4. Update teams RLS policies to allow super admins to view all teams
DROP POLICY IF EXISTS "Authenticated users can view teams" ON public.teams;
CREATE POLICY "Authenticated users can view teams" ON public.teams
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      -- Existing logic: allow if user created the team
      auth.uid() = created_by
      -- Or allow super admins to see everything
      OR public.is_super_admin()
    )
  );

-- 5. Update team_members RLS policies to allow super admins to view all members
DROP POLICY IF EXISTS "Users can view team members" ON public.team_members;
CREATE POLICY "Users can view team members" ON public.team_members
  FOR SELECT
  USING (
    -- Allow users to see themselves as members
    auth.uid() = user_id
    -- Allow team members to see other members of their teams
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
    )
    -- Allow super admins to see all members
    OR public.is_super_admin()
  );

-- 6. Update meeting_series RLS policies to allow super admins
DROP POLICY IF EXISTS "Users can view meeting series" ON public.meeting_series;
CREATE POLICY "Users can view meeting series" ON public.meeting_series
  FOR SELECT
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = meeting_series.team_id
      AND tm.user_id = auth.uid()
    )
    -- Allow super admins to see all meeting series
    OR public.is_super_admin()
  );

-- 7. Update meeting_instances RLS policies to allow super admins
DROP POLICY IF EXISTS "Team members can view meeting instances" ON public.meeting_instances;
CREATE POLICY "Team members can view meeting instances" ON public.meeting_instances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_series ms
      JOIN public.team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_instances.series_id
      AND tm.user_id = auth.uid()
    )
    -- Allow super admins to see all meeting instances
    OR public.is_super_admin()
  );

-- 8. Update invitations RLS policies to allow super admins
DROP POLICY IF EXISTS "Users can view invitations" ON public.invitations;
CREATE POLICY "Users can view invitations" ON public.invitations
  FOR SELECT
  USING (
    auth.uid() = invited_by
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = invitations.team_id
      AND tm.user_id = auth.uid()
    )
    OR email = (auth.jwt() ->> 'email')
    -- Allow super admins to see all invitations
    OR public.is_super_admin()
  );

-- 9. Add comment to document the super admin feature
COMMENT ON COLUMN public.profiles.is_super_admin IS 'When true, user has visibility to all teams and meetings regardless of membership';
COMMENT ON FUNCTION public.is_super_admin() IS 'Returns true if the current user is a super admin';

