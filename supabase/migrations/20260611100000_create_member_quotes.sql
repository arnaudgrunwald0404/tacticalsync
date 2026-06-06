-- Stores inspiring quotes from team members, extracted from Zoom recordings
-- or Slack transcripts. Displayed on the 1:1 hero card to remind the user
-- what each person stands for.

CREATE TABLE IF NOT EXISTS cos_member_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  quote text NOT NULL,
  said_on date NOT NULL,
  source text CHECK (source IN ('zoom', 'slack', 'manual')),
  source_ref text,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cos_member_quotes_user
  ON cos_member_quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_cos_member_quotes_featured
  ON cos_member_quotes(user_id, featured) WHERE featured = true;

ALTER TABLE cos_member_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_member_quotes"
  ON cos_member_quotes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cos_member_quotes_updated_at
  BEFORE UPDATE ON cos_member_quotes
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
