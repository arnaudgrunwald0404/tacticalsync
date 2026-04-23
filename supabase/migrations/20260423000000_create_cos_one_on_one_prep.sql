-- Persist 1:1 meeting prep in the DB so it's available on desktop and mobile
-- without hunting down local markdown files.

CREATE TABLE IF NOT EXISTS cos_one_on_one_prep (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL UNIQUE REFERENCES cos_team_members(id) ON DELETE CASCADE,
  content text NOT NULL,
  source text NOT NULL CHECK (source IN ('cleargo', 'static')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cos_one_on_one_prep_user ON cos_one_on_one_prep(user_id);

ALTER TABLE cos_one_on_one_prep ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_one_on_one_prep"
  ON cos_one_on_one_prep FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cos_one_on_one_prep_updated_at
  BEFORE UPDATE ON cos_one_on_one_prep
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
