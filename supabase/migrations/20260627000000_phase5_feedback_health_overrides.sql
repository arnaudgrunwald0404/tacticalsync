-- Phase 5: Feedback collection, health score, per-person agent overrides
--
-- New tables:
--   cos_agent_feedback         — user feedback on agent actions
--
-- Altered tables:
--   cos_team_members           — add relationship_health_score, agent_overrides
--   cos_agent_log              — add event_type 'feedback_received'

-- ── 1. cos_agent_feedback ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cos_agent_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_id uuid NOT NULL REFERENCES cos_agent_log(id) ON DELETE CASCADE,
  feedback_type text NOT NULL
    CHECK (feedback_type IN (
      'helpful', 'not_helpful', 'too_early', 'too_late', 'wrong_format'
    )),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cos_agent_feedback_user
  ON cos_agent_feedback(user_id, feedback_type);

CREATE INDEX idx_cos_agent_feedback_log
  ON cos_agent_feedback(log_id);

ALTER TABLE cos_agent_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own agent feedback"
  ON cos_agent_feedback FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. cos_team_members: health score + agent overrides ────────────────────────

ALTER TABLE cos_team_members
  ADD COLUMN IF NOT EXISTS relationship_health_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS health_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cos_team_members.relationship_health_score
  IS '0-10 score computed during prep generation based on cadence, resolution rate, sentiment';

COMMENT ON COLUMN cos_team_members.agent_overrides
  IS 'Per-person agent config overrides: { auto_prep: bool, nudge_actions: bool, preferred_format: string }';

-- ── 3. Expand cos_agent_log event types ────────────────────────────────────────
-- Drop and recreate the CHECK constraint to add new event types.

ALTER TABLE cos_agent_log DROP CONSTRAINT IF EXISTS cos_agent_log_event_type_check;

ALTER TABLE cos_agent_log ADD CONSTRAINT cos_agent_log_event_type_check
  CHECK (event_type IN (
    'nudge_sent', 'prep_staged', 'escalation_flagged',
    'escalation_dismissed', 'format_recommended',
    'tick_completed', 'error',
    'feedback_received', 'health_score_updated'
  ));
