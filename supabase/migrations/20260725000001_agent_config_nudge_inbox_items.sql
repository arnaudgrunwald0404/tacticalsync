-- Idea #4: add nudge_inbox_items to the agent_config default, defaulted to
-- false for both new and existing users. Per PLAN_idea4_agentic_followthrough.md
-- Section 5.1/6 — this is intentionally NOT enabled by default even for users
-- who already have agent_config.enabled = true, because this is the most
-- surprising/agentic behavior shipped so far (the agent proactively contacts
-- the user, incl. via Slack DM, rather than responding to something they did).
-- It's turned on only via the one-time in-app opt-in prompt (agent_question
-- item) or the explicit Settings toggle — never silently.

ALTER TABLE cos_settings
  ALTER COLUMN agent_config
  SET DEFAULT '{
    "enabled": false,
    "nudge_actions": true,
    "pre_stage_prep": true,
    "escalate_patterns": false,
    "recommend_format": false,
    "recommend_tools": false,
    "nudge_inbox_items": false,
    "nudge_timing_hours": 24,
    "nudge_max_count": 5,
    "quiet_hours_start": 18,
    "quiet_hours_end": 9,
    "timezone": "America/New_York",
    "slack_notifications": true
  }'::jsonb;

-- Backfill existing rows that don't already have the key set, so the app
-- never has to guess a "missing key" default at read time. Explicitly false
-- for every existing user, regardless of their other agent settings —
-- opting in requires the dedicated prompt/toggle, not a migration.
UPDATE cos_settings
SET agent_config = agent_config || '{"nudge_inbox_items": false}'::jsonb
WHERE NOT (agent_config ? 'nudge_inbox_items');
