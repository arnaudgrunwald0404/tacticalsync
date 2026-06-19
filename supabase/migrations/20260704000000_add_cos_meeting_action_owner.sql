-- Make 1:1 commitments two-directional.
--
-- cos_meeting_actions previously modeled only actions assigned to the team
-- member (member_id). The 1:1 Prep "Open commitments" section is meant to track
-- what BOTH parties committed to, so add an `owner` discriminator:
--   'them' — the team member owns the action (existing behavior)
--   'me'   — the current user owns the action ("Add for me")
--
-- Backward-compatible: existing rows default to 'them', which is what they were.

ALTER TABLE cos_meeting_actions
  ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'them'
    CHECK (owner IN ('them', 'me'));

-- Surface both lanes per member efficiently when building a prep.
CREATE INDEX IF NOT EXISTS idx_cos_meeting_actions_member_owner
  ON cos_meeting_actions(member_id, owner)
  WHERE status = 'pending';
