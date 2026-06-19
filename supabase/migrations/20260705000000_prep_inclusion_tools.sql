-- Phase 2 of the prep redesign: transparent inclusion model + global toolset.
--
-- 1. included_group_series — recurring group meetings (>2 attendees) the user has
--    opted into for prep. Replaces the opaque (and never-enforced)
--    max_others_after_exclude threshold. 1:1s are auto-included; group meetings
--    qualify only if their Google recurring_event_id is listed here.
-- 2. prep_tools — the global default toolset applied to every prep (which data
--    sources to gather). Generalizes the sync_zoom_before / sync_slack_before /
--    enrich_stackone booleans, which are retained (deprecated) for back-compat.
-- 3. cos_agent_log gains the 'tools_recommended' event type for the new
--    per-1:1 tool-recommendation agent.

ALTER TABLE cos_prep_schedule
  ADD COLUMN IF NOT EXISTS included_group_series text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS prep_tools            text[] NOT NULL DEFAULT ARRAY['zoom','slack']::text[];

-- Backfill prep_tools from the existing per-feature booleans so behavior is preserved.
UPDATE cos_prep_schedule SET prep_tools = (
  (CASE WHEN sync_zoom_before  THEN ARRAY['zoom']     ELSE ARRAY[]::text[] END)
  || (CASE WHEN sync_slack_before THEN ARRAY['slack']    ELSE ARRAY[]::text[] END)
  || (CASE WHEN enrich_stackone   THEN ARRAY['stackone'] ELSE ARRAY[]::text[] END)
);

COMMENT ON COLUMN cos_prep_schedule.included_group_series IS
  'Google recurring_event_ids of >2-attendee meetings the user opted into for prep. 1:1s are auto-included.';
COMMENT ON COLUMN cos_prep_schedule.prep_tools IS
  'Global default data-source toolset for prep (e.g. {zoom,slack,stackone}). Per-1:1 overrides live in cos_team_members.agent_overrides.prep_tools.';
COMMENT ON COLUMN cos_prep_schedule.max_others_after_exclude IS
  'DEPRECATED: superseded by included_group_series. No longer read by the batch.';

-- Add the 'tools_recommended' agent-log event type.
ALTER TABLE cos_agent_log DROP CONSTRAINT IF EXISTS cos_agent_log_event_type_check;
ALTER TABLE cos_agent_log ADD CONSTRAINT cos_agent_log_event_type_check
  CHECK (event_type IN (
    'nudge_sent', 'prep_staged', 'escalation_flagged',
    'escalation_dismissed', 'format_recommended',
    'tick_completed', 'error',
    'feedback_received', 'health_score_updated',
    'tools_recommended'
  ));
