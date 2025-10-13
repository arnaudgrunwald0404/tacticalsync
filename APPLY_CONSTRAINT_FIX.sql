-- Comprehensive fix for weekly_meetings unique constraint
-- This script:
-- 1. Cleans up any duplicate data
-- 2. Removes the old constraint
-- 3. Adds the new constraint
-- 
-- Run this SQL in your Supabase SQL Editor

BEGIN;

-- Step 1: Check for NULL recurring_meeting_ids and fix them if possible
-- (This shouldn't happen in normal operation, but let's be safe)
DO $$
DECLARE
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count
    FROM public.weekly_meetings
    WHERE recurring_meeting_id IS NULL;
    
    IF null_count > 0 THEN
        RAISE NOTICE 'Found % weekly_meetings with NULL recurring_meeting_id', null_count;
        
        -- Try to fix by linking to the team's first recurring meeting
        UPDATE public.weekly_meetings wm
        SET recurring_meeting_id = (
            SELECT id FROM public.recurring_meetings rm
            WHERE rm.team_id = wm.team_id
            ORDER BY rm.created_at
            LIMIT 1
        )
        WHERE wm.recurring_meeting_id IS NULL
        AND wm.team_id IS NOT NULL;
        
        RAISE NOTICE 'Attempted to fix NULL recurring_meeting_ids';
    END IF;
END $$;

-- Step 2: Handle duplicates (keep the oldest one, delete newer ones)
WITH duplicates AS (
    SELECT 
        recurring_meeting_id,
        week_start_date,
        id,
        ROW_NUMBER() OVER (
            PARTITION BY recurring_meeting_id, week_start_date 
            ORDER BY created_at ASC
        ) as rn
    FROM public.weekly_meetings
    WHERE recurring_meeting_id IS NOT NULL
)
DELETE FROM public.weekly_meetings
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Step 3: Drop the old constraint if it exists
ALTER TABLE public.weekly_meetings 
DROP CONSTRAINT IF EXISTS weekly_meetings_team_id_week_start_date_key;

-- Step 4: Add the new constraint
-- First check if it already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'weekly_meetings_recurring_meeting_week_unique'
        AND conrelid = 'public.weekly_meetings'::regclass
    ) THEN
        ALTER TABLE public.weekly_meetings 
        ADD CONSTRAINT weekly_meetings_recurring_meeting_week_unique 
        UNIQUE (recurring_meeting_id, week_start_date);
        
        RAISE NOTICE 'Successfully created unique constraint on (recurring_meeting_id, week_start_date)';
    ELSE
        RAISE NOTICE 'Constraint already exists, skipping...';
    END IF;
END $$;

COMMIT;

-- Step 5: Verify the new constraint
SELECT 
    'VERIFICATION' as status,
    conname as constraint_name,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'public.weekly_meetings'::regclass
AND conname = 'weekly_meetings_recurring_meeting_week_unique';

-- Check for any remaining issues
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ No duplicates found'
        ELSE '❌ Duplicates still exist: ' || COUNT(*)::text
    END as duplicate_check
FROM (
    SELECT recurring_meeting_id, week_start_date, COUNT(*) as cnt
    FROM public.weekly_meetings
    WHERE recurring_meeting_id IS NOT NULL
    GROUP BY recurring_meeting_id, week_start_date
    HAVING COUNT(*) > 1
) sub;

