-- Fix comments table foreign key relationship to profiles
-- The comments table has created_by that references auth.users, but we need it to reference profiles for PostgREST joins

-- First, check if there's an existing foreign key constraint and drop it
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_created_by_fkey;

-- Add proper foreign key constraint from created_by to profiles
ALTER TABLE comments 
ADD CONSTRAINT fk_comments_created_by_profiles 
FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

-- Add a comment to document the relationship
COMMENT ON COLUMN comments.created_by IS 'User who created this comment (references profiles.id)';

-- Create an index to improve join performance
CREATE INDEX IF NOT EXISTS idx_comments_created_by ON comments(created_by);



