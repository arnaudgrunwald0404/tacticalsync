-- Add org chart fields to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS manager_email text;

CREATE INDEX IF NOT EXISTS profiles_manager_email_idx ON profiles (manager_email);
