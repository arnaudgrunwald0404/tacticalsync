-- Add DELETE policy for teams to allow team admins to delete teams
CREATE POLICY "Team admins can delete teams" ON public.teams FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = teams.id 
    AND team_members.user_id = auth.uid()
    AND team_members.role = 'admin'
  ));

