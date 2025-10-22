-- Fix team creation by adding missing INSERT policies for team_members
-- This allows users to create teams and automatically become team admins

-- Add INSERT policy for team_members to allow team creation
CREATE POLICY "Users can join teams" ON public.team_members
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add policy for team creators to add themselves as admin
CREATE POLICY "Team creators can add themselves as admin" ON public.team_members
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_members.team_id
      AND teams.created_by = auth.uid()
    )
  );
