-- Adds 'daily_digest_sent' to cos_agent_log's event_type CHECK constraint.
--
-- agent-tick/index.ts's sendDailyDigest() has inserted a
-- { event_type: 'daily_digest_sent' } row into cos_agent_log since the digest
-- feature shipped, and separately queries for it (line ~1576) to avoid
-- re-sending the same day's digest. But 'daily_digest_sent' was never added
-- to any version of this constraint, so every one of those inserts has been
-- silently failing (swallowed by the caller's try/catch) — found while
-- adding 'rcdo_stale_nudge_sent' in 20260729000008, see docs/SPECIFICATION.md
-- §13. Extends the same reconciled union from
-- 20260729000001_fix_cos_agent_log_event_type_check_union.sql /
-- 20260729000008_rcdo_stale_nudge_agent_log_event.sql rather than starting a
-- fresh list, to avoid repeating that drift.

ALTER TABLE cos_agent_log
  DROP CONSTRAINT IF EXISTS cos_agent_log_event_type_check;

ALTER TABLE cos_agent_log
  ADD CONSTRAINT cos_agent_log_event_type_check
  CHECK (event_type IN (
    'nudge_sent', 'nudge_capped', 'prep_staged', 'escalation_flagged',
    'escalation_dismissed', 'format_recommended',
    'tick_completed', 'error',
    'feedback_received', 'health_score_updated',
    'tools_recommended', 'post_meeting_check',
    'inbox_brief_staged',
    'inbox_nudge_sent', 'inbox_nudge_capped',
    'inbox_due_nudge_sent', 'inbox_due_nudge_capped',
    'inbox_agenda_staged',
    'inbox_optin_prompted', 'inbox_optin_declined', 'inbox_optin_accepted',
    'inbox_nudge_explainer_shown',
    'rcdo_stale_nudge_sent',
    'daily_digest_sent'
  ));
