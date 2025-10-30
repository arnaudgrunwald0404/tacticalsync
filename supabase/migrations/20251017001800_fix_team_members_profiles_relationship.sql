-- Fix the relationship between team_members and profiles
-- This migration ensures PostgREST can find the relationship for joins

-- The issue is that team_members.user_id references auth.users(id)
-- and profiles.id also references auth.users(id)
-- But there's no direct FK between team_members.user_id and profiles.id

-- We need to ensure that when a user is added to team_members,
-- they also have a corresponding profile entry

-- First, let's add a foreign key constraint to ensure data integrity
-- This will ensure that every user_id in team_members has a corresponding profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_team_members_user_id_profiles'
  ) THEN
    ALTER TABLE team_members 
    ADD CONSTRAINT fk_team_members_user_id_profiles 
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add a comment to document the relationship
COMMENT ON COLUMN team_members.user_id IS 'User ID that references profiles.id (not auth.users.id)';

-- Create an index to improve join performance
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
