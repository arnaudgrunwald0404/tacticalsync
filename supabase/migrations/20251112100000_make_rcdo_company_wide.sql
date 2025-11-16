-- Migration: Make RCDO System Company-Wide
-- This migration removes team_id from rc_cycles and updates all related structures

-- ============================================================================
-- Step 1: Drop existing RLS policies (will be recreated with new logic)
-- ============================================================================
DROP POLICY IF EXISTS "Team members can view team cycles" ON rc_cycles;
DROP POLICY IF EXISTS "Admins can create cycles" ON rc_cycles;
DROP POLICY IF EXISTS "Cycle owners and admins can update cycles" ON rc_cycles;
DROP POLICY IF EXISTS "Super admins can delete cycles" ON rc_cycles;

DROP POLICY IF EXISTS "Team members can view rallying cries" ON rc_rallying_cries;
DROP POLICY IF EXISTS "Cycle owners can create rallying cries" ON rc_rallying_cries;
DROP POLICY IF EXISTS "Authorized users can update rallying cries" ON rc_rallying_cries;
DROP POLICY IF EXISTS "Admins can delete rallying cries" ON rc_rallying_cries;

DROP POLICY IF EXISTS "Team members can view defining objectives" ON rc_defining_objectives;
DROP POLICY IF EXISTS "Cycle owners can create defining objectives" ON rc_defining_objectives;
DROP POLICY IF EXISTS "DO owners can update their objectives" ON rc_defining_objectives;
DROP POLICY IF EXISTS "Admins can delete defining objectives" ON rc_defining_objectives;

DROP POLICY IF EXISTS "Team members can view metrics" ON rc_do_metrics;
DROP POLICY IF EXISTS "DO owners can create metrics" ON rc_do_metrics;
DROP POLICY IF EXISTS "DO owners can update metrics" ON rc_do_metrics;
DROP POLICY IF EXISTS "DO owners can delete metrics" ON rc_do_metrics;

DROP POLICY IF EXISTS "Team members can view initiatives" ON rc_strategic_initiatives;
DROP POLICY IF EXISTS "DO owners can create initiatives" ON rc_strategic_initiatives;
DROP POLICY IF EXISTS "Initiative owners can update initiatives" ON rc_strategic_initiatives;
DROP POLICY IF EXISTS "Initiative owners can delete initiatives" ON rc_strategic_initiatives;

DROP POLICY IF EXISTS "Team members can view checkins" ON rc_checkins;
DROP POLICY IF EXISTS "Owners can create checkins" ON rc_checkins;
DROP POLICY IF EXISTS "Users can update their checkins" ON rc_checkins;
DROP POLICY IF EXISTS "Users can delete their checkins" ON rc_checkins;

DROP POLICY IF EXISTS "Team members can view links" ON rc_links;
DROP POLICY IF EXISTS "Team members can create links" ON rc_links;
DROP POLICY IF EXISTS "Users can delete their links" ON rc_links;

-- ============================================================================
-- Step 2: Drop team_id index and foreign key from rc_cycles
-- ============================================================================
DROP INDEX IF EXISTS idx_rc_cycles_team_id;
ALTER TABLE rc_cycles DROP CONSTRAINT IF EXISTS rc_cycles_team_id_fkey;

-- ============================================================================
-- Step 3: Make team_id nullable (for backward compatibility during transition)
-- ============================================================================
ALTER TABLE rc_cycles ALTER COLUMN team_id DROP NOT NULL;

-- ============================================================================
-- Step 4: Add company_id column for future multi-tenancy (optional, nullable for now)
-- ============================================================================
ALTER TABLE rc_cycles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================================
-- Step 5: Create new company-wide RLS policies
-- ============================================================================

-- First, drop policies if they already exist to avoid duplicate-name errors
-- rc_cycles
DROP POLICY IF EXISTS "All authenticated users can view cycles" ON rc_cycles;
DROP POLICY IF EXISTS "Admins and super admins can create cycles" ON rc_cycles;
DROP POLICY IF EXISTS "Cycle creators and admins can update cycles" ON rc_cycles;
DROP POLICY IF EXISTS "Super admins can delete cycles" ON rc_cycles;

-- rc_rallying_cries
DROP POLICY IF EXISTS "All authenticated users can view rallying cries" ON rc_rallying_cries;
DROP POLICY IF EXISTS "Admins can create rallying cries" ON rc_rallying_cries;
DROP POLICY IF EXISTS "Owners and admins can update rallying cries" ON rc_rallying_cries;
DROP POLICY IF EXISTS "Admins can delete rallying cries" ON rc_rallying_cries;

-- rc_defining_objectives
DROP POLICY IF EXISTS "All authenticated users can view defining objectives" ON rc_defining_objectives;
DROP POLICY IF EXISTS "Admins can create defining objectives" ON rc_defining_objectives;
DROP POLICY IF EXISTS "DO owners and admins can update objectives" ON rc_defining_objectives;
DROP POLICY IF EXISTS "Admins can delete defining objectives" ON rc_defining_objectives;

-- rc_do_metrics
DROP POLICY IF EXISTS "All authenticated users can view metrics" ON rc_do_metrics;
DROP POLICY IF EXISTS "DO owners and admins can create metrics" ON rc_do_metrics;
DROP POLICY IF EXISTS "DO owners and admins can update metrics" ON rc_do_metrics;
DROP POLICY IF EXISTS "DO owners and admins can delete metrics" ON rc_do_metrics;

-- rc_strategic_initiatives
DROP POLICY IF EXISTS "All authenticated users can view initiatives" ON rc_strategic_initiatives;
DROP POLICY IF EXISTS "DO owners and admins can create initiatives" ON rc_strategic_initiatives;
DROP POLICY IF EXISTS "Initiative owners and admins can update initiatives" ON rc_strategic_initiatives;
DROP POLICY IF EXISTS "Initiative owners and admins can delete initiatives" ON rc_strategic_initiatives;

-- rc_checkins
DROP POLICY IF EXISTS "All authenticated users can view checkins" ON rc_checkins;
DROP POLICY IF EXISTS "Owners can create checkins" ON rc_checkins;
DROP POLICY IF EXISTS "Users can update their checkins" ON rc_checkins;
DROP POLICY IF EXISTS "Users can delete their checkins" ON rc_checkins;

-- rc_links
DROP POLICY IF EXISTS "All authenticated users can view links" ON rc_links;
DROP POLICY IF EXISTS "Authenticated users can create links" ON rc_links;
DROP POLICY IF EXISTS "Users can delete their links" ON rc_links;

-- RC CYCLES POLICIES (Company-wide)
CREATE POLICY "All authenticated users can view cycles" ON rc_cycles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and super admins can create cycles" ON rc_cycles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Cycle creators and admins can update cycles" ON rc_cycles
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Super admins can delete cycles" ON rc_cycles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  );

-- RC RALLYING CRIES POLICIES (Company-wide)
CREATE POLICY "All authenticated users can view rallying cries" ON rc_rallying_cries
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can create rallying cries" ON rc_rallying_cries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM rc_cycles c
      WHERE c.id = rc_rallying_cries.cycle_id
      AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can update rallying cries" ON rc_rallying_cries
  FOR UPDATE USING (
    (locked_at IS NULL AND owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Admins can delete rallying cries" ON rc_rallying_cries
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- RC DEFINING OBJECTIVES POLICIES (Company-wide)
CREATE POLICY "All authenticated users can view defining objectives" ON rc_defining_objectives
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can create defining objectives" ON rc_defining_objectives
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM rc_rallying_cries rc
      WHERE rc.id = rc_defining_objectives.rallying_cry_id
      AND rc.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "DO owners and admins can update objectives" ON rc_defining_objectives
  FOR UPDATE USING (
    (locked_at IS NULL AND owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Admins can delete defining objectives" ON rc_defining_objectives
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- RC DO METRICS POLICIES (Company-wide)
CREATE POLICY "All authenticated users can view metrics" ON rc_do_metrics
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "DO owners and admins can create metrics" ON rc_do_metrics
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rc_defining_objectives dobj
      WHERE dobj.id = rc_do_metrics.defining_objective_id
      AND dobj.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "DO owners and admins can update metrics" ON rc_do_metrics
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM rc_defining_objectives dobj
      WHERE dobj.id = rc_do_metrics.defining_objective_id
      AND dobj.owner_user_id = auth.uid()
      AND dobj.locked_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "DO owners and admins can delete metrics" ON rc_do_metrics
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM rc_defining_objectives dobj
      WHERE dobj.id = rc_do_metrics.defining_objective_id
      AND dobj.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- RC STRATEGIC INITIATIVES POLICIES (Company-wide)
CREATE POLICY "All authenticated users can view initiatives" ON rc_strategic_initiatives
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "DO owners and admins can create initiatives" ON rc_strategic_initiatives
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rc_defining_objectives dobj
      WHERE dobj.id = rc_strategic_initiatives.defining_objective_id
      AND dobj.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Initiative owners and admins can update initiatives" ON rc_strategic_initiatives
  FOR UPDATE USING (
    (locked_at IS NULL AND owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Initiative owners and admins can delete initiatives" ON rc_strategic_initiatives
  FOR DELETE USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- RC CHECKINS POLICIES (Company-wide)
CREATE POLICY "All authenticated users can view checkins" ON rc_checkins
  FOR SELECT USING (auth.uid() IS NOT NULL);

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
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Users can update their checkins" ON rc_checkins
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Users can delete their checkins" ON rc_checkins
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- RC LINKS POLICIES (Company-wide)
CREATE POLICY "All authenticated users can view links" ON rc_links
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create links" ON rc_links
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their links" ON rc_links
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- ============================================================================
-- Step 6: Add comment for documentation
-- ============================================================================
COMMENT ON TABLE rc_cycles IS 'Company-wide strategic cycles (6-month periods). team_id is deprecated.';

