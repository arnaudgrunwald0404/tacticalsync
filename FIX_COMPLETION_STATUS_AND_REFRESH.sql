-- Drop and recreate completion_status column
ALTER TABLE meeting_items DROP COLUMN IF EXISTS completion_status;
ALTER TABLE meeting_items ADD COLUMN completion_status text CHECK (completion_status IN ('completed', 'not_completed'));

-- Update existing records based on is_completed field
UPDATE meeting_items
SET completion_status = CASE
  WHEN is_completed = true THEN 'completed'
  WHEN is_completed = false THEN 'not_completed'
  ELSE null
END;

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';

-- Alternative method to force schema refresh
COMMENT ON COLUMN meeting_items.completion_status IS 'Completion status for meeting items';

-- Verify column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'meeting_items' 
AND column_name = 'completion_status';
