-- Delta-scan state for the extract-inbox-action-items job.
--
-- Tracks, per user and per source (Slack/Gmail), the timestamp up to which
-- messages have already been scanned for action items/questions. Lets the 4x/day
-- job send only new content to Claude instead of re-scanning a fixed window,
-- keeping cost near zero on quiet periods and avoiding duplicate inbox items.

CREATE TABLE cos_action_item_scan_state (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source           text NOT NULL CHECK (source IN ('slack', 'gmail')),
  last_scanned_at  timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source)
);

ALTER TABLE cos_action_item_scan_state ENABLE ROW LEVEL SECURITY;

-- Server-only bookkeeping (written by the extract-inbox-action-items edge
-- function via the service role key), mirroring cos_prep_batch_log — users can
-- read their own row for debugging/settings but never write it directly.
CREATE POLICY "cos_action_item_scan_state: read own rows"
  ON cos_action_item_scan_state FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Register the 4x/day cron trigger (every 6 hours), matching the hardcoded-URL
-- pattern used by daily-prep-batch-hourly (see
-- 20260703000000_fix_daily_prep_batch_cron.sql) since app.settings.* GUCs are
-- not configured on this project.
SELECT cron.schedule(
  'extract-inbox-action-items-4x-daily',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pxirfndomjlqpkwfpqxq.supabase.co/functions/v1/extract-inbox-action-items',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
