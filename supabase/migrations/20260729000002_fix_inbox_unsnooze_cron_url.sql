-- 20260726000001_inbox_unsnooze_cron.sql built its request URL and
-- Authorization header from custom GUCs (app.settings.supabase_url,
-- app.settings.service_role_key) that are not configured on this project —
-- the exact same issue already fixed once for daily-prep-batch in
-- 20260703000000_fix_daily_prep_batch_cron.sql. Both GUCs resolve to NULL,
-- so net.http_post() would fail with a not-null violation on every run and
-- inbox-unsnooze-sweep would never actually be invoked by cron.
--
-- Rewrite to the working hardcoded-URL, no-auth-header pattern (matching
-- daily-prep-batch/calendar-sync-cron/agent-tick). The edge function uses its
-- own SUPABASE_SERVICE_ROLE_KEY env var internally and is deployed with
-- verify_jwt = false, so no incoming Authorization header is required.

DO $$ BEGIN PERFORM cron.unschedule('inbox-unsnooze-sweep'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'inbox-unsnooze-sweep',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pxirfndomjlqpkwfpqxq.supabase.co/functions/v1/inbox-unsnooze-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
