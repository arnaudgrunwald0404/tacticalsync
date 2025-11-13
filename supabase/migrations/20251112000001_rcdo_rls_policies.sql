-- RCDO Module: Row Level Security Policies
-- Implements permission system for RCDO tables

-- ============================================================================
-- RC Cycles RLS Policies
-- ============================================================================

-- Team members can view cycles for their teams
DO $$ BEGIN
  CREATE POLICY "Team members can view team cycles" ON rc_cycles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = rc_cycles.team_id
        AND tm.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Team admins and super admins can create cycles
DO $$ BEGIN
  CREATE POLICY "Admins can create cycles" ON rc_cycles
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = rc_cycles.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cycle creators, team admins, and super admins can update cycles
DO $$ BEGIN
  CREATE POLICY "Cycle owners and admins can update cycles" ON rc_cycles
    FOR UPDATE USING (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = rc_cycles.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Only super admins can delete cycles
DO $$ BEGIN
  CREATE POLICY "Super admins can delete cycles" ON rc_cycles
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- RC Rallying Cries RLS Policies
-- ============================================================================

-- Team members can view rallying cries
DO $$ BEGIN
  CREATE POLICY "Team members can view rallying cries" ON rc_rallying_cries
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM rc_cycles c
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE c.id = rc_rallying_cries.cycle_id
        AND tm.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cycle owners and admins can create rallying cries
DO $$ BEGIN
  CREATE POLICY "Cycle owners can create rallying cries" ON rc_rallying_cries
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM rc_cycles c
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE c.id = rc_rallying_cries.cycle_id
        AND tm.user_id = auth.uid()
        AND (tm.role = 'admin' OR c.created_by = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Owners, admins can update when unlocked; admins/super admins can always update
DO $$ BEGIN
  CREATE POLICY "Authorized users can update rallying cries" ON rc_rallying_cries
    FOR UPDATE USING (
      (
        locked_at IS NULL
        AND (
          owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM rc_cycles c
            JOIN team_members tm ON tm.team_id = c.team_id
            WHERE c.id = rc_rallying_cries.cycle_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'admin'
          )
        )
      )
      OR EXISTS (
        SELECT 1 FROM rc_cycles c
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE c.id = rc_rallying_cries.cycle_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Admins and super admins can delete rallying cries
DO $$ BEGIN
  CREATE POLICY "Admins can delete rallying cries" ON rc_rallying_cries
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM rc_cycles c
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE c.id = rc_rallying_cries.cycle_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- RC Defining Objectives RLS Policies
-- ============================================================================

-- Team members can view DOs
DO $$ BEGIN
  CREATE POLICY "Team members can view defining objectives" ON rc_defining_objectives
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM rc_rallying_cries rc
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE rc.id = rc_defining_objectives.rallying_cry_id
        AND tm.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cycle owners and admins can create DOs
DO $$ BEGIN
  CREATE POLICY "Cycle owners can create defining objectives" ON rc_defining_objectives
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM rc_rallying_cries rc
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE rc.id = rc_defining_objectives.rallying_cry_id
        AND tm.user_id = auth.uid()
        AND (tm.role = 'admin' OR c.created_by = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- DO owners can update when unlocked; admins can always update
DO $$ BEGIN
  CREATE POLICY "DO owners can update their objectives" ON rc_defining_objectives
    FOR UPDATE USING (
      (
        locked_at IS NULL
        AND owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM rc_rallying_cries rc
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE rc.id = rc_defining_objectives.rallying_cry_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Admins and super admins can delete DOs
DO $$ BEGIN
  CREATE POLICY "Admins can delete defining objectives" ON rc_defining_objectives
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM rc_rallying_cries rc
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE rc.id = rc_defining_objectives.rallying_cry_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- RC DO Metrics RLS Policies
-- ============================================================================

-- Team members can view metrics
DO $$ BEGIN
  CREATE POLICY "Team members can view metrics" ON rc_do_metrics
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE dobj.id = rc_do_metrics.defining_objective_id
        AND tm.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- DO owners can create metrics for their DOs
DO $$ BEGIN
  CREATE POLICY "DO owners can create metrics" ON rc_do_metrics
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        WHERE dobj.id = rc_do_metrics.defining_objective_id
        AND dobj.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE dobj.id = rc_do_metrics.defining_objective_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- DO owners can update metrics when DO is unlocked
DO $$ BEGIN
  CREATE POLICY "DO owners can update metrics" ON rc_do_metrics
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        WHERE dobj.id = rc_do_metrics.defining_objective_id
        AND dobj.owner_user_id = auth.uid()
        AND dobj.locked_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE dobj.id = rc_do_metrics.defining_objective_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- DO owners and admins can delete metrics
DO $$ BEGIN
  CREATE POLICY "DO owners can delete metrics" ON rc_do_metrics
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        WHERE dobj.id = rc_do_metrics.defining_objective_id
        AND dobj.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE dobj.id = rc_do_metrics.defining_objective_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- RC Strategic Initiatives RLS Policies
-- ============================================================================

-- Team members can view initiatives
DO $$ BEGIN
  CREATE POLICY "Team members can view initiatives" ON rc_strategic_initiatives
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE dobj.id = rc_strategic_initiatives.defining_objective_id
        AND tm.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- DO owners and admins can create initiatives
DO $$ BEGIN
  CREATE POLICY "DO owners can create initiatives" ON rc_strategic_initiatives
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        WHERE dobj.id = rc_strategic_initiatives.defining_objective_id
        AND dobj.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE dobj.id = rc_strategic_initiatives.defining_objective_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Initiative owners can update when unlocked
DO $$ BEGIN
  CREATE POLICY "Initiative owners can update initiatives" ON rc_strategic_initiatives
    FOR UPDATE USING (
      (
        locked_at IS NULL
        AND owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE dobj.id = rc_strategic_initiatives.defining_objective_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Initiative owners and admins can delete initiatives
DO $$ BEGIN
  CREATE POLICY "Initiative owners can delete initiatives" ON rc_strategic_initiatives
    FOR DELETE USING (
      owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM rc_defining_objectives dobj
        JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
        JOIN rc_cycles c ON c.id = rc.cycle_id
        JOIN team_members tm ON tm.team_id = c.team_id
        WHERE dobj.id = rc_strategic_initiatives.defining_objective_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- RC Check-ins RLS Policies
-- ============================================================================

-- Team members can view check-ins
DO $$ BEGIN
  CREATE POLICY "Team members can view checkins" ON rc_checkins
    FOR SELECT USING (
      (
        parent_type = 'do'
        AND EXISTS (
          SELECT 1 FROM rc_defining_objectives dobj
          JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
          JOIN rc_cycles c ON c.id = rc.cycle_id
          JOIN team_members tm ON tm.team_id = c.team_id
          WHERE dobj.id = rc_checkins.parent_id
          AND tm.user_id = auth.uid()
        )
      )
      OR (
        parent_type = 'initiative'
        AND EXISTS (
          SELECT 1 FROM rc_strategic_initiatives si
          JOIN rc_defining_objectives dobj2 ON dobj2.id = si.defining_objective_id
          JOIN rc_rallying_cries rc ON rc.id = dobj2.rallying_cry_id
          JOIN rc_cycles c ON c.id = rc.cycle_id
          JOIN team_members tm ON tm.team_id = c.team_id
          WHERE si.id = rc_checkins.parent_id
          AND tm.user_id = auth.uid()
        )
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- DO/Initiative owners can create check-ins
DO $$ BEGIN
  CREATE POLICY "Owners can create checkins" ON rc_checkins
    FOR INSERT WITH CHECK (
      (
        parent_type = 'do'
        AND EXISTS (
          SELECT 1 FROM rc_defining_objectives dobj
          WHERE dobj.id = rc_checkins.parent_id
          AND dobj.owner_user_id = auth.uid()
        )
      )
      OR (
        parent_type = 'initiative'
        AND EXISTS (
          SELECT 1 FROM rc_strategic_initiatives si
          WHERE si.id = rc_checkins.parent_id
          AND si.owner_user_id = auth.uid()
        )
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Check-in creators can update their own check-ins
DO $$ BEGIN
  CREATE POLICY "Users can update their checkins" ON rc_checkins
    FOR UPDATE USING (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Check-in creators can delete their own check-ins
DO $$ BEGIN
  CREATE POLICY "Users can delete their checkins" ON rc_checkins
    FOR DELETE USING (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- RC Links RLS Policies
-- ============================================================================

-- Team members can view links
DO $$ BEGIN
  CREATE POLICY "Team members can view links" ON rc_links
    FOR SELECT USING (
      (
        parent_type = 'do'
        AND EXISTS (
          SELECT 1 FROM rc_defining_objectives dobj
          JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
          JOIN rc_cycles c ON c.id = rc.cycle_id
          JOIN team_members tm ON tm.team_id = c.team_id
          WHERE dobj.id = rc_links.parent_id
          AND tm.user_id = auth.uid()
        )
      )
      OR (
        parent_type = 'initiative'
        AND EXISTS (
          SELECT 1 FROM rc_strategic_initiatives si
          JOIN rc_defining_objectives dobj2 ON dobj2.id = si.defining_objective_id
          JOIN rc_rallying_cries rc ON rc.id = dobj2.rallying_cry_id
          JOIN rc_cycles c ON c.id = rc.cycle_id
          JOIN team_members tm ON tm.team_id = c.team_id
          WHERE si.id = rc_links.parent_id
          AND tm.user_id = auth.uid()
        )
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Team members can create links (for their own priorities/action items)
DO $$ BEGIN
  CREATE POLICY "Team members can create links" ON rc_links
    FOR INSERT WITH CHECK (
      (
        parent_type = 'do'
        AND EXISTS (
          SELECT 1 FROM rc_defining_objectives dobj
          JOIN rc_rallying_cries rc ON rc.id = dobj.rallying_cry_id
          JOIN rc_cycles c ON c.id = rc.cycle_id
          JOIN team_members tm ON tm.team_id = c.team_id
          WHERE dobj.id = rc_links.parent_id
          AND tm.user_id = auth.uid()
        )
      )
      OR (
        parent_type = 'initiative'
        AND EXISTS (
          SELECT 1 FROM rc_strategic_initiatives si
          JOIN rc_defining_objectives dobj2 ON dobj2.id = si.defining_objective_id
          JOIN rc_rallying_cries rc ON rc.id = dobj2.rallying_cry_id
          JOIN rc_cycles c ON c.id = rc.cycle_id
          JOIN team_members tm ON tm.team_id = c.team_id
          WHERE si.id = rc_links.parent_id
          AND tm.user_id = auth.uid()
        )
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Link creators can delete their links
DO $$ BEGIN
  CREATE POLICY "Users can delete their links" ON rc_links
    FOR DELETE USING (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

