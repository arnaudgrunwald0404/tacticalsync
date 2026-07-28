-- Rename email_triage_preferences → sources_triage_preferences.
--
-- The table now gates inbox-triage scanning for both Gmail (`enabled`) and
-- Slack (`slack_enabled`, added in 20260801000000_slack_auto_sync.sql) —
-- the original Gmail-only name no longer describes what it does.
-- RLS policies, the primary key, and all row data carry over automatically
-- on a table rename; only the policy display names are updated here for
-- clarity.

ALTER TABLE email_triage_preferences RENAME TO sources_triage_preferences;

ALTER POLICY "Users can read own email triage preferences"
  ON sources_triage_preferences RENAME TO "Users can read own triage preferences";

ALTER POLICY "Users can upsert own email triage preferences"
  ON sources_triage_preferences RENAME TO "Users can upsert own triage preferences";

ALTER POLICY "Users can update own email triage preferences"
  ON sources_triage_preferences RENAME TO "Users can update own triage preferences";
