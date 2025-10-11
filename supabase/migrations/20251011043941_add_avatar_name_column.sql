-- Add avatar_name column to profiles table
ALTER TABLE profiles 
ADD COLUMN avatar_name TEXT DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN profiles.avatar_name IS 'Custom avatar name used for generating unique avatar patterns and colors';
