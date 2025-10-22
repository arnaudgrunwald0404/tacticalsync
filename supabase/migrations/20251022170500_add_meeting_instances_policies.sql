-- RLS for meeting_instances
ALTER TABLE meeting_instances ENABLE ROW LEVEL SECURITY;

-- Allow team members (of the series' team) to insert instances
DROP POLICY IF EXISTS "Team members can create meeting instances" ON meeting_instances;
CREATE POLICY "Team members can create meeting instances" ON meeting_instances
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meeting_series ms
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE ms.id = meeting_instances.series_id
    AND tm.user_id = auth.uid()
  ));

-- Allow team members to view instances
DROP POLICY IF EXISTS "Team members can view meeting instances" ON meeting_instances;
CREATE POLICY "Team members can view meeting instances" ON meeting_instances
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meeting_series ms
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE ms.id = meeting_instances.series_id
    AND tm.user_id = auth.uid()
  ));
