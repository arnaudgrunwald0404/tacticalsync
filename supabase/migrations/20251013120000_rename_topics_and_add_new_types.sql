-- Migration: Rename Topics to Priorities and add new meeting item types
-- This migration:
-- 1. Adds new item types: 'priority', 'team_topic', 'action_item'
-- 2. Migrates existing 'topic' items to 'priority'
-- PostgreSQL requires recreating the enum to add and use new values in the same transaction

-- Step 1: Create a temporary new enum with all values
CREATE TYPE public.item_type_new AS ENUM ('agenda', 'topic', 'priority', 'team_topic', 'action_item');

-- Step 2: Add a temporary column with the new type
ALTER TABLE public.meeting_items ADD COLUMN type_new item_type_new;

-- Step 3: Migrate data - convert 'topic' to 'priority', keep others
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

-- Add comment for documentation
COMMENT ON TYPE public.item_type IS 'Types of meeting items: agenda (timed items), priority (important topics with desired outcomes), team_topic (team-specific discussion topics), action_item (tasks and follow-ups)';

