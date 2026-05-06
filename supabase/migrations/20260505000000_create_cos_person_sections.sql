-- Semi-static list: what a direct report owns / is accountable for
CREATE TABLE IF NOT EXISTS cos_person_accountabilities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  text       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cos_person_accountabilities_member ON cos_person_accountabilities(member_id);
CREATE INDEX idx_cos_person_accountabilities_user   ON cos_person_accountabilities(user_id);

ALTER TABLE cos_person_accountabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_person_accountabilities"
  ON cos_person_accountabilities FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Dynamic discussion topics / priorities to raise per person
CREATE TABLE IF NOT EXISTS cos_person_topics (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  text       text NOT NULL,
  status     text DEFAULT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cos_person_topics_member ON cos_person_topics(member_id);
CREATE INDEX idx_cos_person_topics_user   ON cos_person_topics(user_id);

ALTER TABLE cos_person_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_person_topics"
  ON cos_person_topics FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION cos_person_topics_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cos_person_topics_updated_at
  BEFORE UPDATE ON cos_person_topics
  FOR EACH ROW EXECUTE FUNCTION cos_person_topics_set_updated_at();
