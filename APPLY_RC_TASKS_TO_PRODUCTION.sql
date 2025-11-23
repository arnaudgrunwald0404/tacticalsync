-- =============================================================================
-- APPLY RC_TASKS TABLE TO PRODUCTION
-- Execute this SQL in Supabase Dashboard → SQL Editor
-- URL: https://supabase.com/dashboard/project/pxirfndomjlqpkwfpqxq/sql
-- =============================================================================
-- 
-- This script creates the rc_tasks table and related policies:
-- 1. Creates rc_tasks table with all columns and indexes
-- 2. Updates rc_checkins to support 'task' as a parent_type
-- 3. Creates RLS policies for rc_tasks
-- =============================================================================

-- =============================================================================
-- PART 1: Create rc_tasks table
-- =============================================================================

-- RC Tasks Table
-- Tasks are aligned to one Strategic Initiative (SI)
CREATE TABLE IF NOT EXISTS rc_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  completion_criteria TEXT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategic_initiative_id UUID NOT NULL REFERENCES rc_strategic_initiatives(id) ON DELETE CASCADE,
  start_date DATE,
  target_delivery_date DATE,
  actual_delivery_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'not_assigned' CHECK (status IN ('not_assigned', 'assigned', 'in_progress', 'completed', 'task_changed_canceled', 'delayed')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  display_order INTEGER DEFAULT 0
);

-- =============================================================================
-- Add foreign key constraints to profiles for Supabase relationship resolution
-- =============================================================================
-- These constraints allow Supabase to resolve relationships when querying
-- owner:profiles!owner_user_id(...) and similar queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_rc_tasks_owner_user_id_profiles'
  ) THEN
    ALTER TABLE rc_tasks 
    ADD CONSTRAINT fk_rc_tasks_owner_user_id_profiles 
    FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_rc_tasks_created_by_profiles'
  ) THEN
    ALTER TABLE rc_tasks 
    ADD CONSTRAINT fk_rc_tasks_created_by_profiles 
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- Indexes for Performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_rc_tasks_owner_user_id ON rc_tasks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_strategic_initiative_id ON rc_tasks(strategic_initiative_id);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_status ON rc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_start_date ON rc_tasks(start_date);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_target_delivery_date ON rc_tasks(target_delivery_date);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_actual_delivery_date ON rc_tasks(actual_delivery_date);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_created_by ON rc_tasks(created_by);

-- =============================================================================
-- Updated_at Trigger
-- =============================================================================
DROP TRIGGER IF EXISTS update_rc_tasks_updated_at ON rc_tasks;
CREATE TRIGGER update_rc_tasks_updated_at 
  BEFORE UPDATE ON rc_tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Enable RLS on rc_tasks
-- =============================================================================
ALTER TABLE rc_tasks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PART 2: Update rc_checkins to support tasks
-- =============================================================================

-- Update rc_checkins to support tasks
-- Add 'task' to parent_type enum
ALTER TABLE rc_checkins DROP CONSTRAINT IF EXISTS rc_checkins_parent_type_check;

-- Add new constraint with 'task' included
ALTER TABLE rc_checkins ADD CONSTRAINT rc_checkins_parent_type_check 
  CHECK (parent_type IN ('do', 'initiative', 'task'));

COMMENT ON COLUMN rc_checkins.parent_type IS 'Type of parent entity: do, initiative, or task';

-- =============================================================================
-- PART 3: RLS Policies for rc_tasks
-- =============================================================================

-- Drop existing policies if they exist (to allow re-running the script)
DROP POLICY IF EXISTS "Users can view tasks for accessible SIs" ON rc_tasks;
DROP POLICY IF EXISTS "Users can create tasks for accessible SIs" ON rc_tasks;
DROP POLICY IF EXISTS "Users can update tasks they own or manage" ON rc_tasks;
DROP POLICY IF EXISTS "Users can delete tasks they own or manage" ON rc_tasks;

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

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running this script:
-- 1. The rc_tasks table should exist with all columns and indexes
-- 2. rc_checkins should support 'task' as a parent_type
-- 3. All RLS policies should be in place
-- 4. Refresh your dashboard - the error should be resolved
-- =============================================================================

SELECT 'RC Tasks table and policies applied successfully!' as status;

