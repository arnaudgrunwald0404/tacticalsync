-- RCDO Module: Rallying Cry & Defining Objectives
-- Creates tables for strategic alignment and quarterly/semi-annual planning

-- ============================================================================
-- RC Cycles Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS rc_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('half')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'review', 'archived')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rc_cycles_six_month_duration CHECK (
    end_date = start_date + INTERVAL '6 months' - INTERVAL '1 day'
  )
);

-- ============================================================================
-- RC Rallying Cries Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS rc_rallying_cries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES rc_cycles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  narrative TEXT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed', 'in_progress', 'done')),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rc_rallying_cries_single_per_cycle UNIQUE (cycle_id)
);

-- ============================================================================
-- RC Defining Objectives Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS rc_defining_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rallying_cry_id UUID NOT NULL REFERENCES rc_rallying_cries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hypothesis TEXT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'locked', 'done')),
  health TEXT DEFAULT 'on_track' CHECK (health IN ('on_track', 'at_risk', 'off_track', 'done')),
  confidence_pct INTEGER DEFAULT 50 CHECK (confidence_pct >= 0 AND confidence_pct <= 100),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_health_calc_at TIMESTAMPTZ,
  weight_pct INTEGER DEFAULT 100 CHECK (weight_pct >= 0 AND weight_pct <= 100),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RC DO Metrics Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS rc_do_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  defining_objective_id UUID NOT NULL REFERENCES rc_defining_objectives(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('leading', 'lagging')),
  unit TEXT,
  target_numeric DECIMAL(15, 2),
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  current_numeric DECIMAL(15, 2),
  last_updated_at TIMESTAMPTZ,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'api', 'sheet', 'jira', 'clearinsights')),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RC Strategic Initiatives Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS rc_strategic_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  defining_objective_id UUID NOT NULL REFERENCES rc_defining_objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'not_started', 'active', 'blocked', 'done')),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RC Check-ins Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS rc_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type TEXT NOT NULL CHECK (parent_type IN ('do', 'initiative')),
  parent_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  summary TEXT,
  blockers TEXT,
  next_steps TEXT,
  sentiment INTEGER CHECK (sentiment >= -2 AND sentiment <= 2),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RC Links Table (connects DOs to meeting priorities/action items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rc_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type TEXT NOT NULL CHECK (parent_type IN ('do', 'initiative')),
  parent_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('meeting_priority', 'action_item', 'topic', 'decision', 'jira', 'doc')),
  ref_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (parent_type, parent_id, kind, ref_id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_rc_cycles_team_id ON rc_cycles(team_id);
CREATE INDEX IF NOT EXISTS idx_rc_cycles_status ON rc_cycles(status);
CREATE INDEX IF NOT EXISTS idx_rc_cycles_dates ON rc_cycles(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rc_cycles_created_by ON rc_cycles(created_by);

CREATE INDEX IF NOT EXISTS idx_rc_rallying_cries_cycle_id ON rc_rallying_cries(cycle_id);
CREATE INDEX IF NOT EXISTS idx_rc_rallying_cries_owner_user_id ON rc_rallying_cries(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rc_rallying_cries_status ON rc_rallying_cries(status);

CREATE INDEX IF NOT EXISTS idx_rc_defining_objectives_rallying_cry_id ON rc_defining_objectives(rallying_cry_id);
CREATE INDEX IF NOT EXISTS idx_rc_defining_objectives_owner_user_id ON rc_defining_objectives(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rc_defining_objectives_status ON rc_defining_objectives(status);
CREATE INDEX IF NOT EXISTS idx_rc_defining_objectives_health ON rc_defining_objectives(health);

CREATE INDEX IF NOT EXISTS idx_rc_do_metrics_defining_objective_id ON rc_do_metrics(defining_objective_id);
CREATE INDEX IF NOT EXISTS idx_rc_do_metrics_type ON rc_do_metrics(type);

CREATE INDEX IF NOT EXISTS idx_rc_strategic_initiatives_defining_objective_id ON rc_strategic_initiatives(defining_objective_id);
CREATE INDEX IF NOT EXISTS idx_rc_strategic_initiatives_owner_user_id ON rc_strategic_initiatives(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rc_strategic_initiatives_status ON rc_strategic_initiatives(status);

CREATE INDEX IF NOT EXISTS idx_rc_checkins_parent ON rc_checkins(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_rc_checkins_date ON rc_checkins(date);
CREATE INDEX IF NOT EXISTS idx_rc_checkins_created_by ON rc_checkins(created_by);

CREATE INDEX IF NOT EXISTS idx_rc_links_parent ON rc_links(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_rc_links_ref ON rc_links(kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_rc_links_created_by ON rc_links(created_by);

-- ============================================================================
-- Updated_at Triggers
-- ============================================================================
-- Make triggers idempotent: drop if exists before creating
DROP TRIGGER IF EXISTS update_rc_cycles_updated_at ON rc_cycles;
CREATE TRIGGER update_rc_cycles_updated_at 
  BEFORE UPDATE ON rc_cycles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rc_rallying_cries_updated_at ON rc_rallying_cries;
CREATE TRIGGER update_rc_rallying_cries_updated_at 
  BEFORE UPDATE ON rc_rallying_cries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rc_defining_objectives_updated_at ON rc_defining_objectives;
CREATE TRIGGER update_rc_defining_objectives_updated_at 
  BEFORE UPDATE ON rc_defining_objectives 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rc_do_metrics_updated_at ON rc_do_metrics;
CREATE TRIGGER update_rc_do_metrics_updated_at 
  BEFORE UPDATE ON rc_do_metrics 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rc_strategic_initiatives_updated_at ON rc_strategic_initiatives;
CREATE TRIGGER update_rc_strategic_initiatives_updated_at 
  BEFORE UPDATE ON rc_strategic_initiatives 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rc_checkins_updated_at ON rc_checkins;
CREATE TRIGGER update_rc_checkins_updated_at 
  BEFORE UPDATE ON rc_checkins 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Enable RLS on all RCDO tables
-- ============================================================================
ALTER TABLE rc_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_rallying_cries ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_defining_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_do_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_strategic_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_links ENABLE ROW LEVEL SECURITY;

