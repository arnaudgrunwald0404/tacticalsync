-- Zoom meeting transcripts stored locally for fast access during prep generation.

CREATE TABLE IF NOT EXISTS cos_zoom_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES cos_zoom_recordings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  content_type text NOT NULL DEFAULT 'vtt'
    CHECK (content_type IN ('vtt', 'text', 'json')),
  word_count integer,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recording_id)
);

CREATE INDEX IF NOT EXISTS idx_cos_zoom_transcripts_user
  ON cos_zoom_transcripts(user_id);

ALTER TABLE cos_zoom_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_zoom_transcripts"
  ON cos_zoom_transcripts FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
