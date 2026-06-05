-- Zoom meeting recordings metadata, linked to team members.

CREATE TABLE IF NOT EXISTS cos_zoom_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES cos_team_members(id) ON DELETE SET NULL,
  zoom_meeting_id text NOT NULL,
  zoom_meeting_uuid text NOT NULL,
  topic text,
  start_time timestamptz NOT NULL,
  duration_minutes integer,
  participant_emails text[] NOT NULL DEFAULT '{}',
  participant_names text[] NOT NULL DEFAULT '{}',
  has_transcript boolean NOT NULL DEFAULT false,
  recording_files jsonb NOT NULL DEFAULT '[]',
  ai_summary text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, zoom_meeting_uuid)
);

CREATE INDEX IF NOT EXISTS idx_cos_zoom_recordings_user_start
  ON cos_zoom_recordings(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_cos_zoom_recordings_member
  ON cos_zoom_recordings(team_member_id);

ALTER TABLE cos_zoom_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_zoom_recordings"
  ON cos_zoom_recordings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cos_zoom_recordings_updated_at
  BEFORE UPDATE ON cos_zoom_recordings
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
