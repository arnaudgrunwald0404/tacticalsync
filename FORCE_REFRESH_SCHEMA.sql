-- Drop and recreate the column to force schema refresh
BEGIN;

-- First, save existing data
CREATE TEMP TABLE temp_meeting_items AS
SELECT id, due_date FROM meeting_items WHERE due_date IS NOT NULL;

-- Drop and recreate the column
ALTER TABLE meeting_items DROP COLUMN IF EXISTS due_date;
ALTER TABLE meeting_items ADD COLUMN due_date DATE;

-- Restore the data
UPDATE meeting_items mi
SET due_date = tmp.due_date
FROM temp_meeting_items tmp
WHERE mi.id = tmp.id;

-- Drop temp table
DROP TABLE temp_meeting_items;

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';

-- Add comment to help with documentation
COMMENT ON COLUMN meeting_items.due_date IS 'Due date for action items and other tasks';

COMMIT;