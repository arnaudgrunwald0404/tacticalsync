-- Add completion_status column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'meeting_items' 
    AND column_name = 'completion_status'
  ) THEN
    ALTER TABLE meeting_items 
    ADD COLUMN completion_status text CHECK (completion_status IN ('completed', 'not_completed'));
  END IF;
END $$;

-- Update existing records based on is_completed field
UPDATE meeting_items
SET completion_status = CASE
  WHEN is_completed = true THEN 'completed'
  WHEN is_completed = false THEN 'not_completed'
  ELSE null
END;

-- Refresh schema cache
SELECT pg_notify('pgrst', 'reload schema');
