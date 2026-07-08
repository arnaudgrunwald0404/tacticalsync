-- Idea #7 (Relationship memory): settings needed for the pre-1:1 brief job
-- and the first-run consent/expectations moment (see PLAN_idea7_relationship_memory.md §5c, §7a.4).
--
-- No new tables — this extends cos_settings, matching the existing pattern
-- used for agent_config (20260620000000_relationship_memory_agent_foundation.sql).

-- ── 1. pre_stage_inbox_brief flag on agent_config ──────────────────────────────
-- Off by default: per the plan, this should only be turned on once the
-- Unified Funnel (idea #1) ingestion is confirmed live for a workspace,
-- since a brief built on incomplete data can actively damage trust.
ALTER TABLE cos_settings
  ALTER COLUMN agent_config SET DEFAULT '{
    "enabled": false,
    "nudge_actions": true,
    "pre_stage_prep": true,
    "escalate_patterns": false,
    "recommend_format": false,
    "post_meeting_check": true,
    "pre_stage_inbox_brief": false,
    "nudge_timing_hours": 24,
    "nudge_max_count": 5,
    "quiet_hours_start": 18,
    "quiet_hours_end": 9,
    "timezone": "America/New_York",
    "slack_notifications": true
  }'::jsonb;

-- Backfill existing rows so `pre_stage_inbox_brief` is present (and false)
-- rather than absent, which would otherwise read the same as false in the
-- edge function but is worth making explicit for querying/auditing.
UPDATE cos_settings
SET agent_config = agent_config || '{"pre_stage_inbox_brief": false}'::jsonb
WHERE NOT (agent_config ? 'pre_stage_inbox_brief');

-- ── 2. First-run consent/expectations moment tracking ──────────────────────────
-- One-time modal shown before a user's first person-page view or first
-- received pre-1:1 brief, whichever comes first (§7a.4). NULL = not yet shown.
ALTER TABLE cos_settings
  ADD COLUMN IF NOT EXISTS person_memory_consent_seen_at timestamptz;

COMMENT ON COLUMN cos_settings.person_memory_consent_seen_at IS
  'Timestamp the user acknowledged the person-page/pre-1:1-brief consent modal. NULL means not yet shown.';
