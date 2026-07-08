-- Idea #4 (PLAN_idea4_agentic_followthrough.md): agentic follow-through for
-- inbox items. agent-tick's existing nudge loop (nudgeActionItems /
-- prestagePreps) operates on cos_meeting_actions / cos_one_on_one_events;
-- this adds the columns/event types needed to extend the same loop to also
-- cover inbox_items, per the plan's recommendation to reuse agent-tick rather
-- than build a parallel background agent.
--
-- Adds:
--   cos_agent_log.item_id       — FK to inbox_items, analogous to action_id
--   new event_type values       — inbox_nudge_sent, inbox_nudge_capped,
--                                  inbox_due_nudge_sent, inbox_due_nudge_capped,
--                                  inbox_agenda_staged, inbox_optin_prompted,
--                                  inbox_optin_declined, inbox_optin_accepted,
--                                  inbox_nudge_explainer_shown
--
-- Preserves the full event_type set from
-- 20260715000000_agent_log_post_meeting_check_event.sql.

ALTER TABLE cos_agent_log
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES inbox_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cos_agent_log_item
  ON cos_agent_log(item_id, created_at DESC)
  WHERE item_id IS NOT NULL;

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
    -- Idea #4: inbox item nudges
    'inbox_nudge_sent', 'inbox_nudge_capped',
    'inbox_due_nudge_sent', 'inbox_due_nudge_capped',
    'inbox_agenda_staged',
    -- Idea #4 onboarding/education (plan Section 5)
    'inbox_optin_prompted', 'inbox_optin_declined', 'inbox_optin_accepted',
    'inbox_nudge_explainer_shown'
  ));
