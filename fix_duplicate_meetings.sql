-- Fix duplicate meeting instances
-- This script identifies and removes duplicate meeting instances for the same week/period

-- STEP 1: View all duplicate meeting instances
-- This helps you see what duplicates exist before we clean them up
SELECT 
  mi.series_id,
  ms.name as meeting_name,
  ms.frequency,
  mi.start_date,
  mi.id,
  mi.created_at,
  COUNT(*) OVER (PARTITION BY mi.series_id, 
    CASE 
      WHEN ms.frequency IN ('weekly', 'bi-weekly') THEN date_trunc('week', mi.start_date::timestamp)::date
      WHEN ms.frequency = 'monthly' THEN date_trunc('month', mi.start_date::timestamp)::date
      WHEN ms.frequency = 'daily' THEN mi.start_date
      ELSE mi.start_date
    END
  ) as duplicate_count
FROM meeting_instances mi
JOIN meeting_series ms ON mi.series_id = ms.id
ORDER BY mi.series_id, mi.start_date DESC, mi.created_at DESC;

-- STEP 2: Identify which duplicates to DELETE (keep the most recent one per week)
-- This CTE finds all duplicates except the one we want to keep
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
  id,
  series_id,
  start_date,
  meeting_name,
  frequency,
  created_at,
  'WILL BE DELETED' as action
FROM ranked_meetings
WHERE rank > 1
ORDER BY series_id, start_date DESC;

-- STEP 3: DELETE the duplicate meetings (keeping the best one per week)
-- IMPORTANT: Review the output from STEP 2 before running this!
-- Uncomment the following block when you're ready to delete duplicates:

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
);
*/

-- STEP 4: Verify the cleanup
-- Run this after deleting to confirm no more duplicates exist
SELECT 
  mi.series_id,
  ms.name as meeting_name,
  ms.frequency,
  COUNT(*) as instance_count,
  array_agg(mi.start_date ORDER BY mi.start_date DESC) as start_dates
FROM meeting_instances mi
JOIN meeting_series ms ON mi.series_id = ms.id
GROUP BY mi.series_id, ms.name, ms.frequency
HAVING COUNT(*) > 1
ORDER BY ms.name;

-- STEP 5 (OPTIONAL): Add a database trigger to prevent future duplicates
-- This ensures that for weekly/bi-weekly meetings, only one instance per calendar week exists
-- Uncomment to create the trigger:

/*
CREATE OR REPLACE FUNCTION prevent_duplicate_meeting_instances()
RETURNS TRIGGER AS $$
DECLARE
  normalized_start_date DATE;
  existing_count INTEGER;
  meeting_frequency TEXT;
BEGIN
  -- Get the frequency for this meeting series
  SELECT frequency INTO meeting_frequency
  FROM meeting_series
  WHERE id = NEW.series_id;
  
  -- Normalize the start date based on frequency
  CASE meeting_frequency
    WHEN 'weekly', 'bi-weekly' THEN
      -- Normalize to Monday of the week
      normalized_start_date := date_trunc('week', NEW.start_date::timestamp)::date;
    WHEN 'monthly' THEN
      -- Normalize to first of month
      normalized_start_date := date_trunc('month', NEW.start_date::timestamp)::date;
    ELSE
      -- For daily and others, use exact date
      normalized_start_date := NEW.start_date;
  END CASE;
  
  -- Check if a meeting already exists for this normalized period
  SELECT COUNT(*) INTO existing_count
  FROM meeting_instances mi
  JOIN meeting_series ms ON mi.series_id = ms.id
  WHERE mi.series_id = NEW.series_id
    AND mi.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND CASE 
      WHEN ms.frequency IN ('weekly', 'bi-weekly') THEN 
        date_trunc('week', mi.start_date::timestamp)::date = normalized_start_date
      WHEN ms.frequency = 'monthly' THEN
        date_trunc('month', mi.start_date::timestamp)::date = normalized_start_date
      ELSE
        mi.start_date = NEW.start_date
    END;
  
  IF existing_count > 0 THEN
    RAISE EXCEPTION 'A meeting instance already exists for this period (series_id: %, normalized date: %)', 
      NEW.series_id, normalized_start_date;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists, then create it
DROP TRIGGER IF EXISTS check_duplicate_meeting_instances ON meeting_instances;
CREATE TRIGGER check_duplicate_meeting_instances
  BEFORE INSERT OR UPDATE ON meeting_instances
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_meeting_instances();
*/

