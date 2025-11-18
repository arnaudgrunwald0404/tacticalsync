-- Add parking_lot field to meeting_series table
-- Parking lot is series-level (not instance-specific) and stores notes/topics to revisit
ALTER TABLE meeting_series 
ADD COLUMN IF NOT EXISTS parking_lot TEXT DEFAULT '';

-- Add comment for clarity
COMMENT ON COLUMN meeting_series.parking_lot IS 'Series-level parking lot for notes, ideas, or topics to revisit later. Shared across all instances of this meeting series.';


