-- Add due_date column to meeting_items table
ALTER TABLE meeting_items ADD COLUMN due_date DATE;

-- Add index for faster queries
CREATE INDEX idx_meeting_items_due_date ON meeting_items(due_date);
