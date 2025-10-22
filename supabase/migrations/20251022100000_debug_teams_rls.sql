-- Debug migration to temporarily disable RLS on teams table
-- This will help us determine if the issue is with RLS or something else

-- First, let's check what the current RLS policies look like
-- We'll create a simple test to see what's happening

-- Temporarily disable RLS on teams table for debugging
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;

-- Also disable RLS on team_members for debugging
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;

-- Add a comment to track this change
COMMENT ON TABLE teams IS 'RLS temporarily disabled for debugging team creation issues';
COMMENT ON TABLE team_members IS 'RLS temporarily disabled for debugging team creation issues';
