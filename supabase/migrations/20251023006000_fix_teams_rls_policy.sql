-- Fix RLS policy for teams table to allow team creation
-- The current policy is too restrictive and preventing team creation

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can create teams" ON teams;
DROP POLICY IF EXISTS "Users can view teams they belong to" ON teams;
DROP POLICY IF EXISTS "Team admins can update teams" ON teams;
DROP POLICY IF EXISTS "Team admins can delete teams" ON teams;

-- Create more permissive policies that work with the current data structure
-- These policies allow any authenticated user to manage teams

CREATE POLICY "Authenticated users can view teams" ON teams 
  FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create teams" ON teams 
  FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Users can update their own teams" ON teams 
  FOR UPDATE 
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own teams" ON teams 
  FOR DELETE 
  USING (auth.uid() = created_by);
