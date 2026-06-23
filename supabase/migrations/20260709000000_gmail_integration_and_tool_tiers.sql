-- Gmail integration + configurable tool tiers for 1:1 prep.
--
-- 1. cos_gmail_messages — caches email threads between the user and a team member,
--    mirroring the structure of cos_slack_messages.
-- 2. cos_prep_schedule.tool_tiers — per-user JSONB map of tool → tier (1/2/3).
--    Tier 1 = primary signal (on par with Slack/Zoom), Tier 2 = team work context,
--    Tier 3 = background only. Overrides the default tier baked into each tool def.

-- ── 1. Gmail messages cache ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cos_gmail_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id   uuid        REFERENCES cos_team_members(id) ON DELETE SET NULL,
  gmail_message_id text        NOT NULL,
  thread_id        text,
  subject          text,
  snippet          text,
  sender_email     text,
  sender_name      text,
  is_from_member   boolean     NOT NULL DEFAULT false,
  message_date     timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_cos_gmail_messages_user_member
  ON cos_gmail_messages(user_id, team_member_id, message_date DESC);

ALTER TABLE cos_gmail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own gmail messages"
  ON cos_gmail_messages FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. tool_tiers override column on cos_prep_schedule ──────────────────────
ALTER TABLE cos_prep_schedule
  ADD COLUMN IF NOT EXISTS tool_tiers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cos_prep_schedule.tool_tiers IS
  'Per-user tier overrides for prep tools. Keys are tool IDs (e.g. "gmail", "stackone"), '
  'values are tier numbers 1–3. Tier 1 = primary signal (direct comms), '
  'Tier 2 = team/workflow context, Tier 3 = background only. '
  'Omitted keys fall back to each tool''s defaultTier. Example: {"salesforce":"1","stackone":"2"}';

-- ── 3. Add gmail to the valid prep_tools toolset ─────────────────────────────
-- The prep_tools column uses a text[] with no DB-level constraint on valid values,
-- so no ALTER is needed — the application validates against PREP_TOOL_IDS.
-- This comment documents that 'gmail' is now a valid member of that array.
COMMENT ON COLUMN cos_prep_schedule.prep_tools IS
  'Global default toolset for prep. Valid values: zoom, slack, gmail, stackone. '
  'Per-member overrides live in cos_team_members.agent_overrides.prep_tools.';
