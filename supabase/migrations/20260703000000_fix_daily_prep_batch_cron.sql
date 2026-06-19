-- Fix the hourly daily-prep-batch cron job.
--
-- The previous registration (20260629000000_daily_prep_batch_cron.sql) built its
-- request URL and Authorization header from custom GUCs:
--     current_setting('app.settings.supabase_url', true)
--     current_setting('app.settings.service_role_key', true)
-- Those settings were never configured on this project, so both resolved to NULL
-- and net.http_post() failed on every run with a not-null violation on "url" —
-- meaning the daily-prep-batch function was never actually invoked by cron.
--
-- This rewrites the job to use the hardcoded project URL with no auth header,
-- matching the working cron-invoked functions in this project (agent-tick,
-- calendar-sync-cron). It relies on daily-prep-batch being deployed with
-- verify_jwt = false so it can be invoked without a bearer token.
--
-- Recovered from the remote migration history (originally applied as
-- 20260619075541) which had never been committed to the repo.

DO $$ BEGIN PERFORM cron.unschedule('daily-prep-batch'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('daily-prep-batch-hourly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'daily-prep-batch-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pxirfndomjlqpkwfpqxq.supabase.co/functions/v1/daily-prep-batch',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
