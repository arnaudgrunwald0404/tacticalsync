-- Simplify RLS policies for meeting_instance_priorities to allow any team member to insert/update/delete

DROP POLICY IF EXISTS "Team members can insert priorities" ON meeting_instance_priorities;
DROP POLICY IF EXISTS "Team members can update own priorities" ON meeting_instance_priorities;
DROP POLICY IF EXISTS "Team members can delete own priorities" ON meeting_instance_priorities;

-- Allow any team member to insert priorities
CREATE POLICY "Team members can insert priorities" ON meeting_instance_priorities 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_priorities.instance_id 
      AND tm.user_id = auth.uid()
    )
  );

-- Allow any team member to update priorities
CREATE POLICY "Team members can update priorities" ON meeting_instance_priorities 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_priorities.instance_id 
      AND tm.user_id = auth.uid()
    )
  );

-- Allow any team member to delete priorities
CREATE POLICY "Team members can delete priorities" ON meeting_instance_priorities 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_priorities.instance_id 
      AND tm.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Team members can insert priorities" ON meeting_instance_priorities IS 
'Allows any team member to insert priorities for their team meetings.';

COMMENT ON POLICY "Team members can update priorities" ON meeting_instance_priorities IS 
'Allows any team member to update priorities for their team meetings.';

COMMENT ON POLICY "Team members can delete priorities" ON meeting_instance_priorities IS 
'Allows any team member to delete priorities for their team meetings.';

