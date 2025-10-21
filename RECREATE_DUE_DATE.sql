BEGIN;
-- Drop existing column and index
DROP INDEX IF EXISTS idx_meeting_items_due_date;
ALTER TABLE meeting_items DROP COLUMN IF EXISTS due_date;

-- Recreate with explicit type and comment
ALTER TABLE meeting_items ADD COLUMN due_date DATE;
COMMENT ON COLUMN meeting_items.due_date IS 'Due date for action items';
CREATE INDEX idx_meeting_items_due_date ON meeting_items(due_date);

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';
COMMIT;
