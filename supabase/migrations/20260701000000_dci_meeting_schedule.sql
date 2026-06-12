-- DCI Meeting Schedule
-- Replaces the daily_plan JSONB blob on cos_dci_logs with a proper normalized
-- table: one row per meeting per user per day. This enables:
--   - Efficient cross-user query for the post-meeting agent ("find all unprocessed
--     meetings that ended recently") without scanning JSONB blobs
--   - Safe concurrent updates (no read-modify-write on a blob)
--   - Clean indexing and partial indexes on processing state

CREATE TABLE IF NOT EXISTS dci_meeting_schedule (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                  date        NOT NULL DEFAULT CURRENT_DATE,
  title                 text        NOT NULL,
  start_time            timestamptz NOT NULL,
  end_time              timestamptz NOT NULL,
  attendees             text[]      NOT NULL DEFAULT '{}',
  zoom_meeting_id       text,
  transcript_checked    boolean     NOT NULL DEFAULT false,
  action_items_extracted boolean    NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Core query for post-meeting agent:
-- "which meetings across all users ended recently and haven't been processed?"
CREATE INDEX IF NOT EXISTS idx_dci_meeting_schedule_pending
  ON dci_meeting_schedule(end_time, transcript_checked)
  WHERE transcript_checked = false;

-- Per-user daily view
CREATE INDEX IF NOT EXISTS idx_dci_meeting_schedule_user_date
  ON dci_meeting_schedule(user_id, date DESC);

-- Prevent duplicate rows when the morning scan re-runs for the same day
CREATE UNIQUE INDEX IF NOT EXISTS idx_dci_meeting_schedule_unique
  ON dci_meeting_schedule(user_id, date, title, start_time);

ALTER TABLE dci_meeting_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own dci_meeting_schedule"
  ON dci_meeting_schedule FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER dci_meeting_schedule_updated_at
  BEFORE UPDATE ON dci_meeting_schedule
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
