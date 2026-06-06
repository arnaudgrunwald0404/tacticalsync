-- Log table for daily-prep-batch runs.
-- Tracks each batch execution: what triggered it, how many preps were
-- generated, any errors, and timing.

CREATE TABLE IF NOT EXISTS cos_prep_batch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('cron', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'ok', 'partial', 'failed')),
  -- Counts
  meetings_found integer NOT NULL DEFAULT 0,
  meetings_qualified integer NOT NULL DEFAULT 0,
  preps_generated integer NOT NULL DEFAULT 0,
  preps_cached integer NOT NULL DEFAULT 0,
  -- Integration sync results
  zoom_synced boolean NOT NULL DEFAULT false,
  zoom_recordings integer,
  slack_synced boolean NOT NULL DEFAULT false,
  slack_messages integer,
  -- Errors as a JSON array of {member_id, member_name, error} objects
  errors jsonb NOT NULL DEFAULT '[]',
  -- Summary message for display
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cos_prep_batch_log_user_date
  ON cos_prep_batch_log(user_id, started_at DESC);

ALTER TABLE cos_prep_batch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own batch logs"
  ON cos_prep_batch_log FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
