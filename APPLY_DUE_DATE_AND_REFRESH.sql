-- Apply due_date column and refresh schema cache
BEGIN;

-- Add due_date column to meeting_items table
ALTER TABLE meeting_items ADD COLUMN IF NOT EXISTS due_date DATE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_meeting_items_due_date ON meeting_items(due_date);

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';

COMMIT;
