-- Add columns required by the DCI agents that weren't included in earlier migrations.
-- Both use IF NOT EXISTS so this is safe to run against projects that already have them.

ALTER TABLE cos_prep_schedule
  ADD COLUMN IF NOT EXISTS slack_user_id  text,
  ADD COLUMN IF NOT EXISTS timezone       text NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN cos_prep_schedule.slack_user_id IS
  'Slack member ID (e.g. U01234ABCDE). Used by DCI agents to filter DMs and mentions for this user.';
COMMENT ON COLUMN cos_prep_schedule.timezone IS
  'IANA timezone name (e.g. America/Los_Angeles). Used to interpret run_hour_utc and date boundaries.';
