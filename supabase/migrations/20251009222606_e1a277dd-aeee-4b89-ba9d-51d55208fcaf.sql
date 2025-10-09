-- Allow team creators to add themselves as members
DROP POLICY IF EXISTS "Team admins can insert team members" ON public.team_members;

CREATE POLICY "Team creators and admins can insert team members"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow if you're the team creator
  EXISTS (
    SELECT 1 FROM teams 
    WHERE teams.id = team_members.team_id 
    AND teams.created_by = auth.uid()
  )
  OR
  -- Allow if you're already an admin
  check_team_member_role(auth.uid(), team_id, 'admin'::member_role)
);