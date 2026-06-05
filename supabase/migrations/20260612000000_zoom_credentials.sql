-- Zoom OAuth integration for the Chief of Staff → 1:1 prep.
-- Adds: a credentials table for storing Zoom refresh tokens (RLS-locked,
-- only the public view is readable by clients).

-- ── 1. user_zoom_credentials (server-only token storage) ───────────────────
CREATE TABLE IF NOT EXISTS user_zoom_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'zoom' CHECK (provider = 'zoom'),
  access_token text,
  refresh_token text NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz,
  zoom_user_id text,
  zoom_email text,
  last_sync_at timestamptz,
  last_sync_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_zoom_credentials ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER user_zoom_credentials_updated_at
  BEFORE UPDATE ON user_zoom_credentials
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();

-- Token-free view for the client.
CREATE OR REPLACE VIEW user_zoom_credentials_public
WITH (security_invoker = false, security_barrier = true) AS
  SELECT
    user_id,
    provider,
    scope,
    zoom_email,
    expires_at,
    last_sync_at,
    last_sync_status,
    created_at,
    updated_at,
    (refresh_token IS NOT NULL) AS connected
  FROM user_zoom_credentials
  WHERE user_id = auth.uid();

GRANT SELECT ON user_zoom_credentials_public TO authenticated;
