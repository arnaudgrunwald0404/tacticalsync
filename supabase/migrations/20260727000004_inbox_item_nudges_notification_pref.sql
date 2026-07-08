-- The idea #4 (agentic follow-through) pre-1:1 / due-date inbox nudge Slack
-- DM was accidentally left out of the 20260721000002_notification_preferences
-- migration: it still checked the removed agent_config.slack_notifications
-- flag, which is undefined on every row, so that DM has been silently
-- skipped since the day this notification type shipped.

ALTER TABLE cos_settings
  ALTER COLUMN notification_preferences
  SET DEFAULT '{
    "overdue_action_nudges": true,
    "prep_ready": true,
    "escalation_alerts": true,
    "format_suggestions": true,
    "meeting_followups": true,
    "daily_brief": true,
    "inbox_item_nudges": true
  }'::jsonb;

UPDATE cos_settings
SET notification_preferences = notification_preferences || jsonb_build_object(
  'inbox_item_nudges', COALESCE((agent_config->>'slack_notifications')::boolean, true)
)
WHERE NOT (notification_preferences ? 'inbox_item_nudges');
