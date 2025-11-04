-- Add admin role support and tighten creation permissions

-- 1) Add is_admin column to profiles (separate from is_super_admin)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2) Helper function: returns true if current user is admin or super admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR is_super_admin = TRUE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.profiles.is_admin IS 'When true, user can create teams and meetings (org-level admin).';
COMMENT ON FUNCTION public.is_admin() IS 'Returns true if the current user is an admin or super admin.';

-- 3) Update RLS for teams: only admins/super-admins can create teams
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Admins can create teams" ON public.teams
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    public.is_admin() AND
    auth.uid() = created_by
  );

-- Keep select/update/delete policies as-is; this only tightens INSERT

-- 4) Update RLS for meeting_series: only admins/super-admins who are team members (or super admin) can create
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create meeting series" ON public.meeting_series;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Admins can create meeting series" ON public.meeting_series
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    public.is_admin() AND (
      -- Super admin passes via is_admin because is_super_admin implies is_admin() returns true
      EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = meeting_series.team_id
        AND tm.user_id = auth.uid()
      )
      OR public.is_super_admin()
    ) AND
    auth.uid() = created_by
  );

-- Preserve existing SELECT policies; only tighten INSERT

-- 5) Allow super admins to view and manage profiles (to nominate admins)
DO $$ BEGIN
  CREATE POLICY "Super admins can view profiles" ON public.profiles
    FOR SELECT
    USING (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Super admins can update profiles" ON public.profiles
    FOR UPDATE
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


