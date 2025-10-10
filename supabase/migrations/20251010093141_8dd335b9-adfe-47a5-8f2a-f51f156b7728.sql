-- Delete orphaned team_members records that don't have corresponding profiles
DELETE FROM public.team_members
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- Add foreign key relationship between team_members and profiles
ALTER TABLE public.team_members 
ADD CONSTRAINT team_members_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;