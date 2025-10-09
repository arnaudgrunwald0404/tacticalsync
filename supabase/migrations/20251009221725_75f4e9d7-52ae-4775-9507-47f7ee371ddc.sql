-- Remove the foreign key constraint from teams to profiles
-- This allows team creation even if profile doesn't exist yet
ALTER TABLE public.teams 
DROP CONSTRAINT IF EXISTS teams_created_by_fkey;

-- Re-enable RLS with proper security
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Update the policy to be secure but functional
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;

CREATE POLICY "Authenticated users can create teams"
ON public.teams
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);