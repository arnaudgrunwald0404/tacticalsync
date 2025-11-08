-- Fix meeting_series_agenda policies to allow:
-- 1. Team admins (tm.role = 'admin')
-- 2. Team creators (teams.created_by = auth.uid())
-- 3. Meeting creators (meeting_series.created_by = auth.uid())
-- 4. Super admins (public.is_super_admin())
-- To delete and insert agenda items

DROP POLICY IF EXISTS "Team members can insert agenda" ON meeting_series_agenda;
DROP POLICY IF EXISTS "Team admins can delete agenda" ON meeting_series_agenda;

-- INSERT policy: allow team members, team creators, meeting creators, and super admins
CREATE POLICY "Authorized users can insert agenda" ON meeting_series_agenda 
  FOR INSERT WITH CHECK (
    -- Team member
    EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_series_agenda.series_id 
      AND tm.user_id = auth.uid()
    )
    -- OR team creator
    OR EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN teams t ON t.id = ms.team_id
      WHERE ms.id = meeting_series_agenda.series_id
      AND t.created_by = auth.uid()
    )
    -- OR meeting creator
    OR EXISTS (
      SELECT 1 FROM meeting_series ms
      WHERE ms.id = meeting_series_agenda.series_id
      AND ms.created_by = auth.uid()
    )
    -- OR super admin
    OR public.is_super_admin()
  );

-- DELETE policy: allow team admins, team creators, meeting creators, and super admins
CREATE POLICY "Authorized users can delete agenda" ON meeting_series_agenda 
  FOR DELETE USING (
    -- Team admin
    EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_series_agenda.series_id 
      AND tm.user_id = auth.uid()
      AND tm.role = 'admin'
    )
    -- OR team creator
    OR EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN teams t ON t.id = ms.team_id
      WHERE ms.id = meeting_series_agenda.series_id
      AND t.created_by = auth.uid()
    )
    -- OR meeting creator
    OR EXISTS (
      SELECT 1 FROM meeting_series ms
      WHERE ms.id = meeting_series_agenda.series_id
      AND ms.created_by = auth.uid()
    )
    -- OR super admin
    OR public.is_super_admin()
  );

COMMENT ON POLICY "Authorized users can insert agenda" ON meeting_series_agenda IS 
'Allows team members, team creators, meeting creators, and super admins to insert agenda items.';

COMMENT ON POLICY "Authorized users can delete agenda" ON meeting_series_agenda IS 
'Allows team admins, team creators, meeting creators, and super admins to delete agenda items.';

