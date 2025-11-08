-- Add SELECT policy for meeting_series_agenda if missing
-- This allows team members to view agenda items for their team meetings

DROP POLICY IF EXISTS "Team members can view agenda" ON meeting_series_agenda;

CREATE POLICY "Team members can view agenda" ON meeting_series_agenda 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_series_agenda.series_id 
      AND tm.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Team members can view agenda" ON meeting_series_agenda IS 
'Allows team members to view agenda items for their team meetings.';

