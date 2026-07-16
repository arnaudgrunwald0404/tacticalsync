-- agent-tick/index.ts's sendDailyDigest() logs event_type = 'daily_digest_sent'
-- as its once-daily gate marker, but no migration ever added that value to
-- cos_agent_log_event_type_check — the exact same class of bug
-- 20260729000001_fix_cos_agent_log_event_type_check_union.sql fixed for
-- 'inbox_brief_staged'. The insert() call isn't error-checked in the edge
-- function, so the CHECK violation was silently swallowed: the gate row never
-- landed, and the digest re-sent on every single agent-tick run (every 30
-- minutes) instead of once a day.
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
    'daily_digest_sent'
  ));
