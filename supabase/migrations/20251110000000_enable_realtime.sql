-- Enable Realtime for Team Tactical Sync tables
-- This migration enables real-time synchronization for meeting-related tables

-- Enable realtime on meeting_instance_priorities
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_instance_priorities;

-- Enable realtime on meeting_instance_topics
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_instance_topics;

-- Enable realtime on meeting_series_action_items
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_series_action_items;

-- Enable realtime on meeting_series_agenda
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_series_agenda;

-- Enable realtime on teams (for team updates)
ALTER PUBLICATION supabase_realtime ADD TABLE teams;

-- Enable realtime on profiles (for user profile updates)
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- Enable realtime on team_members (for team membership changes)
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;

-- Verify the realtime publication
-- You can check which tables are included by running:
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

