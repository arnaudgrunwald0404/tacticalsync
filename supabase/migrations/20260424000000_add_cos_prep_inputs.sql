-- Meeting actions queued during 1:1 prep review
CREATE TABLE IF NOT EXISTS cos_meeting_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cos_meeting_actions_member ON cos_meeting_actions(member_id);
CREATE INDEX idx_cos_meeting_actions_user ON cos_meeting_actions(user_id, status);

ALTER TABLE cos_meeting_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_meeting_actions"
  ON cos_meeting_actions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Per-user prep generation instructions (singleton per user)
CREATE TABLE IF NOT EXISTS cos_prep_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  prep_instructions text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cos_prep_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_prep_settings"
  ON cos_prep_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION cos_prep_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cos_prep_settings_updated_at
  BEFORE UPDATE ON cos_prep_settings
  FOR EACH ROW EXECUTE FUNCTION cos_prep_settings_updated_at();
