-- Adds the RCDO staleness Slack DM as its own togglable notification type,
-- following the exact pattern 20260727000004_inbox_item_nudges_notification_pref.sql
-- used to add inbox_item_nudges: update the column default (new users) and
-- backfill existing rows so the new key defaults to on rather than being
-- absent (absent would read as `undefined`, which
-- `{ ...DEFAULT_NOTIFICATION_PREFERENCES, ...stored }` already treats as "on"
-- client-side, but the edge function checks the raw stored value directly —
-- see rcdo-stale-check/index.ts — so an explicit backfill keeps both call
-- sites consistent instead of relying on a default that only one of them applies).

ALTER TABLE cos_settings
  ALTER COLUMN notification_preferences
  SET DEFAULT '{
    "overdue_action_nudges": true,
    "prep_ready": true,
    "escalation_alerts": true,
    "format_suggestions": true,
    "meeting_followups": true,
    "daily_brief": true,
    "inbox_item_nudges": true,
    "rcdo_stale_alerts": true
  }'::jsonb;

UPDATE cos_settings
SET notification_preferences = notification_preferences || jsonb_build_object('rcdo_stale_alerts', true)
WHERE NOT (notification_preferences ? 'rcdo_stale_alerts');
