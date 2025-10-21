-- Add is_future column to meeting_items table
ALTER TABLE meeting_items ADD COLUMN is_future boolean DEFAULT false;
