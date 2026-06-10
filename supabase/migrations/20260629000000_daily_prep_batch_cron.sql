-- Register pg_cron job for daily-prep-batch.
-- Runs at the top of every hour; the function itself checks each user's
-- run_hour_utc against the current UTC hour, so only users whose scheduled
-- hour matches are processed.
--
-- Requires pg_cron and pg_net extensions (enabled in earlier migrations).
-- app.settings.supabase_url and app.settings.service_role_key must be set.

SELECT cron.schedule(
  'daily-prep-batch-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true) || '/functions/v1/daily-prep-batch'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
