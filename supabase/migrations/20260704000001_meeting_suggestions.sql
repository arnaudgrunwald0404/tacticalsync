-- Meeting Suggestions
-- Enriches dci_suggested_tasks so the "Suggested from your 1:1s" panel can
-- attribute each suggestion to a person + source meeting and route it to a
-- specific list (column · section) on the user's "My Lists" board.
--
-- Changes:
--   1. dci_suggested_tasks  → member_id, recording_id, suggested_category, rationale
--                             + broadened source_type for meeting kinds
--   2. cos_zoom_transcripts → suggestions_extracted_at (idempotent processing)

-- ---------------------------------------------------------------------------
-- 1. Enrich dci_suggested_tasks
-- ---------------------------------------------------------------------------
ALTER TABLE dci_suggested_tasks
  ADD COLUMN IF NOT EXISTS member_id          uuid REFERENCES cos_team_members(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recording_id       uuid REFERENCES cos_zoom_recordings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_category text,
  ADD COLUMN IF NOT EXISTS rationale          text;

COMMENT ON COLUMN dci_suggested_tasks.member_id IS
  'Team member this suggestion relates to (the other party in a 1:1, or an owner). Drives the person dot + "From 1:1 with X" provenance.';
COMMENT ON COLUMN dci_suggested_tasks.recording_id IS
  'Source Zoom recording this suggestion was extracted from, when applicable.';
COMMENT ON COLUMN dci_suggested_tasks.suggested_category IS
  'Recommended destination cos_priorities.category key (resolved to "column · section" in the UI). User may re-route before adding.';
COMMENT ON COLUMN dci_suggested_tasks.rationale IS
  'Short human-readable reason this surfaced, e.g. "6 days overdue — blocks your Q3 narrative".';

-- Broaden source_type to cover the three meeting kinds shown in the panel.
ALTER TABLE dci_suggested_tasks DROP CONSTRAINT IF EXISTS dci_suggested_tasks_source_type_check;
ALTER TABLE dci_suggested_tasks
  ADD CONSTRAINT dci_suggested_tasks_source_type_check
  CHECK (source_type IN (
    'meeting', 'email', 'slack', 'manual',
    'one_on_one', 'recurring_meeting', 'group_meeting'
  ));

CREATE INDEX IF NOT EXISTS idx_dci_suggested_tasks_member
  ON dci_suggested_tasks(member_id);

-- ---------------------------------------------------------------------------
-- 2. Track which transcripts have already been mined for suggestions
-- ---------------------------------------------------------------------------
ALTER TABLE cos_zoom_transcripts
  ADD COLUMN IF NOT EXISTS suggestions_extracted_at timestamptz;

COMMENT ON COLUMN cos_zoom_transcripts.suggestions_extracted_at IS
  'Set once generate-meeting-suggestions has mined this transcript, so it is not reprocessed.';

CREATE INDEX IF NOT EXISTS idx_cos_zoom_transcripts_pending_suggestions
  ON cos_zoom_transcripts(user_id)
  WHERE suggestions_extracted_at IS NULL;
