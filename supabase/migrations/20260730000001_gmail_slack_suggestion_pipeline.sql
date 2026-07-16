-- Gmail (and future Slack) suggestion pipeline
--
-- 1. suggestion_source_processed — dedup table tracking which Gmail threads /
--    Slack messages have already been mined for suggestions, so each source
--    item is processed exactly once. Structured for reuse: source_type
--    distinguishes 'gmail_thread', 'slack_dm', 'slack_channel' so the same
--    table serves the Slack pipeline when that ships.
--
-- 2. dci_suggested_tasks.source_thread_id — back-reference to the originating
--    Gmail thread_id or Slack message ts, for dedup and debugging.
--
-- 3. dci_suggested_tasks.outcome_at — timestamp when a suggestion moves from
--    pending → accepted/dismissed. Used by the gmail-inbox-sync (and future
--    slack-inbox-sync) prompt to build a per-user few-shot signal:
--    "user tends to dismiss X, tends to accept Y."

CREATE TABLE IF NOT EXISTS suggestion_source_processed (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type     text        NOT NULL,
  source_id       text        NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now(),
  suggestions_added int       NOT NULL DEFAULT 0,
  UNIQUE (user_id, source_type, source_id),
  CONSTRAINT suggestion_source_processed_source_type_check
    CHECK (source_type IN ('gmail_thread', 'slack_dm', 'slack_channel'))
);

CREATE INDEX IF NOT EXISTS idx_ssp_user_source
  ON suggestion_source_processed(user_id, source_type);

ALTER TABLE dci_suggested_tasks
  ADD COLUMN IF NOT EXISTS source_thread_id text,
  ADD COLUMN IF NOT EXISTS outcome_at        timestamptz;

-- Stamp outcome_at the moment a suggestion is accepted or dismissed.
CREATE OR REPLACE FUNCTION stamp_suggestion_outcome()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'dismissed') THEN
    NEW.outcome_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS suggestion_outcome_trigger ON dci_suggested_tasks;
CREATE TRIGGER suggestion_outcome_trigger
  BEFORE UPDATE ON dci_suggested_tasks
  FOR EACH ROW EXECUTE FUNCTION stamp_suggestion_outcome();

-- RLS: same pattern as dci_suggested_tasks itself.
ALTER TABLE suggestion_source_processed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own processed sources"
  ON suggestion_source_processed
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
