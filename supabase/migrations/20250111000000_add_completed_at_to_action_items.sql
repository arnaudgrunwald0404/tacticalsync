-- Add completed_at timestamp to track when action items were completed
-- This allows filtering action items by activity period (created_at to completed_at)

ALTER TABLE meeting_series_action_items
ADD COLUMN completed_at TIMESTAMPTZ;

-- Create index for efficient filtering by completion date
CREATE INDEX idx_meeting_series_action_items_completed_at 
ON meeting_series_action_items(completed_at);

-- Add comment explaining the column
COMMENT ON COLUMN meeting_series_action_items.completed_at IS 
'Timestamp when action item was marked as completed. Used to determine activity period for display in meetings.';

-- Create a trigger to automatically set completed_at when status changes to completed
CREATE OR REPLACE FUNCTION set_action_item_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is changing to 'completed' and completed_at is not set, set it now
  IF NEW.completion_status = 'completed' AND OLD.completion_status != 'completed' THEN
    NEW.completed_at = NOW();
  END IF;
  
  -- If status is changing from 'completed' to something else, clear completed_at
  IF NEW.completion_status != 'completed' AND OLD.completion_status = 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER action_item_completion_timestamp
BEFORE UPDATE ON meeting_series_action_items
FOR EACH ROW
EXECUTE FUNCTION set_action_item_completed_at();

-- Backfill completed_at for existing completed items (set to updated_at as best estimate)
UPDATE meeting_series_action_items
SET completed_at = updated_at
WHERE completion_status = 'completed' AND completed_at IS NULL;

