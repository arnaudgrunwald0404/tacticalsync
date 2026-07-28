-- Twice-daily automatic Slack sync + per-source inbox-triage opt-out.
-- Gives the Slack sync panel the same schedule controls the Calendar/Gmail
-- panel has (see 20260622000000_calendar_auto_sync.sql), backed by a real
-- hourly cron match (slack-sync-cron) rather than a cosmetic toggle.

ALTER TABLE user_slack_credentials
  ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_sync_morning_hour_utc integer NOT NULL DEFAULT 11
    CHECK (auto_sync_morning_hour_utc >= 0 AND auto_sync_morning_hour_utc <= 23),
  ADD COLUMN IF NOT EXISTS auto_sync_midday_hour_utc integer NOT NULL DEFAULT 18
    CHECK (auto_sync_midday_hour_utc >= 0 AND auto_sync_midday_hour_utc <= 23);

COMMENT ON COLUMN user_slack_credentials.auto_sync_morning_hour_utc IS
  'UTC hour for the first daily auto-sync. Default 11 = ~4am PT / 7am ET.';
COMMENT ON COLUMN user_slack_credentials.auto_sync_midday_hour_utc IS
  'UTC hour for the second daily auto-sync. Default 18 = ~11am PT / 2pm ET.';

-- DROP + CREATE: CREATE OR REPLACE VIEW cannot add columns before existing
-- ones (Postgres treats it as a column rename and rejects it).
DROP VIEW IF EXISTS user_slack_credentials_public;
CREATE VIEW user_slack_credentials_public
WITH (security_invoker = false, security_barrier = true) AS
  SELECT
    user_id,
    provider,
    scope,
    slack_team_name,
    slack_email,
    last_sync_at,
    last_sync_status,
    created_at,
    updated_at,
    (access_token IS NOT NULL) AS connected,
    sync_channels,
    auto_sync_enabled,
    auto_sync_morning_hour_utc,
    auto_sync_midday_hour_utc
  FROM user_slack_credentials
  WHERE user_id = auth.uid();

GRANT SELECT ON user_slack_credentials_public TO authenticated;

-- Row-level UPDATE access already exists via "Users can update own slack
-- sync_channels" (20260707000000_slack_sync_channels.sql) — RLS policies are
-- row-scoped, not column-scoped, so it already covers these new columns too.

-- Index for the cron job to quickly find users matching a given hour.
CREATE INDEX IF NOT EXISTS idx_slack_auto_sync_hours
  ON user_slack_credentials (auto_sync_enabled)
  WHERE auto_sync_enabled = true;

-- Per-source opt-out for the inbox-triage scan (extract-inbox-action-items).
-- Slack messages have always been mined for action items unconditionally
-- once connected, unlike Gmail which is gated on email_triage_preferences
-- .enabled. Default true preserves that existing behavior while letting
-- users turn Slack mining off independent of their Gmail preference.
ALTER TABLE email_triage_preferences
  ADD COLUMN IF NOT EXISTS slack_enabled boolean NOT NULL DEFAULT true;

-- Register the hourly cron trigger; slack-sync-cron itself decides per-user
-- whether the current UTC hour matches their configured schedule, same
-- pattern as calendar-sync-hourly (20260623000002_fix_calendar_sync_cron.sql).
SELECT cron.schedule(
  'slack-sync-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pxirfndomjlqpkwfpqxq.supabase.co/functions/v1/slack-sync-cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
