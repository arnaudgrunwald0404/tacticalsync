-- Restore all RLS policies for meeting_instance_topics
-- The previous migration only recreated INSERT, we need SELECT, UPDATE, DELETE

-- SELECT policy: Team members can view topics
CREATE POLICY "Team members can view topics" ON meeting_instance_topics 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_topics.instance_id 
      AND tm.user_id = auth.uid()
    )
  );

-- UPDATE policy: Team members can update their own topics or team admins can update any
CREATE POLICY "Team members can update own topics" ON meeting_instance_topics 
  FOR UPDATE USING (
    auth.uid() = created_by OR EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_topics.instance_id 
      AND tm.user_id = auth.uid()
      AND tm.role = 'admin'
    )
  );

-- DELETE policy: Team members can delete their own topics or team admins can delete any
CREATE POLICY "Team members can delete own topics" ON meeting_instance_topics 
  FOR DELETE USING (
    auth.uid() = created_by OR EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_topics.instance_id 
      AND tm.user_id = auth.uid()
      AND tm.role = 'admin'
    )
  );

COMMENT ON POLICY "Team members can view topics" ON meeting_instance_topics IS 
'Allows team members to view topics for meetings in their teams.';

COMMENT ON POLICY "Team members can update own topics" ON meeting_instance_topics IS 
'Allows users to update topics they created, or team admins to update any topics in their team meetings.';

COMMENT ON POLICY "Team members can delete own topics" ON meeting_instance_topics IS 
'Allows users to delete topics they created, or team admins to delete any topics in their team meetings.';

