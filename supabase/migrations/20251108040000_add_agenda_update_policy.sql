-- Add UPDATE policy for meeting_series_agenda
-- This allows team members to update agenda items for their team meetings

DROP POLICY IF EXISTS "Team members can update agenda" ON meeting_series_agenda;
DROP POLICY IF EXISTS "Team admins can update agenda" ON meeting_series_agenda;

CREATE POLICY "Team members can update agenda" ON meeting_series_agenda 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_series_agenda.series_id 
      AND tm.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Team members can update agenda" ON meeting_series_agenda IS 
'Allows team members to update agenda items for their team meetings.';

