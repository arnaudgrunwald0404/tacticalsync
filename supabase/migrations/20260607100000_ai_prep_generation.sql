-- AI-powered 1:1 prep generation (pilot)
-- Extends cos_one_on_one_prep to support dated preps and AI generation metadata.
-- Adds prep_generation_log for cost tracking / rate limiting.
-- Adds user_data_source_configs for opt-in external data sources (future phases).

-- ── 1. Extend cos_one_on_one_prep ──────────────────────────────────────────

ALTER TABLE cos_one_on_one_prep
  ADD COLUMN IF NOT EXISTS prep_date date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE cos_one_on_one_prep
  ADD COLUMN IF NOT EXISTS data_sources_used text[] NOT NULL DEFAULT '{}';

ALTER TABLE cos_one_on_one_prep
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';

ALTER TABLE cos_one_on_one_prep
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES cos_one_on_one_events(id) ON DELETE SET NULL;

-- Drop the old one-prep-per-member unique constraint (inline UNIQUE on team_member_id).
ALTER TABLE cos_one_on_one_prep
  DROP CONSTRAINT IF EXISTS cos_one_on_one_prep_team_member_id_key;

-- New: one prep per member per date per user.
ALTER TABLE cos_one_on_one_prep
  ADD CONSTRAINT cos_one_on_one_prep_member_date_unique
  UNIQUE (user_id, team_member_id, prep_date);

-- Expand valid source values.
ALTER TABLE cos_one_on_one_prep
  DROP CONSTRAINT IF EXISTS cos_one_on_one_prep_source_check;

ALTER TABLE cos_one_on_one_prep
  ADD CONSTRAINT cos_one_on_one_prep_source_check
  CHECK (source IN ('cleargo', 'static', 'ai_generated'));

ALTER TABLE cos_one_on_one_prep
  ADD CONSTRAINT cos_one_on_one_prep_status_check
  CHECK (status IN ('generating', 'ready', 'failed'));

-- ── 2. prep_generation_log ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prep_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  prep_id uuid REFERENCES cos_one_on_one_prep(id) ON DELETE SET NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  duration_ms integer,
  data_sources_used text[] NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prep_generation_log_user_date
  ON prep_generation_log(user_id, created_at DESC);

ALTER TABLE prep_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prep generation logs"
  ON prep_generation_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 3. user_data_source_configs (future phases) ───────────────────────────

CREATE TABLE IF NOT EXISTS user_data_source_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('cleargo', 'slack', 'zoom')),
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_data_source_configs_user
  ON user_data_source_configs(user_id, source_type);

ALTER TABLE user_data_source_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own data source configs"
  ON user_data_source_configs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_data_source_configs_updated_at
  BEFORE UPDATE ON user_data_source_configs
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
