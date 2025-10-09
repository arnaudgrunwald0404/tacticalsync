-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule birthday check to run daily at 8 AM UTC
SELECT cron.schedule(
  'check-birthdays-daily',
  '0 8 * * *', -- Every day at 8 AM UTC
  $$
  SELECT
    net.http_post(
        url:='https://wbizitotiiongsdzovnr.supabase.co/functions/v1/check-birthdays',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiaXppdG90aWlvbmdzZHpvdm5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5ODcyNDksImV4cCI6MjA3NTU2MzI0OX0.s8MTiBtIDNXTj7RPCIV4mP9osCk1JmA-ualWct5DGPU"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);