-- Add frequency column to teams table
DO $$ BEGIN
  CREATE TYPE meeting_frequency AS ENUM ('daily', 'weekly', 'bi-weekly', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS frequency meeting_frequency DEFAULT 'weekly';