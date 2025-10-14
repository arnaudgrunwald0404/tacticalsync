
-- ==============================
-- Migration: Update meeting constraint
-- ==============================

-- Drop the old constraint
ALTER TABLE public.weekly_meetings 
DROP CONSTRAINT IF EXISTS weekly_meetings_team_id_week_start_date_key;

-- Add a new constraint to prevent duplicate meeting names for the same team and start date
ALTER TABLE public.weekly_meetings 
ADD CONSTRAINT weekly_meetings_team_name_unique
UNIQUE (team_id, week_start_date, name);
