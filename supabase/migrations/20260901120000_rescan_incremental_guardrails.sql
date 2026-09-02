-- Re-scan button: incremental scanning + cost guardrails
--
-- The suggestions-panel refresh button previously re-ran the full Slack/Gmail
-- suggestion pipelines over a fixed 7-day window on every click. Two changes
-- make manual re-scans incremental and idempotent:
--
-- 1. cos_action_item_scan_state grows two new source values,
--    'slack_suggestions' and 'gmail_suggestions', used by slack-inbox-sync and
--    gmail-inbox-sync as per-user scan cursors. Each sync only fetches content
--    newer than its cursor (with a 24h overlap for retry safety) and enforces a
--    cooldown so rapid re-clicks skip the LLM extraction entirely.
--
-- 2. dci_suggested_tasks.status gains 'resolved': set automatically when the
--    underlying source was handled outside the app (user replied in the Gmail
--    thread / Slack channel after the flagged message). Distinct from
--    'dismissed' on purpose — the stamp_suggestion_outcome trigger only fires
--    for pending → accepted/dismissed, so auto-resolved rows never enter the
--    accepted/dismissed few-shot learning history the sync prompts build.

ALTER TABLE cos_action_item_scan_state
  DROP CONSTRAINT IF EXISTS cos_action_item_scan_state_source_check;
ALTER TABLE cos_action_item_scan_state
  ADD CONSTRAINT cos_action_item_scan_state_source_check
  CHECK (source IN ('slack', 'gmail', 'slack_suggestions', 'gmail_suggestions'));

ALTER TABLE dci_suggested_tasks
  DROP CONSTRAINT IF EXISTS dci_suggested_tasks_status_check;
ALTER TABLE dci_suggested_tasks
  ADD CONSTRAINT dci_suggested_tasks_status_check
  CHECK (status IN ('pending', 'accepted', 'dismissed', 'resolved'));

COMMENT ON COLUMN dci_suggested_tasks.status IS
  'pending → shown in suggestion panels; accepted/dismissed → user action (stamps outcome_at, feeds prompt learning); resolved → auto-closed because the source thread was answered outside the app (no outcome_at, excluded from learning).';
