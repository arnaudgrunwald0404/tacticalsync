-- Drop the foreign key constraint that's blocking team member creation
ALTER TABLE public.team_members 
DROP CONSTRAINT IF EXISTS team_members_user_id_fkey;