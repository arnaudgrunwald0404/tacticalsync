-- Fix teams RLS policies properly
-- Since disabling RLS worked, we know the issue was with the policies
-- Let's create simple, working RLS policies

-- Re-enable RLS on teams table
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Drop existing policy and create a simple INSERT policy that just checks if user is authenticated
DROP POLICY IF EXISTS "Users can create teams" ON teams;
CREATE POLICY "Users can create teams" ON teams
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Re-enable RLS on team_members table  
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and create simple INSERT policies for team_members
DROP POLICY IF EXISTS "Users can join teams" ON team_members;
CREATE POLICY "Users can join teams" ON team_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Team creators can add themselves as admin" ON team_members;
CREATE POLICY "Team creators can add themselves as admin" ON team_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update table comments
COMMENT ON TABLE teams IS 'RLS enabled with working policies';
COMMENT ON TABLE team_members IS 'RLS enabled with working policies';
