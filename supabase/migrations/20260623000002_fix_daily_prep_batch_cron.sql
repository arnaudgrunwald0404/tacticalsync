-- Fix the daily-prep-batch cron.
--
-- Two redundant hourly jobs both targeted daily-prep-batch and both failed every run:
--   * job "daily-prep-batch"        used extensions.http_post(...), which does not
--     exist on this project -> "function extensions.http_post(...) does not exist".
--   * job "daily-prep-batch-hourly" used current_setting('app.settings.supabase_url'/
--     'service_role_key'), which were never configured -> NULL url -> not-null
--     violation on net.http_request_queue (same failure as the calendar cron had).
--
-- daily-prep-batch is deployed with verify_jwt = false and runs in cron mode when
-- no Authorization header is present (it selects users whose cos_prep_schedule
-- run_hour_utc matches the current hour), so an hourly no-auth POST to the hardcoded
-- URL is the correct trigger — matching agent-tick / calendar-sync-cron.
--
-- Consolidate to a single working job.

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
