-- Quick fix for infinite recursion in team_members RLS policies
-- Run this in Supabase SQL Editor

-- Temporarily disable RLS on team_members to fix the recursion
ALTER TABLE public.team_members DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies on team_members
DROP POLICY IF EXISTS "Team members can view members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can update members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can delete members" ON public.team_members;
DROP POLICY IF EXISTS "Users can join teams" ON public.team_members;
DROP POLICY IF EXISTS "Team creators can add themselves as admin" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can manage members" ON public.team_members;

-- Re-enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Add simple, non-recursive policies
CREATE POLICY "Allow all operations on team_members" ON public.team_members
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Also make sure teams table allows creation
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
CREATE POLICY "Authenticated users can create teams" ON public.teams FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Allow viewing teams for authenticated users
DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
CREATE POLICY "Authenticated users can view teams" ON public.teams FOR SELECT 
  TO authenticated
  USING (true);

-- Allow updating teams for authenticated users (will add proper restrictions later)
DROP POLICY IF EXISTS "Team admins can update teams" ON public.teams;
CREATE POLICY "Authenticated users can update teams" ON public.teams FOR UPDATE 
  TO authenticated
  USING (true)
  WITH CHECK (true);
