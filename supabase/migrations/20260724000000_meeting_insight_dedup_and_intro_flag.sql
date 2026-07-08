-- Meeting insights (PLAN_idea3_meeting_insights.md): dedup index for the
-- extract-zoom-quotes -> inbox_items(type='meeting_insight') write path, plus
-- a one-time "seen the intro banner" flag folded into cos_settings'
-- existing onboarding_completed jsonb blob (see 20260622000100_onboarding_state.sql).

-- §5/§6.1: expression index so the existence check extract-zoom-quotes runs
-- before every meeting_insight insert (keyed on transcript_id + speaker_name,
-- scoped to type='meeting_insight') doesn't force a full-table scan. This is a
-- lookup-friendly index, not a uniqueness constraint — the exact-match dedup
-- (transcript_id, speaker_name, and the verbatim quote embedded in `text`) is
-- still enforced in application code (see meetingInsightDedupKey in
-- src/lib/meetingInsights.ts), since a unique index can't easily express the
-- "match on text CONTAINS quote" semantics used there.
CREATE INDEX IF NOT EXISTS idx_inbox_items_meeting_insight_source
  ON inbox_items (
    user_id,
    ((source_ref ->> 'transcript_id')),
    ((source_ref ->> 'speaker_name'))
  )
  WHERE type = 'meeting_insight';

-- §9.1: one-time "has this user seen the meeting-insights intro banner" flag.
-- Reuses the onboarding_completed jsonb blob already on cos_settings rather
-- than adding a new top-level column, mirroring how that column already
-- tracks other one-time UI intros (welcome / lists / oneOnOnes).
ALTER TABLE cos_settings
  ALTER COLUMN onboarding_completed
    SET DEFAULT '{"welcome": false, "lists": false, "oneOnOnes": false, "meetingInsightsIntro": false}'::jsonb;

UPDATE cos_settings
SET onboarding_completed = onboarding_completed || '{"meetingInsightsIntro": false}'::jsonb
WHERE NOT (onboarding_completed ? 'meetingInsightsIntro');
