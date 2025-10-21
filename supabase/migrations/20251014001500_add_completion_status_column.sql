-- Add completion_status column to meeting_items table
ALTER TABLE meeting_items ADD COLUMN IF NOT EXISTS completion_status text;

-- Update existing rows to have a default status
UPDATE meeting_items 
SET completion_status = CASE 
  WHEN is_completed = true THEN 'completed'
  ELSE 'pending'
END
WHERE completion_status IS NULL;

-- Refresh the schema cache to ensure the new column is recognized
ALTER TABLE meeting_items ALTER COLUMN completion_status SET DEFAULT 'pending';

-- Refresh schema cache
SELECT schema_cache_refresh();
