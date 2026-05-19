-- Add role_tags column to profiles for tag-based role assignment
-- Valid tags: 'admin', 'elt', 'xlt', 'user'
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_tags text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.role_tags IS 'Tag-based roles: admin, elt, xlt, user';

-- Backfill: set existing admins/super_admins to have the admin tag
UPDATE public.profiles
  SET role_tags = ARRAY['admin']
  WHERE (is_admin = TRUE OR is_super_admin = TRUE)
    AND (role_tags IS NULL OR role_tags = '{}');
