-- DCI Brief Automation
-- Piggybacks on the existing daily-prep-batch infrastructure:
--   - Adds DCI columns to cos_prep_schedule (same table used for 1:1 preps)
--   - Adds brief storage columns to cos_dci_logs
--   - Adds unique index on cos_dci_logs(user_id, date) for upsert safety
-- No separate pg_cron job — daily-prep-batch calls generate-dci-brief
-- for users with dci_enabled = true at their configured run_hour_utc.

-- ---------------------------------------------------------------------------
-- 1. Unique index for upsert safety
-- ---------------------------------------------------------------------------
-- The existing idx_cos_dci_logs_user_date is a regular (non-unique) B-tree
-- used for lookups. This unique index lets us do INSERT ... ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS cos_dci_logs_user_date_uniq
  ON cos_dci_logs(user_id, date);

-- ---------------------------------------------------------------------------
-- 2. DCI schedule columns on cos_prep_schedule
-- ---------------------------------------------------------------------------
-- Reuses the existing run_hour_utc — DCI brief generates at the same time
-- as 1:1 preps so integration syncs (calendar, slack, zoom) are already fresh.
ALTER TABLE cos_prep_schedule
  ADD COLUMN IF NOT EXISTS dci_enabled         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dci_slack_dm         boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dci_last_run_at      timestamptz,
  ADD COLUMN IF NOT EXISTS dci_last_run_status  text;

-- ---------------------------------------------------------------------------
-- 3. Brief storage columns on cos_dci_logs
-- ---------------------------------------------------------------------------
ALTER TABLE cos_dci_logs
  ADD COLUMN IF NOT EXISTS brief_markdown       text,
  ADD COLUMN IF NOT EXISTS brief_generated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS data_sources_used    text[];

-- ---------------------------------------------------------------------------
-- 4. RLS note
-- ---------------------------------------------------------------------------
-- Both cos_dci_logs and cos_prep_schedule already have RLS enabled with
-- "Users can manage own ..." FOR ALL policies scoped to auth.uid() = user_id.
-- New columns inherit those policies automatically.
