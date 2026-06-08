-- Hourly cron job for automatic calendar sync.
-- Runs at the top of every hour, calling calendar-sync-cron which checks
-- each user's auto_sync_morning_hour_utc and auto_sync_midday_hour_utc.
--
-- Requires pg_cron and pg_net extensions (enabled in earlier migrations).
-- app.settings.supabase_url and app.settings.service_role_key must be set.

SELECT cron.schedule(
  'calendar-sync-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true) || '/functions/v1/calendar-sync-cron'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
