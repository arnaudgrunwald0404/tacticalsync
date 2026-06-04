-- Google Calendar integration for the Chief of Staff → 1:1s tab.
-- Adds: an email column on team members (for attendee matching), a placeholder
-- table for upcoming 1:1 events synced from Google Calendar, a credentials
-- table for storing the refresh token (RLS-locked, only the public view is
-- readable by clients), and a calendar_sync_rules JSON column on cos_settings.

-- ── 1. cos_team_members.email ───────────────────────────────────────────────
ALTER TABLE cos_team_members ADD COLUMN IF NOT EXISTS email text;
CREATE INDEX IF NOT EXISTS idx_cos_team_members_user_email
  ON cos_team_members(user_id, lower(email));

-- ── 2. cos_one_on_one_events (calendar-sourced placeholders) ────────────────
CREATE TABLE IF NOT EXISTS cos_one_on_one_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  calendar_id text NOT NULL DEFAULT 'primary',
  title text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  attendee_emails text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','tentative','cancelled')),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_cos_one_on_one_events_user_start
  ON cos_one_on_one_events(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_cos_one_on_one_events_member
  ON cos_one_on_one_events(team_member_id);

ALTER TABLE cos_one_on_one_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_one_on_one_events"
  ON cos_one_on_one_events FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cos_one_on_one_events_updated_at
  BEFORE UPDATE ON cos_one_on_one_events
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();

-- ── 3. user_calendar_credentials (server-only token storage) ────────────────
CREATE TABLE IF NOT EXISTS user_calendar_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google' CHECK (provider IN ('google')),
  access_token text,
  refresh_token text NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_calendar_credentials ENABLE ROW LEVEL SECURITY;
-- No policies for `authenticated`: writes/reads of the base table happen via
-- the service role inside edge functions. Clients use the public view below.

CREATE TRIGGER user_calendar_credentials_updated_at
  BEFORE UPDATE ON user_calendar_credentials
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();

-- Token-free view for the client. The view runs with the privileges of its
-- owner (security definer behavior, which is the default for Postgres views),
-- so it bypasses the base table's "no authenticated policy" lockdown. The
-- WHERE clause filters by auth.uid() so each user only sees their own row,
-- and the SELECT list omits token columns entirely.
CREATE OR REPLACE VIEW user_calendar_credentials_public
WITH (security_invoker = false, security_barrier = true) AS
  SELECT
    user_id,
    provider,
    scope,
    expires_at,
    last_sync_at,
    last_sync_status,
    created_at,
    updated_at,
    (refresh_token IS NOT NULL) AS connected
  FROM user_calendar_credentials
  WHERE user_id = auth.uid();

GRANT SELECT ON user_calendar_credentials_public TO authenticated;

-- ── 4. cos_settings.calendar_sync_rules ─────────────────────────────────────
ALTER TABLE cos_settings
  ADD COLUMN IF NOT EXISTS calendar_sync_rules jsonb NOT NULL DEFAULT
    '{"max_other_attendees":1,"include_relationship_types":["direct_report","collaborator"],"include_titles_regex":null,"exclude_titles_regex":null,"match_strategy":"email_then_name"}'::jsonb;
