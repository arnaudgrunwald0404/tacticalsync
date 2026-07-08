-- Consolidates the two previously-separate, uncoordinated Slack-notification
-- flags (cos_settings.agent_config.slack_notifications and
-- cos_prep_schedule.dci_slack_dm) into one per-notification-type preference
-- blob, so users can control each notification independently from a single
-- Notifications settings page instead of one all-or-nothing Slack switch.

ALTER TABLE cos_settings
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{
    "overdue_action_nudges": true,
    "prep_ready": true,
    "escalation_alerts": true,
    "format_suggestions": true,
    "meeting_followups": true,
    "daily_brief": true
  }'::jsonb;

-- Backfill existing rows from the old flags so behavior doesn't change for
-- users who already turned Slack notifications off.
UPDATE cos_settings s
SET notification_preferences = jsonb_build_object(
  'overdue_action_nudges', COALESCE((s.agent_config->>'slack_notifications')::boolean, true),
  'prep_ready',            COALESCE((s.agent_config->>'slack_notifications')::boolean, true),
  'escalation_alerts',     COALESCE((s.agent_config->>'slack_notifications')::boolean, true),
  'format_suggestions',    COALESCE((s.agent_config->>'slack_notifications')::boolean, true),
  'meeting_followups',     COALESCE((s.agent_config->>'slack_notifications')::boolean, true),
  'daily_brief',           COALESCE((SELECT p.dci_slack_dm FROM cos_prep_schedule p WHERE p.user_id = s.user_id), true)
);
