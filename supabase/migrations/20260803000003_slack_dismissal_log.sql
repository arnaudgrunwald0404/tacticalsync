-- Rename email_dismissal_log → inbox_dismissal_log and extend it for Slack.
--
-- The dismissal-log/suppression-inference loop (extract-inbox-action-items,
-- inferSuppressionRules in _shared/inboxTriageUtils.ts) only ever recorded
-- Gmail dismissals — dismissing a Slack suggestion in InboxSuggestionsPanel
-- just archived the item with no signal captured anywhere. This extends the
-- same table to carry Slack identity (channel + sender) so the same
-- threshold-based suppression logic can learn from Slack dismissals too.
-- RLS policies, the primary key, and all row data carry over automatically
-- on a table rename; only the policy/index display names are updated here
-- for clarity, matching the precedent set by
-- 20260801000001_rename_triage_preferences_table.sql.

ALTER TABLE email_dismissal_log RENAME TO inbox_dismissal_log;

ALTER TABLE inbox_dismissal_log
  ADD COLUMN source text NOT NULL DEFAULT 'gmail' CHECK (source IN ('gmail', 'slack')),
  ADD COLUMN slack_channel_id text,
  ADD COLUMN slack_sender_id text;

ALTER POLICY "Users can read own dismissal log"
  ON inbox_dismissal_log RENAME TO "Users can read own inbox dismissal log";

ALTER POLICY "Users can insert own dismissal log"
  ON inbox_dismissal_log RENAME TO "Users can insert own inbox dismissal log";

ALTER INDEX email_dismissal_log_user_id_idx RENAME TO inbox_dismissal_log_user_id_idx;
ALTER INDEX email_dismissal_log_sender_email_idx RENAME TO inbox_dismissal_log_sender_email_idx;

CREATE INDEX inbox_dismissal_log_slack_idx
  ON inbox_dismissal_log (user_id, source, slack_channel_id, slack_sender_id);
