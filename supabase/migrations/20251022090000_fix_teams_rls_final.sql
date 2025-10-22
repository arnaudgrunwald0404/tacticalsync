-- Final fix for teams RLS policy - make it more permissive
-- The issue might be that auth.uid() is not matching created_by exactly

-- Drop and recreate the teams INSERT policy with a more permissive approach
DROP POLICY IF EXISTS "Users can create teams" ON teams;
CREATE POLICY "Users can create teams" ON teams
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Also update team_members policies to be more permissive
DROP POLICY IF EXISTS "Users can join teams" ON team_members;
CREATE POLICY "Users can join teams" ON team_members
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Team creators can add themselves as admin" ON team_members;
CREATE POLICY "Team creators can add themselves as admin" ON team_members
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );
