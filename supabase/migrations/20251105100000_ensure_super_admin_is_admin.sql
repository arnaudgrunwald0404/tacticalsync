-- Ensure agrunwald@clearcompany.com is both admin and super admin
-- This migration sets both flags to ensure the user has all admin privileges

UPDATE public.profiles
SET is_admin = TRUE,
    is_super_admin = TRUE
WHERE LOWER(email) = LOWER('agrunwald@clearcompany.com');

-- Add comment to document this
COMMENT ON COLUMN public.profiles.is_admin IS 'When true, user can create teams and meetings (org-level admin). Super admins should also have this set.';
COMMENT ON COLUMN public.profiles.is_super_admin IS 'When true, user has visibility to all teams and meetings regardless of membership';

