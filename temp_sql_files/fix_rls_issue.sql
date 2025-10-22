-- Fix RLS issue for meeting_series_action_items
-- This script creates more permissive policies to allow action item creation

-- First, let's check if the user is properly in the team_members table
-- This is a diagnostic query that can be run to check team membership
-- SELECT tm.*, p.first_name, p.last_name, p.email 
-- FROM team_members tm 
-- JOIN profiles p ON p.id = tm.user_id 
-- WHERE tm.user_id = auth.uid();

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Team members can view action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can insert action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can update own action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can delete own action items" ON meeting_series_action_items;

-- Create more permissive policies that allow any authenticated user to manage action items
-- This is a temporary fix to resolve the RLS issue
CREATE POLICY "Authenticated users can view action items" ON meeting_series_action_items 
  FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert action items" ON meeting_series_action_items 
  FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Users can update their own action items" ON meeting_series_action_items 
  FOR UPDATE 
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own action items" ON meeting_series_action_items 
  FOR DELETE 
  USING (auth.uid() = created_by);
