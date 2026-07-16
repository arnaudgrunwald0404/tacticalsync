-- Adds 'rcdo_stale_nudge_sent' to cos_agent_log's event_type CHECK constraint
-- so rcdo-stale-check/index.ts's audit-trail insert doesn't violate it. Follows
-- the reconciled union from 20260729000001_fix_cos_agent_log_event_type_check_union.sql
-- — extend that same list rather than starting a fresh one, to avoid
-- repeating the drift that migration had to fix.

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
    'rcdo_stale_nudge_sent'
  ));
