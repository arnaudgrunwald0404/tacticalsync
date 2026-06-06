-- Slack message excerpts synced for 1:1 prep context.
-- Stores recent DMs and channel mentions linked to team members.

CREATE TABLE IF NOT EXISTS cos_slack_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES cos_team_members(id) ON DELETE SET NULL,
  channel_id text NOT NULL,
  channel_name text,
  message_ts text NOT NULL,
  sender_slack_id text,
  sender_name text,
  content text NOT NULL,
  is_dm boolean NOT NULL DEFAULT false,
  thread_ts text,
  message_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id, message_ts)
);

CREATE INDEX IF NOT EXISTS idx_cos_slack_messages_user_date
  ON cos_slack_messages(user_id, message_date DESC);
CREATE INDEX IF NOT EXISTS idx_cos_slack_messages_member
  ON cos_slack_messages(team_member_id);

ALTER TABLE cos_slack_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_slack_messages"
  ON cos_slack_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
