-- Drop and recreate with explicit role targeting
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;

CREATE POLICY "Authenticated users can create teams"
ON public.teams
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);