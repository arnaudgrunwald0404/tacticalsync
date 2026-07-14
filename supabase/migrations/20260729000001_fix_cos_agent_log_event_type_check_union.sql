-- 20260725000000_agent_log_inbox_nudges.sql copy-pasted its CHECK IN list from
-- 20260715000000_agent_log_post_meeting_check_event.sql without knowing that
-- 20260721000011_agent_log_inbox_brief_staged_event.sql had, in the meantime,
-- separately added 'inbox_brief_staged' to the same constraint. Applying the
-- migrations in file order therefore silently dropped 'inbox_brief_staged'
-- again the moment 20260725000000 ran. Reconcile cos_agent_log_event_type_check
-- to the union of every event_type ever added across all three migrations.
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
    'inbox_nudge_explainer_shown'
  ));
