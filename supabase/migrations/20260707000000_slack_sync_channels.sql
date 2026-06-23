-- Add sync_channels to user_slack_credentials so extra channels to pull
-- (e.g. '#success' for recognitions) can be persisted and picked up by
-- both the manual "Sync now" button and any automated sync jobs.

ALTER TABLE user_slack_credentials
  ADD COLUMN IF NOT EXISTS sync_channels text[] NOT NULL DEFAULT '{}';

-- Expose the column in the existing public view (recreate it).
-- DROP + recreate so we can add sync_channels without a column-order conflict
-- (CREATE OR REPLACE VIEW only allows appending columns, not inserting mid-list).
DROP VIEW IF EXISTS user_slack_credentials_public;

CREATE VIEW user_slack_credentials_public
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
    (access_token IS NOT NULL) AS connected,
    sync_channels
  FROM user_slack_credentials
  WHERE user_id = auth.uid();

GRANT SELECT ON user_slack_credentials_public TO authenticated;

-- Allow users to update only the sync_channels field on their own row.
-- (Other columns are written exclusively by server-side edge functions.)
CREATE POLICY "Users can update own slack sync_channels"
  ON user_slack_credentials
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
