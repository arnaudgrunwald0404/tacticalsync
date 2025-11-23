-- Add composite index for meeting_instances(series_id, start_date)
-- This improves performance for queries that filter by series_id and order by start_date
-- which is a common pattern in the meeting page

CREATE INDEX IF NOT EXISTS idx_meeting_instances_series_start_date 
  ON meeting_instances(series_id, start_date DESC);

-- Add composite index for meeting_instances(series_id, start_date) with equality filter
-- This helps with queries like: WHERE series_id = X AND start_date = Y
CREATE INDEX IF NOT EXISTS idx_meeting_instances_series_start_eq 
  ON meeting_instances(series_id, start_date);

