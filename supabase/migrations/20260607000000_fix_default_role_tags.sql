-- Fix: new users get no role_tags, causing canAccess() to return false for all
-- features once the feature_permissions table is populated. Assign 'user' by
-- default so new signups can access Meetings and Commitments immediately.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, avatar_url, role_tags)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'given_name', NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'family_name', NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    ARRAY['user']
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing users who have no role_tags (e.g. adepew@clearcompany.com)
UPDATE public.profiles
  SET role_tags = ARRAY['user']
  WHERE (role_tags IS NULL OR role_tags = '{}')
    AND is_admin IS NOT TRUE
    AND is_super_admin IS NOT TRUE;
