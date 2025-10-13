-- Check all constraints on weekly_meetings table
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'public.weekly_meetings'::regclass
ORDER BY conname;

