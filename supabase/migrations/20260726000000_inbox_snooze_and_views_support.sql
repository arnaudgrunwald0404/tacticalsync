-- Inbox: snooze support (Idea #2, plan: PLAN_idea2_dormant20.md)
--
-- 1. Partial index on snoozed_until so the un-snooze sweep's
--    "status='snoozed' AND snoozed_until <= now()" query stays cheap at scale.
-- 2. snooze_until_member_id — lets a snooze be bound to "my next 1:1 with X"
--    instead of (or in addition to) a fixed timestamp, so the un-snooze sweep
--    can re-resolve the meeting time rather than trusting a stale cached date.

CREATE INDEX IF NOT EXISTS inbox_items_snoozed_until
  ON inbox_items (snoozed_until)
  WHERE status = 'snoozed';

ALTER TABLE inbox_items
  ADD COLUMN IF NOT EXISTS snooze_until_member_id uuid
    REFERENCES cos_team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inbox_items_snooze_member
  ON inbox_items (snooze_until_member_id)
  WHERE snooze_until_member_id IS NOT NULL;
