-- Fix the check_title_length constraint to allow empty titles for initial agenda items
-- This allows agenda items to be created with empty titles that can be filled later

-- Drop the existing constraint
ALTER TABLE meeting_series_agenda DROP CONSTRAINT IF EXISTS check_title_length;

-- Add a new constraint that allows empty titles (for initial creation) or non-empty titles
ALTER TABLE meeting_series_agenda 
ADD CONSTRAINT check_title_length 
CHECK (length(title) >= 0);

-- Also fix the same constraint on other tables if they exist
ALTER TABLE meeting_instance_priorities DROP CONSTRAINT IF EXISTS check_title_length;
ALTER TABLE meeting_instance_priorities 
ADD CONSTRAINT check_title_length 
CHECK (length(title) >= 0);

ALTER TABLE meeting_instance_topics DROP CONSTRAINT IF EXISTS check_title_length;
ALTER TABLE meeting_instance_topics 
ADD CONSTRAINT check_title_length 
CHECK (length(title) >= 0);

ALTER TABLE meeting_series_action_items DROP CONSTRAINT IF EXISTS check_title_length;
ALTER TABLE meeting_series_action_items 
ADD CONSTRAINT check_title_length 
CHECK (length(title) >= 0);
