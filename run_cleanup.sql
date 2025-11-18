-- This will delete duplicate meeting instances, keeping the correct Monday start dates

-- First, let's see exactly what will be deleted
WITH ranked_meetings AS (
  SELECT 
    mi.id,
    mi.series_id,
    mi.start_date,
    ms.name as meeting_name,
    ms.frequency,
    mi.created_at,
    -- Rank meetings within each week/period, keeping the most recent one
    ROW_NUMBER() OVER (
      PARTITION BY 
        mi.series_id,
        CASE 
          WHEN ms.frequency IN ('weekly', 'bi-weekly') THEN date_trunc('week', mi.start_date::timestamp)::date
          WHEN ms.frequency = 'monthly' THEN date_trunc('month', mi.start_date::timestamp)::date
          WHEN ms.frequency = 'daily' THEN mi.start_date
          ELSE mi.start_date
        END
      ORDER BY 
        -- Prefer Monday for weekly meetings
        CASE 
          WHEN ms.frequency IN ('weekly', 'bi-weekly') AND EXTRACT(DOW FROM mi.start_date::date) = 1 THEN 0
          ELSE 1
        END,
        mi.created_at DESC
    ) as rank
  FROM meeting_instances mi
  JOIN meeting_series ms ON mi.series_id = ms.id
)
SELECT 
  substring(id::text, 1, 8) as id_prefix,
  meeting_name,
  start_date,
  frequency,
  created_at,
  '❌ WILL BE DELETED' as action
FROM ranked_meetings
WHERE rank > 1
ORDER BY meeting_name, start_date DESC;

-- If the above looks correct, run this DELETE query:
-- Copy everything below this line and run it separately after verifying above results

/*
WITH ranked_meetings AS (
  SELECT 
    mi.id,
    mi.series_id,
    ms.frequency,
    ROW_NUMBER() OVER (
      PARTITION BY 
        mi.series_id,
        CASE 
          WHEN ms.frequency IN ('weekly', 'bi-weekly') THEN date_trunc('week', mi.start_date::timestamp)::date
          WHEN ms.frequency = 'monthly' THEN date_trunc('month', mi.start_date::timestamp)::date
          WHEN ms.frequency = 'daily' THEN mi.start_date
          ELSE mi.start_date
        END
      ORDER BY 
        -- Prefer Monday for weekly meetings
        CASE 
          WHEN ms.frequency IN ('weekly', 'bi-weekly') AND EXTRACT(DOW FROM mi.start_date::date) = 1 THEN 0
          ELSE 1
        END,
        mi.created_at DESC
    ) as rank
  FROM meeting_instances mi
  JOIN meeting_series ms ON mi.series_id = ms.id
)
DELETE FROM meeting_instances
WHERE id IN (
  SELECT id FROM ranked_meetings WHERE rank > 1
)
RETURNING 
  substring(id::text, 1, 8) as deleted_id_prefix,
  start_date as deleted_date;
*/


