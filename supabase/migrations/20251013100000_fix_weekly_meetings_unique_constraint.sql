-- Fix the unique constraint on weekly_meetings to use recurring_meeting_id instead of team_id
-- This allows multiple recurring meetings per team (e.g., tactical, strategic) but prevents
-- duplicate instances of the same recurring meeting for the same week

-- Drop the old constraint
ALTER TABLE public.weekly_meetings 
DROP CONSTRAINT IF EXISTS weekly_meetings_team_id_week_start_date_key;

-- Add the new constraint
ALTER TABLE public.weekly_meetings 
ADD CONSTRAINT weekly_meetings_recurring_meeting_week_unique 
UNIQUE (recurring_meeting_id, week_start_date);

