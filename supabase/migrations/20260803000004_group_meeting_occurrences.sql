-- Lets group-meeting occurrences be stored the same way 1:1 occurrences are.
--
-- cos_group_meetings only ever stored one summary row per logical recurring
-- meeting (title, cadence, next_start_at) — never a per-occurrence row with a
-- real start/end time. That's why group meetings could never render on the
-- Calendar tab's weekly grid (CalendarWeekView.tsx / OneOnOnesView.tsx), even
-- though that grid was already built to handle attendee_count > 1 rows (it
-- just never received any, since google-calendar-sync diverts 2+-attendee
-- events away from cos_one_on_one_events entirely).
--
-- Mirrors the polymorphic pattern cos_one_on_one_prep already uses (see
-- 20260706000000_cos_group_meetings.sql §4): team_member_id and
-- group_meeting_id are both nullable, but never set together. Unlike prep
-- rows, a cos_one_on_one_events row is allowed to have BOTH null (an
-- unmatched 1:1 whose attendee isn't a tracked team member yet), so this is a
-- "not both" check rather than a strict XOR.
ALTER TABLE cos_one_on_one_events
  ADD COLUMN IF NOT EXISTS group_meeting_id uuid REFERENCES cos_group_meetings(id) ON DELETE CASCADE;

ALTER TABLE cos_one_on_one_events
  ADD CONSTRAINT cos_one_on_one_events_not_both_member_and_group
  CHECK (NOT (team_member_id IS NOT NULL AND group_meeting_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_cos_one_on_one_events_group_meeting
  ON cos_one_on_one_events(group_meeting_id) WHERE group_meeting_id IS NOT NULL;

COMMENT ON COLUMN cos_one_on_one_events.group_meeting_id IS
  'Set instead of team_member_id for a group-meeting occurrence row (one row per calendar instance, same as 1:1s). References the curated cos_group_meetings summary row for this series.';
