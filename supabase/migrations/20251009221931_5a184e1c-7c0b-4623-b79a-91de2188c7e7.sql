-- Manually insert your profile since the trigger didn't fire
-- First, let's make created_by nullable temporarily to unblock you
ALTER TABLE public.teams ALTER COLUMN created_by DROP NOT NULL;

-- Now try creating the team without created_by
UPDATE public.teams SET created_by = NULL WHERE created_by IS NULL;