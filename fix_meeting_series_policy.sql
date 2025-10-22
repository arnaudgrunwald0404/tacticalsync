-- Add UPDATE policy for meeting_series
-- Team admins can update meeting series
DROP POLICY IF EXISTS "Team admins can update meeting series" ON meeting_series;
CREATE POLICY "Team admins can update meeting series" ON meeting_series
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM team_members tm 
    WHERE tm.team_id = meeting_series.team_id 
    AND tm.user_id = auth.uid()
    AND tm.role = 'admin'
  ));
