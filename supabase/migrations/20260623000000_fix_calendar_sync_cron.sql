-- Fix the hourly calendar-sync cron job.
--
-- The previous job (20260622000001_calendar_sync_cron.sql) built its request URL
-- and Authorization header from custom GUCs:
--     current_setting('app.settings.supabase_url', true)
--     current_setting('app.settings.service_role_key', true)
-- Neither setting was ever configured on this project, so both resolved to NULL.
-- net.http_post() then failed on every run with:
--     null value in column "url" of relation "http_request_queue" violates not-null constraint
-- meaning the calendar-sync-cron function was never actually invoked (0 successes,
-- hundreds of failures) and automatic twice-daily calendar sync never happened.
--
-- This rewrites the job to use the hardcoded project URL with no auth header,
-- matching the working cron-invoked functions in this project (agent-tick,
-- daily-prep-batch). It relies on calendar-sync-cron being deployed with
-- verify_jwt = false so the gateway lets the request through; the function
-- authenticates internally via its own SUPABASE_SERVICE_ROLE_KEY env var and,
-- with no incoming user JWT, runs in cron mode (per-user hour matching).

-- Remove the broken job if it exists.
DO $$
BEGIN
  PERFORM cron.unschedule('calendar-sync-hourly');
EXCEPTION
  WHEN OTHERS THEN
    -- Job didn't exist; nothing to do.
    NULL;
END $$;

-- Reschedule with a hardcoded URL and no dependency on unset GUCs.
SELECT cron.schedule(
  'calendar-sync-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pxirfndomjlqpkwfpqxq.supabase.co/functions/v1/calendar-sync-cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
