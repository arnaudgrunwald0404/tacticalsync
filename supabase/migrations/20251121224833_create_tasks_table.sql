-- RC Tasks Table
-- Tasks are aligned to one Strategic Initiative (SI)
-- ============================================================================
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

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_rc_tasks_owner_user_id ON rc_tasks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_strategic_initiative_id ON rc_tasks(strategic_initiative_id);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_status ON rc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_start_date ON rc_tasks(start_date);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_target_delivery_date ON rc_tasks(target_delivery_date);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_actual_delivery_date ON rc_tasks(actual_delivery_date);
CREATE INDEX IF NOT EXISTS idx_rc_tasks_created_by ON rc_tasks(created_by);

-- ============================================================================
-- Updated_at Trigger
-- ============================================================================
DROP TRIGGER IF EXISTS update_rc_tasks_updated_at ON rc_tasks;
CREATE TRIGGER update_rc_tasks_updated_at 
  BEFORE UPDATE ON rc_tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Enable RLS on rc_tasks
-- ============================================================================
ALTER TABLE rc_tasks ENABLE ROW LEVEL SECURITY;

