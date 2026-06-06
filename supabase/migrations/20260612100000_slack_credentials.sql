-- Slack OAuth integration for the Chief of Staff → 1:1 prep & share.
-- Adds: credentials table (server-only, RLS-locked) + public view.
-- Slack bot tokens don't expire, so no refresh flow needed — but we store
-- the token the same way as Zoom/Google for consistency.

CREATE TABLE IF NOT EXISTS user_slack_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'slack' CHECK (provider = 'slack'),
  access_token text NOT NULL,
  scope text NOT NULL,
  slack_team_id text,
  slack_team_name text,
  slack_user_id text,
  slack_email text,
  last_sync_at timestamptz,
  last_sync_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_slack_credentials ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER user_slack_credentials_updated_at
  BEFORE UPDATE ON user_slack_credentials
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();

-- Token-free view for the client.
CREATE OR REPLACE VIEW user_slack_credentials_public
WITH (security_invoker = false, security_barrier = true) AS
  SELECT
    user_id,
    provider,
    scope,
    slack_team_name,
    slack_email,
    last_sync_at,
    last_sync_status,
    created_at,
    updated_at,
    (access_token IS NOT NULL) AS connected
  FROM user_slack_credentials
  WHERE user_id = auth.uid();

GRANT SELECT ON user_slack_credentials_public TO authenticated;
