-- Fix rc_tasks RLS policies: add admin/super-admin bypass
-- The old policies only checked team_members via the cycle→team join chain.
-- When cycles have team_id = NULL (common), that join produces zero rows
-- and ALL task operations are silently blocked by RLS.
-- This migration adds owner, creator, and admin fallbacks to every policy.

-- ============================================================================
-- SELECT: view tasks
-- ============================================================================
DROP POLICY IF EXISTS "Users can view tasks for accessible SIs" ON rc_tasks;

CREATE POLICY "Users can view tasks for accessible SIs"
  ON rc_tasks FOR SELECT
  USING (
    -- Team members can view
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
    -- Task owner can view
    OR owner_user_id = auth.uid()
    -- Task creator can view
    OR created_by = auth.uid()
    -- Super admins / admins can view
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
    )
  );

-- ============================================================================
-- INSERT: create tasks
-- ============================================================================
DROP POLICY IF EXISTS "Users can create tasks for accessible SIs" ON rc_tasks;

CREATE POLICY "Users can create tasks for accessible SIs"
  ON rc_tasks FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      -- SI owner can create tasks
      EXISTS (
        SELECT 1
        FROM rc_strategic_initiatives si
        WHERE si.id = rc_tasks.strategic_initiative_id
          AND si.owner_user_id = auth.uid()
      )
      -- DO owner can create tasks
      OR EXISTS (
        SELECT 1
        FROM rc_strategic_initiatives si
        JOIN rc_defining_objectives dobj ON si.defining_objective_id = dobj.id
        WHERE si.id = rc_tasks.strategic_initiative_id
          AND dobj.owner_user_id = auth.uid()
      )
      -- Team members can create tasks
      OR EXISTS (
        SELECT 1
        FROM rc_strategic_initiatives si
        JOIN rc_defining_objectives dobj ON si.defining_objective_id = dobj.id
        JOIN rc_rallying_cries rc ON dobj.rallying_cry_id = rc.id
        JOIN rc_cycles cycle ON rc.cycle_id = cycle.id
        JOIN team_members tm ON cycle.team_id = tm.team_id
        WHERE si.id = rc_tasks.strategic_initiative_id
          AND tm.user_id = auth.uid()
      )
      -- Super admins and RCDO admins can create tasks
      OR EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = auth.uid()
        AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
      )
    )
  );

-- ============================================================================
-- UPDATE: edit tasks
-- ============================================================================
DROP POLICY IF EXISTS "Users can update tasks they own or manage" ON rc_tasks;

CREATE POLICY "Users can update tasks they own or manage"
  ON rc_tasks FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rc_strategic_initiatives si
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
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
    )
  );

-- ============================================================================
-- DELETE: remove tasks
-- ============================================================================
DROP POLICY IF EXISTS "Users can delete tasks they own or manage" ON rc_tasks;

CREATE POLICY "Users can delete tasks they own or manage"
  ON rc_tasks FOR DELETE
  USING (
    owner_user_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rc_strategic_initiatives si
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
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
    )
  );
