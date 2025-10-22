-- Fix RLS policies for meeting_series_action_items
-- This script adds more permissive policies to debug the RLS issue

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Team members can view action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can insert action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can update own action items" ON meeting_series_action_items;
DROP POLICY IF EXISTS "Team members can delete own action items" ON meeting_series_action_items;

-- Create more permissive policies for debugging
CREATE POLICY "Users can view action items" ON meeting_series_action_items 
  FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert action items" ON meeting_series_action_items 
  FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Users can update action items" ON meeting_series_action_items 
  FOR UPDATE 
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete action items" ON meeting_series_action_items 
  FOR DELETE 
  USING (auth.uid() = created_by);
