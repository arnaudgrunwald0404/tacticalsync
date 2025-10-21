-- Add completion_status column
ALTER TABLE meeting_items ADD COLUMN completion_status text CHECK (completion_status IN ('completed', 'not_completed'));

-- Update existing records based on is_completed field
UPDATE meeting_items
SET completion_status = CASE
  WHEN is_completed = true THEN 'completed'
  WHEN is_completed = false THEN 'not_completed'
  ELSE null
END;
