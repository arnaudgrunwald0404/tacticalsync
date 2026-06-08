-- Relationship Memory + Agentic Follow-Through: Phase 1 Foundation
--
-- New tables:
--   cos_relationship_topics     — extracted topics per person per prep
--   cos_prep_topic_mentions     — join table linking preps to topics
--   cos_agent_log               — audit trail for all agent actions
--
-- Altered tables:
--   cos_meeting_actions         — add due_date, completed_at, tracking columns
--   cos_settings                — add agent_config JSONB
--
-- Extensions:
--   pg_cron                     — scheduled agent execution
--   pg_net                      — HTTP calls from pg_cron to edge functions

-- ── 0. Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 1. cos_relationship_topics ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cos_relationship_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  prep_id uuid REFERENCES cos_one_on_one_prep(id) ON DELETE SET NULL,
  topic text NOT NULL,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN (
      'blocker', 'escalation', 'project', 'goal',
      'feedback', 'development', 'personal', 'general'
    )),
  sentiment text NOT NULL DEFAULT 'neutral'
    CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  first_mentioned_at date NOT NULL DEFAULT CURRENT_DATE,
  last_mentioned_at date NOT NULL DEFAULT CURRENT_DATE,
  mention_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'stale', 'recurring')),
  resolved_at timestamptz,
  context_snippet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cos_rel_topics_member
  ON cos_relationship_topics(user_id, team_member_id);

CREATE INDEX idx_cos_rel_topics_status
  ON cos_relationship_topics(user_id, team_member_id, status);

CREATE INDEX idx_cos_rel_topics_last_mentioned
  ON cos_relationship_topics(last_mentioned_at DESC);

-- Full-text search for the query interface
CREATE INDEX idx_cos_rel_topics_fts
  ON cos_relationship_topics
  USING gin(to_tsvector('english', topic || ' ' || coalesce(context_snippet, '')));

ALTER TABLE cos_relationship_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_relationship_topics"
  ON cos_relationship_topics FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cos_relationship_topics_updated_at
  BEFORE UPDATE ON cos_relationship_topics
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();

-- ── 2. cos_prep_topic_mentions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cos_prep_topic_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_id uuid NOT NULL REFERENCES cos_one_on_one_prep(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES cos_relationship_topics(id) ON DELETE CASCADE,
  snippet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prep_id, topic_id)
);

CREATE INDEX idx_cos_prep_topic_mentions_topic
  ON cos_prep_topic_mentions(topic_id);

CREATE INDEX idx_cos_prep_topic_mentions_prep
  ON cos_prep_topic_mentions(prep_id);

ALTER TABLE cos_prep_topic_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prep_topic_mentions"
  ON cos_prep_topic_mentions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cos_one_on_one_prep p
      WHERE p.id = prep_id AND p.user_id = auth.uid()
    )
  );

-- ── 3. cos_meeting_actions: add due_date + tracking columns ────────────────────

ALTER TABLE cos_meeting_actions
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_surfaced_at date,
  ADD COLUMN IF NOT EXISTS surface_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cos_meeting_actions_due
  ON cos_meeting_actions(user_id, due_date)
  WHERE status = 'pending';

-- Auto-set completed_at when status toggles to/from 'done'
CREATE OR REPLACE FUNCTION cos_meeting_actions_set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at = now();
  END IF;
  IF NEW.status != 'done' AND OLD.status = 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cos_meeting_actions_completed_at
  BEFORE UPDATE ON cos_meeting_actions
  FOR EACH ROW EXECUTE FUNCTION cos_meeting_actions_set_completed_at();

-- ── 4. cos_agent_log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cos_agent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'nudge_sent', 'prep_staged', 'escalation_flagged',
      'escalation_dismissed', 'format_recommended',
      'tick_completed', 'error'
    )),
  member_id uuid REFERENCES cos_team_members(id) ON DELETE SET NULL,
  event_id uuid REFERENCES cos_one_on_one_events(id) ON DELETE SET NULL,
  action_id uuid REFERENCES cos_meeting_actions(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cos_agent_log_user_type
  ON cos_agent_log(user_id, event_type, created_at DESC);

CREATE INDEX idx_cos_agent_log_action
  ON cos_agent_log(action_id, created_at DESC)
  WHERE action_id IS NOT NULL;

ALTER TABLE cos_agent_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own agent logs (for the activity feed UI)
CREATE POLICY "Users can view own agent logs"
  ON cos_agent_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role writes (no INSERT policy for authenticated needed)

-- ── 5. cos_settings.agent_config ───────────────────────────────────────────────

ALTER TABLE cos_settings
  ADD COLUMN IF NOT EXISTS agent_config jsonb NOT NULL DEFAULT '{
    "enabled": false,
    "nudge_actions": true,
    "pre_stage_prep": true,
    "escalate_patterns": false,
    "recommend_format": false,
    "nudge_timing_hours": 24,
    "quiet_hours_start": 18,
    "quiet_hours_end": 9,
    "timezone": "America/New_York",
    "slack_notifications": true
  }'::jsonb;

-- ── 6. Forgotten commitments view ──────────────────────────────────────────────
-- Computed at query time — no materialized view needed for this data volume.

CREATE OR REPLACE VIEW cos_forgotten_commitments AS
SELECT
  a.id,
  a.user_id,
  a.member_id,
  a.text,
  a.due_date,
  a.created_at,
  a.surface_count,
  EXTRACT(DAY FROM (now() - a.created_at))::integer AS days_pending,
  CASE
    WHEN a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE - interval '7 days' THEN 'critical'
    WHEN EXTRACT(DAY FROM (now() - a.created_at)) > 30 THEN 'critical'
    WHEN a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE THEN 'warning'
    WHEN EXTRACT(DAY FROM (now() - a.created_at)) > 14 THEN 'warning'
    ELSE 'normal'
  END AS urgency
FROM cos_meeting_actions a
WHERE a.status = 'pending'
  AND (
    -- Has a due date that's overdue
    (a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE)
    -- Or has been pending for more than 7 days
    OR a.created_at < now() - interval '7 days'
  );
