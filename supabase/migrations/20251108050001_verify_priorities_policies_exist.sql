-- Verify and recreate priorities RLS policies if they don't exist

-- First, check and drop any existing policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Team members can view priorities" ON meeting_instance_priorities;
    DROP POLICY IF EXISTS "Team members can insert priorities" ON meeting_instance_priorities;
    DROP POLICY IF EXISTS "Team members can update priorities" ON meeting_instance_priorities;
    DROP POLICY IF EXISTS "Team members can delete priorities" ON meeting_instance_priorities;
    DROP POLICY IF EXISTS "Team members can update own priorities" ON meeting_instance_priorities;
    DROP POLICY IF EXISTS "Team members can delete own priorities" ON meeting_instance_priorities;
END $$;

-- Re-create all policies

-- SELECT policy
CREATE POLICY "Team members can view priorities" ON meeting_instance_priorities 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_priorities.instance_id 
      AND tm.user_id = auth.uid()
    )
  );

-- INSERT policy
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

-- UPDATE policy
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

-- DELETE policy
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

-- Add comments
COMMENT ON POLICY "Team members can view priorities" ON meeting_instance_priorities IS 
'Allows team members to view priorities for their team meetings.';

COMMENT ON POLICY "Team members can insert priorities" ON meeting_instance_priorities IS 
'Allows any team member to insert priorities for their team meetings.';

COMMENT ON POLICY "Team members can update priorities" ON meeting_instance_priorities IS 
'Allows any team member to update priorities for their team meetings.';

COMMENT ON POLICY "Team members can delete priorities" ON meeting_instance_priorities IS 
'Allows any team member to delete priorities for their team meetings.';

