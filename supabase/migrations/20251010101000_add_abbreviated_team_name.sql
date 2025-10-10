-- Add abbreviated_name column to teams table
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS abbreviated_name TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_teams_abbreviated_name ON public.teams(abbreviated_name);

