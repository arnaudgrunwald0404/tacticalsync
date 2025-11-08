-- =============================================================================
-- Fix All RLS Policies That Query Profiles Table
-- Migration: 20251106040000_fix_all_profiles_queries_in_rls.sql
-- 
-- Problem: Multiple RLS policies query the profiles table, causing recursion.
--
-- Solution: Replace all profiles table queries with auth.jwt() ->> 'email'
-- or use the super_admins table via is_super_admin() function.
-- =============================================================================

-- Fix teams policy that queries profiles for invitation matching
DROP POLICY IF EXISTS "Users can view teams they belong to" ON public.teams;

CREATE POLICY "Users can view teams they belong to" ON public.teams
  FOR SELECT
  USING (
    auth.uid() = created_by
    OR is_super_admin()
    OR is_team_member(id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM invitations
      WHERE invitations.team_id = teams.id
      AND invitations.status = 'pending'
      AND LOWER(invitations.email) = LOWER(auth.jwt() ->> 'email')
    )
  );

-- Fix agenda_templates policy that queries profiles for email check
DROP POLICY IF EXISTS "Users manage own templates" ON public.agenda_templates;

CREATE POLICY "Users manage own templates" ON public.agenda_templates
  FOR ALL
  USING (
    auth.uid() = user_id
    OR (is_system = true AND LOWER(auth.jwt() ->> 'email') = 'agrunwald@clearcompany.com')
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (is_system = true AND LOWER(auth.jwt() ->> 'email') = 'agrunwald@clearcompany.com')
  );

-- Fix agenda_template_items policy that queries profiles via agenda_templates
DROP POLICY IF EXISTS "Users manage own template items" ON public.agenda_template_items;

CREATE POLICY "Users manage own template items" ON public.agenda_template_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agenda_templates t
      WHERE t.id = agenda_template_items.template_id
      AND (
        auth.uid() = t.user_id
        OR (t.is_system = true AND LOWER(auth.jwt() ->> 'email') = 'agrunwald@clearcompany.com')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agenda_templates t
      WHERE t.id = agenda_template_items.template_id
      AND (
        auth.uid() = t.user_id
        OR (t.is_system = true AND LOWER(auth.jwt() ->> 'email') = 'agrunwald@clearcompany.com')
      )
    )
  );

COMMENT ON POLICY "Users can view teams they belong to" ON public.teams IS 
'Uses JWT email instead of profiles table to avoid RLS recursion.';

COMMENT ON POLICY "Users manage own templates" ON public.agenda_templates IS 
'Uses JWT email instead of profiles table to avoid RLS recursion.';

COMMENT ON POLICY "Users manage own template items" ON public.agenda_template_items IS 
'Uses JWT email instead of profiles table to avoid RLS recursion.';

