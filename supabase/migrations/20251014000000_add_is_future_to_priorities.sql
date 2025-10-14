-- Add is_future column to meeting_items for priorities that carry forward
ALTER TABLE public.meeting_items ADD COLUMN IF NOT EXISTS is_future BOOLEAN DEFAULT FALSE;

-- Add index for faster queries on future items
CREATE INDEX IF NOT EXISTS idx_meeting_items_is_future ON public.meeting_items(is_future) WHERE is_future = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN public.meeting_items.is_future IS 'When true, this priority will be copied to the next meeting iteration until marked as false';

