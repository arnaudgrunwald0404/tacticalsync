-- Link group meetings to their Zoom recordings and generated suggestions.
--
-- Post-call analysis (zoom-recordings-sync -> generate-meeting-suggestions)
-- already runs against any Zoom transcript, including ones from group
-- meetings, but had no way to attribute a recording/suggestion back to a
-- specific cos_group_meetings row — so results showed up as generic,
-- unlabeled "group meeting" suggestions instead of being tied to the
-- meeting the user actually tracks.

ALTER TABLE cos_group_meetings
  ADD COLUMN IF NOT EXISTS zoom_meeting_id text;

CREATE INDEX IF NOT EXISTS idx_cos_group_meetings_zoom_meeting_id
  ON cos_group_meetings(zoom_meeting_id)
  WHERE zoom_meeting_id IS NOT NULL;

ALTER TABLE cos_zoom_recordings
  ADD COLUMN IF NOT EXISTS group_meeting_id uuid
  REFERENCES cos_group_meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cos_zoom_recordings_group_meeting
  ON cos_zoom_recordings(group_meeting_id);

ALTER TABLE dci_suggested_tasks
  ADD COLUMN IF NOT EXISTS group_meeting_id uuid
  REFERENCES cos_group_meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dci_suggested_tasks_group_meeting
  ON dci_suggested_tasks(group_meeting_id);
