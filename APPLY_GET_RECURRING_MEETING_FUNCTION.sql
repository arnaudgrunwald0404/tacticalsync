-- Apply the get_recurring_meeting function
\i 'supabase/migrations/20251014001000_add_get_recurring_meeting_function.sql'

-- Verify the function was created
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'get_recurring_meeting' 
AND routine_schema = 'public';
