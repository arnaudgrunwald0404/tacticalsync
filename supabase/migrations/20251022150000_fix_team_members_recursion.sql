-- Fix infinite recursion by using SECURITY DEFINER helper
DROP POLICY IF EXISTS "Users can view team members" ON team_members;

CREATE POLICY "Users can view team members" ON team_members
  FOR SELECT USING (
    auth.uid() = user_id OR
    public.is_team_member(team_members.team_id, auth.uid())
  );
