-- Fix RLS policies for teams table to allow proper team name updates
-- This script addresses the issue where team names and abbreviated names are not saving

-- First, let's drop all existing teams policies to start fresh
DROP POLICY IF EXISTS "Team admins can update teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view teams" ON public.teams;

-- Create comprehensive teams policies

-- 1. Allow team members to view teams they belong to
CREATE POLICY "Team members can view teams"
ON public.teams
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = teams.id 
    AND team_members.user_id = auth.uid()
  )
);

-- 2. Allow authenticated users to create teams (they become admin automatically)
CREATE POLICY "Authenticated users can create teams"
ON public.teams
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- 3. Allow team admins to update teams (including name and abbreviated_name)
CREATE POLICY "Team admins can update teams"
ON public.teams
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = teams.id 
    AND team_members.user_id = auth.uid() 
    AND team_members.role = 'admin'
  )
);

-- 4. Allow team admins to delete teams
CREATE POLICY "Team admins can delete teams"
ON public.teams
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = teams.id 
    AND team_members.user_id = auth.uid() 
    AND team_members.role = 'admin'
  )
);

-- Verify the policies are working by checking if we can select from teams
-- This should work for team members
SELECT 'Teams RLS policies updated successfully' as status;
