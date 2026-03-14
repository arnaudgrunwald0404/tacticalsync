-- Commitment Quarters: personal priorities & monthly commitments tracking
-- Separate from the strategic RCDO layer (6-month cycles)
-- Supports Q1/Q2/Q3/Q4 quarterly cadence with 3 priorities + 3 monthly commitments per person

-- ─── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE commitment_quarters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,           -- e.g. "Q1 2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Manager → direct report relationships (team-scoped, populated once per org change)
CREATE TABLE team_reporting_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, manager_id, report_id)
);

-- Up to 3 quarterly priorities per person per quarter
CREATE TABLE personal_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id UUID NOT NULL REFERENCES commitment_quarters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  display_order INT NOT NULL DEFAULT 1 CHECK (display_order BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Up to 3 monthly commitments × 3 months per person per quarter
CREATE TABLE monthly_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id UUID NOT NULL REFERENCES commitment_quarters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month_number INT NOT NULL CHECK (month_number BETWEEN 1 AND 3), -- 1=first month of quarter, etc.
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'at_risk')),
  display_order INT NOT NULL DEFAULT 1 CHECK (display_order BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX idx_commitment_quarters_team_id ON commitment_quarters(team_id);
CREATE INDEX idx_commitment_quarters_status ON commitment_quarters(status);
CREATE INDEX idx_team_reporting_lines_manager ON team_reporting_lines(team_id, manager_id);
CREATE INDEX idx_team_reporting_lines_report ON team_reporting_lines(team_id, report_id);
CREATE INDEX idx_personal_priorities_quarter_user ON personal_priorities(quarter_id, user_id);
CREATE INDEX idx_monthly_commitments_quarter_user ON monthly_commitments(quarter_id, user_id);
CREATE INDEX idx_monthly_commitments_quarter_month ON monthly_commitments(quarter_id, month_number);

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE commitment_quarters ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_reporting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_commitments ENABLE ROW LEVEL SECURITY;

-- commitment_quarters: team members can read; team admins can insert/update
CREATE POLICY "Team members can view commitment quarters"
  ON commitment_quarters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = commitment_quarters.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Team admins can manage commitment quarters"
  ON commitment_quarters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = commitment_quarters.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
    )
  );

-- team_reporting_lines: team members can read; admins can manage
CREATE POLICY "Team members can view reporting lines"
  ON team_reporting_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_reporting_lines.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Team admins can manage reporting lines"
  ON team_reporting_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_reporting_lines.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
    )
  );

-- personal_priorities: user owns their rows; managers can read reports' rows; admins can read all
CREATE POLICY "Users can manage their own priorities"
  ON personal_priorities FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Managers can view direct reports priorities"
  ON personal_priorities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_reporting_lines trl
      JOIN commitment_quarters cq ON cq.id = personal_priorities.quarter_id
      WHERE trl.team_id = cq.team_id
        AND trl.manager_id = auth.uid()
        AND trl.report_id = personal_priorities.user_id
    )
  );

CREATE POLICY "Team admins can view all priorities in their team"
  ON personal_priorities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN commitment_quarters cq ON cq.team_id = tm.team_id
      WHERE cq.id = personal_priorities.quarter_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
    )
  );

-- monthly_commitments: same pattern as personal_priorities
CREATE POLICY "Users can manage their own commitments"
  ON monthly_commitments FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Managers can view direct reports commitments"
  ON monthly_commitments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_reporting_lines trl
      JOIN commitment_quarters cq ON cq.id = monthly_commitments.quarter_id
      WHERE trl.team_id = cq.team_id
        AND trl.manager_id = auth.uid()
        AND trl.report_id = monthly_commitments.user_id
    )
  );

CREATE POLICY "Team admins can view all commitments in their team"
  ON monthly_commitments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN commitment_quarters cq ON cq.team_id = tm.team_id
      WHERE cq.id = monthly_commitments.quarter_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
    )
  );
