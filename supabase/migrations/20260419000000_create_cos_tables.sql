-- Chief of Staff module: priorities, DCI logs, team members

CREATE TABLE IF NOT EXISTS cos_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  category text NOT NULL CHECK (category IN ('this_week', 'april', 'strategic', 'people')),
  tier_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cos_dci_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  priority_1 text,
  priority_2 text,
  priority_3 text,
  topic_raised text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cos_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN ('direct_report', 'collaborator')),
  context_notes text,
  last_1on1_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cos_priorities_user ON cos_priorities(user_id);
CREATE INDEX idx_cos_priorities_category ON cos_priorities(category);
CREATE INDEX idx_cos_dci_logs_user_date ON cos_dci_logs(user_id, date DESC);
CREATE INDEX idx_cos_team_members_user ON cos_team_members(user_id);

-- RLS
ALTER TABLE cos_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cos_dci_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cos_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_priorities"
  ON cos_priorities FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own cos_dci_logs"
  ON cos_dci_logs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own cos_team_members"
  ON cos_team_members FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at triggers (function may already exist in schema)
CREATE OR REPLACE FUNCTION cos_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cos_priorities_updated_at
  BEFORE UPDATE ON cos_priorities
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();

CREATE TRIGGER cos_team_members_updated_at
  BEFORE UPDATE ON cos_team_members
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
