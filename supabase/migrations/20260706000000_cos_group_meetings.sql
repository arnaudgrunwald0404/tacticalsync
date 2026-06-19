-- Group ("three-on-one") meetings for the Chief of Staff module.
--
-- Today the CoS module assumes one counterpart per meeting. This migration adds
-- a lightweight, user-curated "group meeting" entity for recurring multi-person
-- meetings centered on a shared subject (a project / initiative / status). It
-- reuses the existing prep pipeline (cos_one_on_one_prep) by making prep
-- polymorphic: a prep row belongs to EITHER a team member (1:1) OR a group
-- meeting, never both.
--
-- Inclusion is manual: the calendar sync discovers recurring multi-person
-- meetings and upserts them as cos_group_meetings rows with included = false;
-- the user toggles which ones to track. The meeting title anchors everything —
-- it seeds the subject and drives discovery of relevant context sources
-- (Slack channels, Zoom recordings, email) stored in cos_group_meeting_sources.

-- ── 1. cos_group_meetings ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cos_group_meetings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recurrence_key text NOT NULL,        -- google recurringEventId, else normalized title
  title          text NOT NULL,        -- calendar title
  subject        text,                 -- editable theme (defaults to title)
  included       boolean NOT NULL DEFAULT false,
  cadence        text,                 -- inferred: weekly / bi-weekly / monthly
  last_seen_at   timestamptz,
  next_start_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recurrence_key)
);

CREATE INDEX IF NOT EXISTS idx_cos_group_meetings_user
  ON cos_group_meetings(user_id, included);

ALTER TABLE cos_group_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_group_meetings"
  ON cos_group_meetings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cos_group_meetings_updated_at
  BEFORE UPDATE ON cos_group_meetings
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();

-- ── 2. cos_group_meeting_participants (roster) ──────────────────────────────
-- We keep the attendee roster (so we can show who's in the room and assign
-- per-attendee actions). We just stop using email addresses as an
-- inclusion/exclusion parameter.

CREATE TABLE IF NOT EXISTS cos_group_meeting_participants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_meeting_id uuid NOT NULL REFERENCES cos_group_meetings(id) ON DELETE CASCADE,
  name             text,
  email            text,
  team_member_id   uuid REFERENCES cos_team_members(id) ON DELETE SET NULL, -- null if untracked
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_meeting_id, email)
);

CREATE INDEX IF NOT EXISTS idx_cos_group_meeting_participants_meeting
  ON cos_group_meeting_participants(group_meeting_id);

ALTER TABLE cos_group_meeting_participants ENABLE ROW LEVEL SECURITY;

-- Scoped through the parent meeting's user_id.
CREATE POLICY "Users can manage own cos_group_meeting_participants"
  ON cos_group_meeting_participants FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cos_group_meetings gm
      WHERE gm.id = cos_group_meeting_participants.group_meeting_id
        AND gm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cos_group_meetings gm
      WHERE gm.id = cos_group_meeting_participants.group_meeting_id
        AND gm.user_id = auth.uid()
    )
  );

-- ── 3. cos_group_meeting_sources (title-driven context) ─────────────────────
-- The title is the anchor: from it we suggest Slack channels / Zoom recordings /
-- email queries, which the user confirms or edits. The brief generator draws
-- from the enabled sources.

CREATE TABLE IF NOT EXISTS cos_group_meeting_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_meeting_id uuid NOT NULL REFERENCES cos_group_meetings(id) ON DELETE CASCADE,
  source_type      text NOT NULL CHECK (source_type IN ('slack_channel', 'zoom', 'email')),
  ref              text NOT NULL,      -- channel id/name, zoom match keyword/topic, email query/sender
  label            text,               -- display label
  origin           text NOT NULL DEFAULT 'suggested' CHECK (origin IN ('suggested', 'user', 'confirmed')),
  enabled          boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_meeting_id, source_type, ref)
);

CREATE INDEX IF NOT EXISTS idx_cos_group_meeting_sources_meeting
  ON cos_group_meeting_sources(group_meeting_id);

ALTER TABLE cos_group_meeting_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_group_meeting_sources"
  ON cos_group_meeting_sources FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cos_group_meetings gm
      WHERE gm.id = cos_group_meeting_sources.group_meeting_id
        AND gm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cos_group_meetings gm
      WHERE gm.id = cos_group_meeting_sources.group_meeting_id
        AND gm.user_id = auth.uid()
    )
  );

-- ── 4. Make cos_one_on_one_prep polymorphic (member XOR group) ──────────────

ALTER TABLE cos_one_on_one_prep ALTER COLUMN team_member_id DROP NOT NULL;

ALTER TABLE cos_one_on_one_prep
  ADD COLUMN IF NOT EXISTS group_meeting_id uuid
  REFERENCES cos_group_meetings(id) ON DELETE CASCADE;

-- Exactly one target must be set.
ALTER TABLE cos_one_on_one_prep
  ADD CONSTRAINT cos_one_on_one_prep_target_chk
  CHECK ((team_member_id IS NOT NULL) <> (group_meeting_id IS NOT NULL));

-- Replace the member-only unique with two partial uniques so existing 1:1 prep
-- rows (team_member_id set, group_meeting_id null) stay valid.
ALTER TABLE cos_one_on_one_prep
  DROP CONSTRAINT IF EXISTS cos_one_on_one_prep_member_date_source_unique;

CREATE UNIQUE INDEX IF NOT EXISTS cos_prep_member_date_source_uniq
  ON cos_one_on_one_prep (user_id, team_member_id, prep_date, source)
  WHERE team_member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cos_prep_group_date_source_uniq
  ON cos_one_on_one_prep (user_id, group_meeting_id, prep_date, source)
  WHERE group_meeting_id IS NOT NULL;

-- ── 5. Action items: keep per-member attribution, add group provenance ──────

ALTER TABLE cos_meeting_actions
  ADD COLUMN IF NOT EXISTS group_meeting_id uuid
  REFERENCES cos_group_meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cos_meeting_actions_group
  ON cos_meeting_actions(group_meeting_id);

-- ── 6. Relationship topics: provenance (so group-derived topics are traceable)

ALTER TABLE cos_relationship_topics
  ADD COLUMN IF NOT EXISTS group_meeting_id uuid
  REFERENCES cos_group_meetings(id) ON DELETE SET NULL;

-- ── 7. Drop the retired sync-rule knobs ─────────────────────────────────────
-- max_other_attendees (numeric head-count cap) and exclude_emails are replaced
-- by the curated cos_group_meetings flow. Update the column default and strip
-- the keys from existing rows so the app no longer reads them.

ALTER TABLE cos_settings
  ALTER COLUMN calendar_sync_rules
  SET DEFAULT '{"include_relationship_types":["direct_report","collaborator"],"include_titles_regex":null,"exclude_titles_regex":null,"match_strategy":"email_then_name"}'::jsonb;

UPDATE cos_settings
SET calendar_sync_rules = (calendar_sync_rules - 'max_other_attendees' - 'exclude_emails')
WHERE calendar_sync_rules ? 'max_other_attendees'
   OR calendar_sync_rules ? 'exclude_emails';
