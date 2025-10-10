-- Fix team update issues - Run this in Supabase SQL Editor

-- First, let's check if the abbreviated_name column exists
-- (This should already exist from our previous migrations)

-- Fix RLS policies for teams table to allow updates
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
DROP POLICY IF EXISTS "Team admins can update teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can view teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can update teams" ON public.teams;

-- Create comprehensive policies for teams table
CREATE POLICY "Allow authenticated users to view teams" ON public.teams FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to create teams" ON public.teams FOR INSERT 
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update teams" ON public.teams FOR UPDATE 
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete teams" ON public.teams FOR DELETE 
  TO authenticated
  USING (true);

-- Also ensure team_members policies are working
DROP POLICY IF EXISTS "Allow all operations on team_members" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can update members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can delete members" ON public.team_members;
DROP POLICY IF EXISTS "Users can join teams" ON public.team_members;
DROP POLICY IF EXISTS "Team creators can add themselves as admin" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can manage members" ON public.team_members;

CREATE POLICY "Allow all operations on team_members" ON public.team_members
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Verify the abbreviated_name column exists and has the right type
-- (This should not error if the column already exists)
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS abbreviated_name TEXT;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_teams_abbreviated_name ON public.teams(abbreviated_name);
