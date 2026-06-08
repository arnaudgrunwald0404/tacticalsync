-- Twice-daily automatic calendar sync.
-- Adds auto-sync schedule columns to user_calendar_credentials and
-- updates the public view to expose them to the client.

ALTER TABLE user_calendar_credentials
  ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_sync_morning_hour_utc integer NOT NULL DEFAULT 11
    CHECK (auto_sync_morning_hour_utc >= 0 AND auto_sync_morning_hour_utc <= 23),
  ADD COLUMN IF NOT EXISTS auto_sync_midday_hour_utc integer NOT NULL DEFAULT 18
    CHECK (auto_sync_midday_hour_utc >= 0 AND auto_sync_midday_hour_utc <= 23);

COMMENT ON COLUMN user_calendar_credentials.auto_sync_morning_hour_utc IS
  'UTC hour for the first daily auto-sync. Default 11 = ~4am PT / 7am ET.';
COMMENT ON COLUMN user_calendar_credentials.auto_sync_midday_hour_utc IS
  'UTC hour for the second daily auto-sync. Default 18 = ~11am PT / 2pm ET.';

-- DROP + CREATE: CREATE OR REPLACE VIEW cannot add columns before existing
-- ones (Postgres treats it as a column rename and rejects it).
DROP VIEW IF EXISTS user_calendar_credentials_public;
CREATE VIEW user_calendar_credentials_public
WITH (security_invoker = false, security_barrier = true) AS
  SELECT
    user_id,
    provider,
    scope,
    expires_at,
    last_sync_at,
    last_sync_status,
    auto_sync_enabled,
    auto_sync_morning_hour_utc,
    auto_sync_midday_hour_utc,
    created_at,
    updated_at,
    (refresh_token IS NOT NULL) AS connected
  FROM user_calendar_credentials
  WHERE user_id = auth.uid();

GRANT SELECT ON user_calendar_credentials_public TO authenticated;

-- Allow authenticated users to update their own auto-sync preferences.
-- The base table has no SELECT policy (clients use the public view),
-- so tokens remain hidden. This policy only enables saving schedule settings.
CREATE POLICY "Users can update own calendar credentials"
  ON user_calendar_credentials FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for the cron job to quickly find users matching a given hour.
CREATE INDEX IF NOT EXISTS idx_calendar_auto_sync_hours
  ON user_calendar_credentials (auto_sync_enabled)
  WHERE auto_sync_enabled = true;
