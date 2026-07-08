-- Inbox: unsnooze sweep cron.
-- Every 10 minutes, calls inbox-unsnooze-sweep, which:
--   1. Re-resolves person-bound snoozes ("until my next 1:1 with X") against
--      the latest cos_one_on_one_events data, in case the meeting moved.
--   2. Flips any item whose snoozed_until has passed back to status='open'.
--
-- Follows the same pg_cron + pg_net pattern as calendar-sync-cron
-- (see 20260622000001_calendar_sync_cron.sql).

SELECT cron.schedule(
  'inbox-unsnooze-sweep',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true) || '/functions/v1/inbox-unsnooze-sweep'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
