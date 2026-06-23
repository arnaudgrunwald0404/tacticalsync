-- Group-meeting prep: action assignment + generation logging.
--
-- Phase 2 of the group-meeting feature (foundation in 20260706000000). Two
-- changes are needed so group briefs can capture action items and be logged:
--
-- 1. Group actions don't always target a tracked member. A "to-do for me"
--    captured in a group brief has no assignee (member_id null), while a
--    per-attendee action assigned to a tracked participant sets both member_id
--    and group_meeting_id. Relax the NOT NULL and require at least one target.
--
-- 2. prep_generation_log assumes a 1:1 (team_member_id NOT NULL). Group brief
--    generation logs against a group_meeting_id instead.

-- ── 1. cos_meeting_actions: allow group-scoped actions without a member ──────

ALTER TABLE cos_meeting_actions ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE cos_meeting_actions
  ADD CONSTRAINT cos_meeting_actions_target_chk
  CHECK (member_id IS NOT NULL OR group_meeting_id IS NOT NULL);

-- ── 2. prep_generation_log: allow logging against a group meeting ────────────

ALTER TABLE prep_generation_log ALTER COLUMN team_member_id DROP NOT NULL;

ALTER TABLE prep_generation_log
  ADD COLUMN IF NOT EXISTS group_meeting_id uuid
  REFERENCES cos_group_meetings(id) ON DELETE SET NULL;
