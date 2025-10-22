-- Add permissive policies for meeting_series
ALTER TABLE meeting_series ENABLE ROW LEVEL SECURITY;

-- Insert: any authenticated user can create when they are the creator
DROP POLICY IF EXISTS "Users can create meeting series" ON meeting_series;
CREATE POLICY "Users can create meeting series" ON meeting_series
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Select: creator or any team member can view
DROP POLICY IF EXISTS "Users can view meeting series" ON meeting_series;
CREATE POLICY "Users can view meeting series" ON meeting_series
  FOR SELECT
  USING (
    auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = meeting_series.team_id AND tm.user_id = auth.uid())
  );
