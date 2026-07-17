-- Add user_access_token to user_slack_credentials so slack-messages-sync
-- can use the user's own token (xoxp-) for reading personal DMs and channels,
-- rather than the bot token (xoxb-) which can only access DMs the bot is in.
ALTER TABLE user_slack_credentials
  ADD COLUMN IF NOT EXISTS user_access_token text,
  ADD COLUMN IF NOT EXISTS user_scope text;
