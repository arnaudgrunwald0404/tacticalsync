-- Enable Realtime for Team Tactical Sync tables
-- This migration enables real-time synchronization for meeting-related tables

-- Function to safely add table to publication
DO $$
DECLARE
  tables_to_add TEXT[] := ARRAY[
    'meeting_instance_priorities',
    'meeting_instance_topics',
    'meeting_series_action_items',
    'meeting_series_agenda',
    'teams',
    'profiles',
    'team_members'
  ];
  table_name TEXT;
  is_in_publication BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY tables_to_add
  LOOP
    -- Check if table is already in the publication
    SELECT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = table_name
    ) INTO is_in_publication;
    
    -- Add table to publication if not already there
    IF NOT is_in_publication THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', table_name);
      RAISE NOTICE 'Added table % to supabase_realtime publication', table_name;
    ELSE
      RAISE NOTICE 'Table % already in supabase_realtime publication', table_name;
    END IF;
  END LOOP;
END $$;

-- Verify the realtime publication
-- You can check which tables are included by running:
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
