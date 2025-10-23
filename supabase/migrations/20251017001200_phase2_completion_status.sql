-- Phase 2: Completion Status Standardization
-- Update meeting_instance_priorities
ALTER TABLE meeting_instance_priorities
  DROP COLUMN IF EXISTS is_completed;

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'meeting_instance_priorities' 
    AND column_name = 'completion_status'
  ) THEN
    -- Drop the default first
    ALTER TABLE meeting_instance_priorities 
      ALTER COLUMN completion_status DROP DEFAULT;
    
    -- Convert to enum
    ALTER TABLE meeting_instance_priorities
      ALTER COLUMN completion_status TYPE completion_status_enum 
      USING CASE 
        WHEN TRIM(completion_status::text) = 'completed' THEN 'completed'::completion_status_enum 
        ELSE 'pending'::completion_status_enum 
      END;
    
    -- Set the new default
    ALTER TABLE meeting_instance_priorities
      ALTER COLUMN completion_status SET DEFAULT 'pending'::completion_status_enum;
  ELSE
    -- Add new column if it doesn't exist
    ALTER TABLE meeting_instance_priorities
      ADD COLUMN completion_status completion_status_enum 
      DEFAULT 'pending'::completion_status_enum NOT NULL;
  END IF;
END $$;

-- Update meeting_instance_topics
ALTER TABLE meeting_instance_topics
  DROP COLUMN IF EXISTS is_completed;

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'meeting_instance_topics' 
    AND column_name = 'completion_status'
  ) THEN
    -- Drop the default first
    ALTER TABLE meeting_instance_topics 
      ALTER COLUMN completion_status DROP DEFAULT;
    
    -- Convert to enum
    ALTER TABLE meeting_instance_topics
      ALTER COLUMN completion_status TYPE completion_status_enum 
      USING CASE 
        WHEN TRIM(completion_status::text) = 'completed' THEN 'completed'::completion_status_enum 
        ELSE 'pending'::completion_status_enum 
      END;
    
    -- Set the new default
    ALTER TABLE meeting_instance_topics
      ALTER COLUMN completion_status SET DEFAULT 'pending'::completion_status_enum;
  ELSE
    -- Add new column if it doesn't exist
    ALTER TABLE meeting_instance_topics
      ADD COLUMN completion_status completion_status_enum 
      DEFAULT 'pending'::completion_status_enum NOT NULL;
  END IF;
END $$;

-- Update meeting_series_action_items
ALTER TABLE meeting_series_action_items
  DROP COLUMN IF EXISTS is_completed;

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'meeting_series_action_items' 
    AND column_name = 'completion_status'
  ) THEN
    -- Drop the default first
    ALTER TABLE meeting_series_action_items 
      ALTER COLUMN completion_status DROP DEFAULT;
    
    -- Convert to enum
    ALTER TABLE meeting_series_action_items
      ALTER COLUMN completion_status TYPE completion_status_enum 
      USING CASE 
        WHEN TRIM(completion_status::text) = 'completed' THEN 'completed'::completion_status_enum 
        ELSE 'pending'::completion_status_enum 
      END;
    
    -- Set the new default
    ALTER TABLE meeting_series_action_items
      ALTER COLUMN completion_status SET DEFAULT 'pending'::completion_status_enum;
  ELSE
    -- Add new column if it doesn't exist
    ALTER TABLE meeting_series_action_items
      ADD COLUMN completion_status completion_status_enum 
      DEFAULT 'pending'::completion_status_enum NOT NULL;
  END IF;
END $$;
