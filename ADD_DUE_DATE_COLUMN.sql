-- Simple script to add due_date column
DO $$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'meeting_items' 
        AND column_name = 'due_date'
    ) THEN
        -- Add the column if it doesn't exist
        ALTER TABLE meeting_items ADD COLUMN due_date DATE;
        
        -- Add index
        CREATE INDEX IF NOT EXISTS idx_meeting_items_due_date ON meeting_items(due_date);
    END IF;
END $$;
