-- Add super admin column and set agrunwald@clearcompany.com as super admin
-- This migration adds the is_super_admin column to the profiles table

-- 1. Add is_super_admin column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- 2. Create function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Set agrunwald@clearcompany.com as super admin
UPDATE public.profiles
SET is_super_admin = TRUE
WHERE email = 'agrunwald@clearcompany.com';

-- 4. Add comment to document the super admin feature
COMMENT ON COLUMN public.profiles.is_super_admin IS 'When true, user has visibility to all teams and meetings regardless of membership';
COMMENT ON FUNCTION public.is_super_admin() IS 'Returns true if the current user is a super admin';
