-- Fix RLS policies for lightweight authentication (no email verification)
-- The issue is that with enable_confirmations = false, users are created immediately
-- but the RLS policies might be too strict for unverified users

-- Update the teams INSERT policy to be more permissive for lightweight auth
DROP POLICY IF EXISTS "Users can create teams" ON teams;
CREATE POLICY "Users can create teams" ON teams
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    auth.uid() = created_by
  );

-- Update the team_members INSERT policies to be more permissive
DROP POLICY IF EXISTS "Users can join teams" ON team_members;
CREATE POLICY "Users can join teams" ON team_members
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Team creators can add themselves as admin" ON team_members;
CREATE POLICY "Team creators can add themselves as admin" ON team_members
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_members.team_id
      AND teams.created_by = auth.uid()
    )
  );

-- Update profiles INSERT policy to be more permissive
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    auth.uid() = id
  );
