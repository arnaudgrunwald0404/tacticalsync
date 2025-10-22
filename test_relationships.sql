-- Test script to verify database relationships are working
-- This will help us confirm that the foreign key relationships are properly established

-- Test 1: Check if team_members table has the proper foreign key constraint
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'team_members'
    AND kcu.column_name = 'user_id';

-- Test 2: Check if we can do a simple join between team_members and profiles
SELECT 
    tm.id as team_member_id,
    tm.user_id,
    p.id as profile_id,
    p.first_name,
    p.last_name,
    p.email
FROM team_members tm
LEFT JOIN profiles p ON p.id = tm.user_id
LIMIT 5;
