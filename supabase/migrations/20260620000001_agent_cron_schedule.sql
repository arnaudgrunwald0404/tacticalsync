-- Register pg_cron job for the agent tick.
-- Runs every 30 minutes, calling the agent-tick edge function with service-role auth.
--
-- NOTE: pg_cron and pg_net must be enabled (done in the previous migration).
-- The app.supabase_url and app.service_role_key settings must be configured
-- on the database (these are set automatically on hosted Supabase projects).
--
-- On local dev, you may need to set these manually:
--   ALTER DATABASE postgres SET app.supabase_url = 'http://localhost:54321';
--   ALTER DATABASE postgres SET app.service_role_key = '<your-service-role-key>';

-- Agent tick: every 30 minutes
SELECT cron.schedule(
  'agent-tick-30m',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true) || '/functions/v1/agent-tick'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
