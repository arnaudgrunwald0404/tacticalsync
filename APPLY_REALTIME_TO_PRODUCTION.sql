-- ============================================================================
-- APPLY REALTIME TO PRODUCTION - Team Tactical Sync
-- ============================================================================
-- Run this script in your Supabase Production SQL Editor
-- This enables real-time synchronization for your production database
--
-- ⚠️  IMPORTANT: Test this in staging first if you have one!
-- ============================================================================

-- Step 1: Enable Realtime on meeting_instance_priorities
-- This allows real-time sync of priority items across all users
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_instance_priorities;

-- Step 2: Enable Realtime on meeting_instance_topics
-- This allows real-time sync of discussion topics
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_instance_topics;

-- Step 3: Enable Realtime on meeting_series_action_items
-- This allows real-time sync of action items
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_series_action_items;

-- Step 4: Enable Realtime on meeting_series_agenda
-- This allows real-time sync of agenda items
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_series_agenda;

-- Step 5: Enable Realtime on teams
-- This allows real-time sync of team information changes
ALTER PUBLICATION supabase_realtime ADD TABLE teams;

-- Step 6: Enable Realtime on profiles
-- This allows real-time sync of user profile updates
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- Step 7: Enable Realtime on team_members
-- This allows real-time sync of team membership changes
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run this query to verify all tables are properly enabled for realtime:

SELECT 
  schemaname,
  tablename,
  'Realtime Enabled' as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
  AND tablename IN (
    'meeting_instance_priorities',
    'meeting_instance_topics',
    'meeting_series_action_items',
    'meeting_series_agenda',
    'teams',
    'profiles',
    'team_members'
  )
ORDER BY tablename;

-- You should see 7 rows in the result, one for each table.
-- If any table is missing, that table is not enabled for realtime.

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================

-- If you get an error like "table already added to publication", it means
-- the table is already enabled. This is fine - you can continue.

-- To remove a table from realtime (if needed):
-- ALTER PUBLICATION supabase_realtime DROP TABLE table_name;

-- To see ALL tables currently in the realtime publication:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- ============================================================================
-- MONITORING
-- ============================================================================

-- After enabling, you can monitor realtime usage in:
-- 1. Supabase Dashboard → Settings → API → Realtime section
-- 2. Check the "Realtime messages" metric
-- 3. Monitor for any connection errors in the logs

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- If you need to disable realtime on all tables:
/*
ALTER PUBLICATION supabase_realtime DROP TABLE meeting_instance_priorities;
ALTER PUBLICATION supabase_realtime DROP TABLE meeting_instance_topics;
ALTER PUBLICATION supabase_realtime DROP TABLE meeting_series_action_items;
ALTER PUBLICATION supabase_realtime DROP TABLE meeting_series_agenda;
ALTER PUBLICATION supabase_realtime DROP TABLE teams;
ALTER PUBLICATION supabase_realtime DROP TABLE profiles;
ALTER PUBLICATION supabase_realtime DROP TABLE team_members;
*/

-- ============================================================================
-- DONE!
-- ============================================================================
-- After running this script:
-- 1. Verify the output shows all 7 tables
-- 2. Test in the app by opening the same meeting in two browser windows
-- 3. Make a change in one window and watch it appear in the other
-- 4. Check presence indicators show online users
-- ============================================================================

