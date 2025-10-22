-- Add standing_agenda_items column to teams table
-- Run this in Supabase SQL Editor

-- Add standing_agenda_items column to store standing agenda configuration
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS standing_agenda_items JSONB DEFAULT '[]'::jsonb;

-- Add comment to document the column
COMMENT ON COLUMN public.teams.standing_agenda_items IS 'JSON array of standing agenda items with name, assigned_to, and time_minutes fields';
