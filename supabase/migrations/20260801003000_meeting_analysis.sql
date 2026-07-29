-- Meeting Intelligence Enrichment, Phase A: sentiment & talk-time
-- (PLAN_idea10_meeting_intelligence_enrichment.md §4, A1).
--
-- One row per cos_zoom_recordings.id, computed from the already-ingested
-- cos_zoom_transcripts.content (VTT) by extract-zoom-quotes — no new
-- ingestion, this is a read-only analysis pass over existing data.
--
-- talk_time_seconds is deliberately keyed by RAW SPEAKER NAME STRING (as it
-- appears in the transcript's <v Name> tag), not team_member_id: the fuzzy
-- name-matching heuristic extract-zoom-quotes already uses for speaker
-- attribution is a best-effort heuristic, not a verified identity link, and
-- storing raw names avoids overclaiming precision the matcher can't back up.
-- The hook/UI layer resolves display names against cos_team_members (and the
-- viewing user's own profile) at read time — see src/hooks/useMeetingAnalysis.ts.
--
-- Privacy framing note (plan §5, §7 risk 3): sentiment/talk-time here overlaps
-- the still-unresolved Relationship Memory consent gap (docs/SPECIFICATION.md
-- §7.9 / §13 item 9 — only the manager consents, the direct report has no
-- visibility/opt-out). Per the plan's recommendation this feature is not
-- blocked on that unresolved gap, but the UI built on top of this table must
-- stay self-reflective / manager-facing-about-their-own-conversation-quality,
-- never framed as a verdict on the other person — see useManagerSignals.ts's
-- framing comment for the house style this mirrors.

CREATE TABLE IF NOT EXISTS cos_meeting_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES cos_zoom_recordings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- { "Jane Smith": 340, "John Doe": 210, "unattributed": 45 } — seconds spoken
  -- per raw speaker-name string (talkTime.ts UNATTRIBUTED_SPEAKER_KEY for
  -- cues Zoom couldn't attribute to anyone).
  talk_time_seconds jsonb NOT NULL DEFAULT '{}',
  -- Meeting duration as implied by the transcript itself (latest cue
  -- end-time) — the ratio denominator, computed once here so the UI doesn't
  -- need to re-derive it from talk_time_seconds.
  meeting_duration_seconds numeric,
  overall_sentiment text
    CHECK (overall_sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  -- 1-sentence LLM justification, for transparency/trust — same reasoning as
  -- why cos_relationship_topics keeps a context_snippet alongside sentiment.
  sentiment_rationale text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recording_id)
);

CREATE INDEX IF NOT EXISTS idx_cos_meeting_analysis_user
  ON cos_meeting_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_cos_meeting_analysis_recording
  ON cos_meeting_analysis(recording_id);

ALTER TABLE cos_meeting_analysis ENABLE ROW LEVEL SECURITY;

-- Owner-only RLS, identical shape to every other cos_* table (e.g.
-- cos_zoom_transcripts, cos_relationship_topics) — no new RLS pattern needed.
CREATE POLICY "Users can manage own cos_meeting_analysis"
  ON cos_meeting_analysis FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
