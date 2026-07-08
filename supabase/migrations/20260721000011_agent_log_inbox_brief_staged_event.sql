-- Idea #7 (Relationship memory): allow the agent to log pre-1:1 inbox brief
-- staging events, mirroring how 'prep_staged' is logged for cos_one_on_one_prep
-- (see 20260715000000_agent_log_post_meeting_check_event.sql for the same
-- drop/recreate pattern used to extend this CHECK constraint safely).
--
-- Preserves the full event_type set from
-- 20260715000000_agent_log_post_meeting_check_event.sql and adds
-- 'inbox_brief_staged'.

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
    'inbox_brief_staged'
  ));
