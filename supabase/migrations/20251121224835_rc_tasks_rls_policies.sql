-- RLS Policies for rc_tasks
-- ============================================================================

-- Policy: Users can SELECT tasks if they are team members
-- (Access is controlled through the SI's DO's Rallying Cry's Cycle's team)
CREATE POLICY "Users can view tasks for accessible SIs"
  ON rc_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM rc_strategic_initiatives si
      JOIN rc_defining_objectives dobj ON si.defining_objective_id = dobj.id
      JOIN rc_rallying_cries rc ON dobj.rallying_cry_id = rc.id
      JOIN rc_cycles cycle ON rc.cycle_id = cycle.id
      JOIN team_members tm ON cycle.team_id = tm.team_id
      WHERE si.id = rc_tasks.strategic_initiative_id
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: Users can INSERT tasks if they are team members
CREATE POLICY "Users can create tasks for accessible SIs"
  ON rc_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM rc_strategic_initiatives si
      JOIN rc_defining_objectives dobj ON si.defining_objective_id = dobj.id
      JOIN rc_rallying_cries rc ON dobj.rallying_cry_id = rc.id
      JOIN rc_cycles cycle ON rc.cycle_id = cycle.id
      JOIN team_members tm ON cycle.team_id = tm.team_id
      WHERE si.id = rc_tasks.strategic_initiative_id
        AND tm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Policy: Users can UPDATE tasks if they are the owner, SI owner, or team admin
CREATE POLICY "Users can update tasks they own or manage"
  ON rc_tasks FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM rc_strategic_initiatives si
      WHERE si.id = rc_tasks.strategic_initiative_id
        AND si.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM rc_strategic_initiatives si
      JOIN rc_defining_objectives dobj ON si.defining_objective_id = dobj.id
      JOIN rc_rallying_cries rc ON dobj.rallying_cry_id = rc.id
      JOIN rc_cycles cycle ON rc.cycle_id = cycle.id
      JOIN team_members tm ON cycle.team_id = tm.team_id
      WHERE si.id = rc_tasks.strategic_initiative_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
    )
  );

-- Policy: Users can DELETE tasks if they are the owner, SI owner, or team admin
CREATE POLICY "Users can delete tasks they own or manage"
  ON rc_tasks FOR DELETE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM rc_strategic_initiatives si
      WHERE si.id = rc_tasks.strategic_initiative_id
        AND si.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM rc_strategic_initiatives si
      JOIN rc_defining_objectives dobj ON si.defining_objective_id = dobj.id
      JOIN rc_rallying_cries rc ON dobj.rallying_cry_id = rc.id
      JOIN rc_cycles cycle ON rc.cycle_id = cycle.id
      JOIN team_members tm ON cycle.team_id = tm.team_id
      WHERE si.id = rc_tasks.strategic_initiative_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
    )
  );

