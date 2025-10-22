-- Fix the check_due_date constraint for meeting_series_action_items
-- The current constraint is too restrictive and causes issues when due_date is null

-- Drop the existing problematic constraint
ALTER TABLE meeting_series_action_items 
DROP CONSTRAINT IF EXISTS check_due_date;

-- Create a more reasonable constraint that allows null due dates
-- and only validates that if a due date is provided, it's not in the past
ALTER TABLE meeting_series_action_items 
ADD CONSTRAINT check_due_date CHECK (
  due_date IS NULL OR due_date >= CURRENT_DATE
);
