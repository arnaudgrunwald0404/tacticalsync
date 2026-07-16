-- Schedules the RCDO staleness sweep (rcdo-stale-check/index.ts) once a day.
-- Unlike agent-tick's 30-minute tick, staleness here is measured in weeks
-- (see supabase/functions/_shared/rcdoStaleness.ts), so a daily cadence is
-- plenty — running more often would just re-evaluate the same throttled
-- items without anything new to report.
--
-- Uses the hardcoded-URL, no-auth-header pattern already fixed onto every
-- other pg_cron job in this project (see 20260729000002_fix_inbox_unsnooze_cron_url.sql
-- and 20260703000000_fix_daily_prep_batch_cron.sql) rather than the
-- never-configured `app.settings.*` GUCs the original cron jobs mistakenly
-- relied on.

SELECT cron.schedule(
  'rcdo-stale-check-daily',
  '0 13 * * *', -- 13:00 UTC daily (mid-morning US Eastern, matching this project's default agent_config.timezone)
  $$
  SELECT net.http_post(
    url := 'https://pxirfndomjlqpkwfpqxq.supabase.co/functions/v1/rcdo-stale-check',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
