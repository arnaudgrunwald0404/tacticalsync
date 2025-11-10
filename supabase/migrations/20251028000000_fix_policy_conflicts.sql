-- Fix policy conflicts by dropping and recreating conflicting policies
-- This migration handles the case where policies already exist

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Team admins can update teams" ON teams;
DROP POLICY IF EXISTS "Users can view teams they belong to" ON teams;
DROP POLICY IF EXISTS "Users can create teams" ON teams;
DROP POLICY IF EXISTS "Users can view team members of their teams" ON team_members;
DROP POLICY IF EXISTS "Team admins can manage team members" ON team_members;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Team members can view team invitations" ON invitations;
DROP POLICY IF EXISTS "Team admins can manage invitations" ON invitations;
DROP POLICY IF EXISTS "Users can view comments on items they have access to" ON comments;
DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;

-- Recreate the policies
CREATE POLICY "Users can view teams they belong to" ON teams 
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM team_members tm 
    WHERE tm.team_id = teams.id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Users can create teams" ON teams 
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team admins can update teams" ON teams 
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM team_members tm 
    WHERE tm.team_id = teams.id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin'
  ));

CREATE POLICY "Users can view team members of their teams" ON team_members 
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM team_members tm 
    WHERE tm.team_id = team_members.team_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team admins can manage team members" ON team_members 
  FOR ALL USING (EXISTS (
    SELECT 1 FROM team_members tm 
    WHERE tm.team_id = team_members.team_id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin'
  ));

CREATE POLICY "Users can view their own profile" ON profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles 
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Team members can view team invitations" ON invitations 
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM team_members tm 
    WHERE tm.team_id = invitations.team_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team admins can manage invitations" ON invitations 
  FOR ALL USING (EXISTS (
    SELECT 1 FROM team_members tm 
    WHERE tm.team_id = invitations.team_id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin'
  ));

CREATE POLICY "Users can view comments on items they have access to" ON comments 
  FOR SELECT USING (true);

CREATE POLICY "Users can create comments" ON comments 
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own comments" ON comments 
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own comments" ON comments 
  FOR DELETE USING (auth.uid() = created_by);


