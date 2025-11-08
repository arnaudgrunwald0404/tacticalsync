-- Simplify agenda INSERT policy to allow all team members (not just admins)
-- This allows any team member to create agenda items via "Start from scratch"

DROP POLICY IF EXISTS "Authorized users can insert agenda" ON meeting_series_agenda;

CREATE POLICY "Team members can insert agenda" ON meeting_series_agenda 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_series_agenda.series_id 
      AND tm.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Team members can insert agenda" ON meeting_series_agenda IS 
'Allows any team member to insert agenda items for their team meetings.';

