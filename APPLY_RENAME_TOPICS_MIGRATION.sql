-- ===================================================================
-- MANUAL MIGRATION: Rename Topics to Priorities and Add New Types
-- ===================================================================
-- Run this script ONCE in your Supabase SQL Editor
-- This script will:
-- 1. Add new meeting item types (priority, team_topic, action_item)
-- 2. Convert existing 'topic' items to 'priority'
-- 3. Keep the enum backward compatible
-- ===================================================================

BEGIN;

-- Step 1: Create a temporary new enum with all values
CREATE TYPE public.item_type_new AS ENUM ('agenda', 'topic', 'priority', 'team_topic', 'action_item');

-- Step 2: Add a temporary column with the new type
ALTER TABLE public.meeting_items ADD COLUMN type_new item_type_new;

-- Step 3: Migrate data - convert 'topic' to 'priority', keep 'agenda'
UPDATE public.meeting_items
SET type_new = CASE 
  WHEN type = 'topic' THEN 'priority'::item_type_new
  ELSE type::text::item_type_new
END;

-- Step 4: Drop the old column and rename the new one
ALTER TABLE public.meeting_items DROP COLUMN type;
ALTER TABLE public.meeting_items RENAME COLUMN type_new TO type;

-- Step 5: Drop the old enum and rename the new one
DROP TYPE public.item_type;
ALTER TYPE public.item_type_new RENAME TO item_type;

-- Step 6: Set the column to not null
ALTER TABLE public.meeting_items ALTER COLUMN type SET NOT NULL;

-- Step 7: Update topic_status table references (if needed)
-- This ensures the topic_status table still works with the new enum

-- Add comment for documentation
COMMENT ON TYPE public.item_type IS 'Types of meeting items: agenda (timed items), priority (important topics with desired outcomes), team_topic (team-specific discussion topics), action_item (tasks and follow-ups)';

COMMIT;

-- Verification queries (run these after the migration)
-- SELECT DISTINCT type FROM public.meeting_items; -- Should show 'agenda' and 'priority' 
-- SELECT enum_range(NULL::public.item_type); -- Should show all enum values

