-- Fix meeting_instance_topics INSERT policy to ensure team members can insert topics
-- The policy checks team membership via meeting_instances -> meeting_series -> team_members

DROP POLICY IF EXISTS "Team members can insert topics" ON meeting_instance_topics;

CREATE POLICY "Team members can insert topics" ON meeting_instance_topics 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_topics.instance_id 
      AND tm.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Team members can insert topics" ON meeting_instance_topics IS 
'Allows team members to insert topics. Team membership is checked via meeting_instances -> meeting_series -> team_members join.';

