-- Allow the agent to record when an action has hit its nudge ceiling and has
-- been "parked" so it stops nagging daily. See nudgeActionItems() in
-- supabase/functions/agent-tick/index.ts (nudge_max_count cap).
--
-- Preserves the full event_type set from 20260705000000_prep_inclusion_tools.sql
-- and adds 'nudge_capped'.

ALTER TABLE cos_agent_log
  DROP CONSTRAINT IF EXISTS cos_agent_log_event_type_check;

ALTER TABLE cos_agent_log
  ADD CONSTRAINT cos_agent_log_event_type_check
  CHECK (event_type IN (
    'nudge_sent', 'nudge_capped', 'prep_staged', 'escalation_flagged',
    'escalation_dismissed', 'format_recommended',
    'tick_completed', 'error',
    'feedback_received', 'health_score_updated',
    'tools_recommended'
  ));
