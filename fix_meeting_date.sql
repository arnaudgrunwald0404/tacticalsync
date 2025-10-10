-- Fix the incorrect meeting date in the database
-- This will update the meeting to have the correct current week (10/6 - 10/10)

-- First, let's see what meetings exist with wrong dates
SELECT 
  wm.id,
  wm.week_start_date,
  rm.name as meeting_name,
  rm.frequency
FROM weekly_meetings wm
JOIN recurring_meetings rm ON wm.recurring_meeting_id = rm.id
WHERE wm.week_start_date = '2025-10-05'  -- This is the wrong date
ORDER BY wm.created_at DESC;

-- Update the meeting to have the correct Monday start date (10/6/2025)
UPDATE weekly_meetings 
SET week_start_date = '2025-10-06'
WHERE week_start_date = '2025-10-05'
AND recurring_meeting_id IN (
  SELECT id FROM recurring_meetings 
  WHERE name LIKE '%PLT%' OR name LIKE '%Tactical%'
);

-- Verify the fix
SELECT 
  wm.id,
  wm.week_start_date,
  rm.name as meeting_name,
  rm.frequency
FROM weekly_meetings wm
JOIN recurring_meetings rm ON wm.recurring_meeting_id = rm.id
WHERE wm.week_start_date = '2025-10-06'
ORDER BY wm.created_at DESC;
