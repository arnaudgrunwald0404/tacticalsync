-- Recreate the due_date column
BEGIN;

-- Drop the existing column and index
DROP INDEX IF EXISTS idx_meeting_items_due_date;
ALTER TABLE meeting_items DROP COLUMN IF EXISTS due_date;

-- Recreate the column and index
ALTER TABLE meeting_items ADD COLUMN due_date DATE;
CREATE INDEX idx_meeting_items_due_date ON meeting_items(due_date);

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';

-- Add comment to help with documentation and force cache refresh
COMMENT ON COLUMN meeting_items.due_date IS 'Due date for action items';

COMMIT;
