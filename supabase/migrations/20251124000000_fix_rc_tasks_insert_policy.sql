-- Fix RLS INSERT policy for rc_tasks
-- Allow SI owners, DO owners, team members, and admins to create tasks
-- ============================================================================

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can create tasks for accessible SIs" ON rc_tasks;

-- Create a more permissive INSERT policy that allows:
-- 1. SI owners to create tasks
-- 2. DO owners to create tasks  
-- 3. Team members to create tasks
-- 4. Team admins to create tasks
-- 5. Super admins/RCDO admins to create tasks
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


