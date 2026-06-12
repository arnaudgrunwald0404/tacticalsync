-- DCI Inbox
-- Replaces local ~/.claude/daily-briefings/ files with Supabase storage so
-- the app can read agent output and the banner can show live status.
--
-- Changes:
--   1. daily_plan JSONB column on cos_dci_logs  → replaces YYYY-MM-DD-plan.json
--   2. dci_suggested_tasks table               → replaces YYYY-MM-DD-log.md inbox

-- ---------------------------------------------------------------------------
-- 1. Daily plan column on cos_dci_logs
-- ---------------------------------------------------------------------------
-- Stores the morning calendar scan output. Agents upsert on (user_id, date).
-- Schema of each element in meetings[]:
--   { title, start, end, attendees[], zoom_meeting_id, transcript_checked, action_items_extracted }
ALTER TABLE cos_dci_logs
  ADD COLUMN IF NOT EXISTS daily_plan jsonb NOT NULL DEFAULT '{"meetings": []}';

COMMENT ON COLUMN cos_dci_logs.daily_plan IS
  'Morning calendar scan output. JSON: { meetings: [{ title, start, end, attendees, zoom_meeting_id, transcript_checked, action_items_extracted }] }';

-- ---------------------------------------------------------------------------
-- 2. DCI suggested tasks (inbox)
-- ---------------------------------------------------------------------------
-- Each row is one action item discovered by an agent (post-meeting, EOD DCI,
-- or manual DCI run). The app reads pending rows for the banner + inbox UI.
-- Users accept → converts to a commitment; dismiss → hides it.
CREATE TABLE IF NOT EXISTS dci_suggested_tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            date        NOT NULL DEFAULT CURRENT_DATE,
  title           text        NOT NULL,
  source          text,        -- human-readable origin: "GTM Weekly Meeting", "Slack DM from Dan Pope"
  source_type     text        CHECK (source_type IN ('meeting', 'email', 'slack', 'manual')),
  urgency         text        CHECK (urgency IN ('urgent', 'this_week', 'watching')),
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'dismissed')),
  raw_context     text,        -- the quote or snippet that triggered this suggestion
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dci_suggested_tasks_user_date
  ON dci_suggested_tasks(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_dci_suggested_tasks_status
  ON dci_suggested_tasks(user_id, status)
  WHERE status = 'pending';

ALTER TABLE dci_suggested_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own dci_suggested_tasks"
  ON dci_suggested_tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER dci_suggested_tasks_updated_at
  BEFORE UPDATE ON dci_suggested_tasks
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
