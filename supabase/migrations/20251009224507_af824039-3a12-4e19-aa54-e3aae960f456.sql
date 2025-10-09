-- Add profile fields for birthday feature
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS birthday DATE;

-- Update full_name to be generated from first_name and last_name
CREATE OR REPLACE FUNCTION public.update_full_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
    NEW.full_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-update full_name
DROP TRIGGER IF EXISTS update_profiles_full_name ON public.profiles;
CREATE TRIGGER update_profiles_full_name
BEFORE INSERT OR UPDATE OF first_name, last_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_full_name();

-- Migrate existing full_name to first_name
UPDATE public.profiles
SET first_name = full_name
WHERE first_name IS NULL AND full_name IS NOT NULL;