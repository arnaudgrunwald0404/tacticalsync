-- Per-run audit trail for the Daily Brief (DCI) feature.
-- Each invocation of generate-dci-brief gets one row here.
CREATE TABLE IF NOT EXISTS cos_dci_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type  text        NOT NULL DEFAULT 'manual',   -- 'cron' | 'manual'
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text        NOT NULL DEFAULT 'running',  -- 'running'|'ok'|'failed'|'cancelled'
  items_found   int         NOT NULL DEFAULT 0,
  items_surfaced int        NOT NULL DEFAULT 0,
  error         text,
  summary       text
);

ALTER TABLE cos_dci_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own DCI logs"
  ON cos_dci_log FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX cos_dci_log_user_started ON cos_dci_log (user_id, started_at DESC);
