-- Add location, description, and extracted zoom_meeting_id to calendar events
-- so the Zoom sync can discover transcripts for meetings hosted by others.

ALTER TABLE cos_one_on_one_events
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS zoom_meeting_id text;

-- Index for the Zoom sync to quickly find events with a Zoom meeting ID.
CREATE INDEX IF NOT EXISTS idx_cos_events_zoom_meeting_id
  ON cos_one_on_one_events (user_id, zoom_meeting_id)
  WHERE zoom_meeting_id IS NOT NULL;
