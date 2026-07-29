-- Soundbites (PLAN_idea10_meeting_intelligence_enrichment.md, Phase B): persist
-- the aligned audio clip time range for a featured quote, plus a back-reference
-- to the specific Zoom recording it came from.
--
-- `recording_id` is an addition beyond the plan's original B2 sketch (which
-- only called for start_seconds/end_seconds): without it, there's no way to
-- attach a clip to the specific "Past 1:1s" recording card in
-- MeetingDetailPanel.tsx (only the 1:1 hero card in OneOnOnesView.tsx, which
-- only needs team_member_id, doesn't need it). Kept nullable and
-- ON DELETE SET NULL for the same reason as the other two columns: a quote
-- can outlive the recording row it came from (or, for slack/manual-sourced
-- quotes, never have one at all) and must degrade to text-only, not break.
--
-- All three columns are nullable, and older already-extracted quotes are
-- deliberately NOT backfilled — they simply render without a clip, exactly
-- like a quote whose alignment step never resolved a confident timestamp.
ALTER TABLE cos_member_quotes
  ADD COLUMN IF NOT EXISTS recording_id uuid REFERENCES cos_zoom_recordings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_seconds numeric,
  ADD COLUMN IF NOT EXISTS end_seconds numeric;

CREATE INDEX IF NOT EXISTS idx_cos_member_quotes_recording
  ON cos_member_quotes(recording_id) WHERE recording_id IS NOT NULL;
