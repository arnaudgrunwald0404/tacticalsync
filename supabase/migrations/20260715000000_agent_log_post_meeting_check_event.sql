-- Allow the agent to record post-meeting transcript checks. postMeetingCheck()
-- in supabase/functions/agent-tick/index.ts logs a 'post_meeting_check' event
-- on every tick that syncs Zoom recordings and extracts action items, but the
-- event_type CHECK constraint never included it — so those inserts failed
-- silently (the log is fire-and-forget) and post-meeting activity was invisible
-- in cos_agent_log. This adds the value; the pipeline itself already worked.
--
-- Preserves the full event_type set from
-- 20260706000100_agent_log_nudge_capped_event.sql and adds 'post_meeting_check'.

ALTER TABLE cos_agent_log
  DROP CONSTRAINT IF EXISTS cos_agent_log_event_type_check;

ALTER TABLE cos_agent_log
  ADD CONSTRAINT cos_agent_log_event_type_check
  CHECK (event_type IN (
    'nudge_sent', 'nudge_capped', 'prep_staged', 'escalation_flagged',
    'escalation_dismissed', 'format_recommended',
    'tick_completed', 'error',
    'feedback_received', 'health_score_updated',
    'tools_recommended', 'post_meeting_check'
  ));
