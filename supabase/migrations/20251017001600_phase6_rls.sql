-- Phase 6: RLS Policy Refinement
-- Enable RLS on all tables
ALTER TABLE meeting_series_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_instance_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_instance_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_series_action_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Team members can manage agenda" ON meeting_series_agenda;
DROP POLICY IF EXISTS "Team members can manage priorities" ON meeting_instance_priorities;
DROP POLICY IF EXISTS "Team members can manage topics" ON meeting_instance_topics;
DROP POLICY IF EXISTS "Team members can manage action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can view action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can insert action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can update action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can delete action items" ON meeting_series_action_items;

-- Agenda Policies
CREATE POLICY "Team members can view agenda" ON meeting_series_agenda 
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM meeting_series ms
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE ms.id = meeting_series_agenda.series_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can insert agenda" ON meeting_series_agenda 
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM meeting_series ms
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE ms.id = meeting_series_agenda.series_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team admins can update agenda" ON meeting_series_agenda 
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM meeting_series ms
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE ms.id = meeting_series_agenda.series_id 
    AND tm.user_id = auth.uid()
    AND tm.role = 'admin'
  ));

CREATE POLICY "Team admins can delete agenda" ON meeting_series_agenda 
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM meeting_series ms
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE ms.id = meeting_series_agenda.series_id 
    AND tm.user_id = auth.uid()
    AND tm.role = 'admin'
  ));

-- Priorities Policies
CREATE POLICY "Team members can view priorities" ON meeting_instance_priorities 
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM meeting_instances mi
    JOIN meeting_series ms ON ms.id = mi.series_id
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE mi.id = meeting_instance_priorities.instance_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can insert priorities" ON meeting_instance_priorities 
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM meeting_instances mi
    JOIN meeting_series ms ON ms.id = mi.series_id
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE mi.id = meeting_instance_priorities.instance_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can update own priorities" ON meeting_instance_priorities 
  FOR UPDATE USING (
    auth.uid() = created_by OR EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_priorities.instance_id 
      AND tm.user_id = auth.uid()
      AND tm.role = 'admin'
    )
  );

CREATE POLICY "Team members can delete own priorities" ON meeting_instance_priorities 
  FOR DELETE USING (
    auth.uid() = created_by OR EXISTS (
      SELECT 1 FROM meeting_instances mi
      JOIN meeting_series ms ON ms.id = mi.series_id
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE mi.id = meeting_instance_priorities.instance_id 
      AND tm.user_id = auth.uid()
      AND tm.role = 'admin'
    )
  );

-- Topics Policies
CREATE POLICY "Team members can view topics" ON meeting_instance_topics 
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM meeting_instances mi
    JOIN meeting_series ms ON ms.id = mi.series_id
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE mi.id = meeting_instance_topics.instance_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can insert topics" ON meeting_instance_topics 
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM meeting_instances mi
    JOIN meeting_series ms ON ms.id = mi.series_id
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE mi.id = meeting_instance_topics.instance_id 
    AND tm.user_id = auth.uid()
  ));

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

-- Action Items Policies
CREATE POLICY "Team members can view action items" ON meeting_series_action_items 
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM meeting_series ms
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE ms.id = meeting_series_action_items.series_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can insert action items" ON meeting_series_action_items 
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM meeting_series ms
    JOIN team_members tm ON tm.team_id = ms.team_id
    WHERE ms.id = meeting_series_action_items.series_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can update own action items" ON meeting_series_action_items 
  FOR UPDATE USING (
    auth.uid() = created_by OR EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_series_action_items.series_id 
      AND tm.user_id = auth.uid()
      AND tm.role = 'admin'
    )
  );

CREATE POLICY "Team members can delete own action items" ON meeting_series_action_items 
  FOR DELETE USING (
    auth.uid() = created_by OR EXISTS (
      SELECT 1 FROM meeting_series ms
      JOIN team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_series_action_items.series_id 
      AND tm.user_id = auth.uid()
      AND tm.role = 'admin'
    )
  );
