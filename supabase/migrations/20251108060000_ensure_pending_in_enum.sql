-- Ensure completion_status_enum has 'pending' value
-- First, check if the enum exists and has all values

DO $$ 
BEGIN
    -- Check if 'pending' value exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'completion_status_enum' 
        AND e.enumlabel = 'pending'
    ) THEN
        -- Add 'pending' to the enum if it doesn't exist
        ALTER TYPE completion_status_enum ADD VALUE IF NOT EXISTS 'pending';
    END IF;
END $$;

-- Verify all three values exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'completion_status_enum' 
        AND e.enumlabel IN ('completed', 'not_completed', 'pending')
        GROUP BY t.oid
        HAVING COUNT(*) = 3
    ) THEN
        RAISE NOTICE 'completion_status_enum does not have all required values';
    END IF;
END $$;

COMMENT ON TYPE completion_status_enum IS 'Enum for completion status: completed, not_completed, pending';

