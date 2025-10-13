-- Check for duplicate weekly_meetings that would violate the new constraint
SELECT 
    recurring_meeting_id,
    week_start_date,
    COUNT(*) as duplicate_count,
    array_agg(id) as meeting_ids
FROM public.weekly_meetings
WHERE recurring_meeting_id IS NOT NULL
GROUP BY recurring_meeting_id, week_start_date
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Also check for weekly_meetings with NULL recurring_meeting_id
SELECT 
    'NULL recurring_meeting_id' as issue,
    COUNT(*) as count
FROM public.weekly_meetings
WHERE recurring_meeting_id IS NULL;

