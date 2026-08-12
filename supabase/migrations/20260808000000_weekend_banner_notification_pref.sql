-- Adds the weekend banner as a togglable in-app preference, defaulting to off
-- (the banner is currently hidden for everyone via a hardcoded guard in
-- AppLayout.tsx / Inbox.tsx — this migration is the first step in replacing
-- that guard with a real per-user Settings toggle). Follows the exact
-- pattern used in 20260727000004_inbox_item_nudges_notification_pref.sql.

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
    "rcdo_stale_alerts": true,
    "weekend_banner": false
  }'::jsonb;

UPDATE cos_settings
SET notification_preferences = notification_preferences || jsonb_build_object('weekend_banner', false)
WHERE NOT (notification_preferences ? 'weekend_banner');
