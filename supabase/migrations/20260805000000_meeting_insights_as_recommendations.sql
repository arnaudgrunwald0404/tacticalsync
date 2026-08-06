-- Meeting insights (standout quotes from Zoom recordings) now surface as
-- dci_suggested_tasks recommendations (source_type: 'meeting') — the same
-- surface email and Slack action items use (InboxSuggestionsPanel /
-- useMeetingSuggestions) — instead of landing directly in inbox_items with
-- their own Confirm/Save/Dismiss triage UI. See extract-zoom-quotes/index.ts
-- and src/lib/meetingInsights.ts for the new insert path.
--
-- This migrates existing open meeting_insight rows into dci_suggested_tasks
-- so they reappear as recommendations the same way a freshly-extracted quote
-- would, then archives the originals so they drop out of the main inbox list.

INSERT INTO dci_suggested_tasks (
  user_id, date, title, source, source_type, status,
  rationale, raw_context, recording_id
)
SELECT
  i.user_id,
  COALESCE((i.source_ref ->> 'said_on')::date, i.created_at::date),
  i.text,
  i.source_ref ->> 'meeting_topic',
  'meeting',
  'pending',
  i.source_ref ->> 'context',
  COALESCE(i.source_ref ->> 'context', i.text),
  NULLIF(i.source_ref ->> 'recording_id', '')::uuid
FROM inbox_items i
WHERE i.type = 'meeting_insight'
  AND i.status = 'open'
  AND NOT EXISTS (
    SELECT 1 FROM dci_suggested_tasks d
    WHERE d.user_id = i.user_id AND d.title = i.text AND d.status = 'pending'
  );

UPDATE inbox_items
SET status = 'archived', archived_at = now()
WHERE type = 'meeting_insight' AND status = 'open';
