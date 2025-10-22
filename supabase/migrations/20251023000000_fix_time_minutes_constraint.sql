-- Fix the check_time_minutes constraint to allow null values
-- This allows agenda items to be created without specifying a time duration

-- Drop the existing constraint
ALTER TABLE meeting_series_agenda DROP CONSTRAINT IF EXISTS check_time_minutes;

-- Add a new constraint that allows null values or values > 0
ALTER TABLE meeting_series_agenda 
ADD CONSTRAINT check_time_minutes 
CHECK (time_minutes IS NULL OR time_minutes > 0);

-- Also fix the same constraint on meeting_instance_topics if it exists
ALTER TABLE meeting_instance_topics DROP CONSTRAINT IF EXISTS check_time_minutes;
ALTER TABLE meeting_instance_topics 
ADD CONSTRAINT check_time_minutes 
CHECK (time_minutes IS NULL OR time_minutes > 0);
