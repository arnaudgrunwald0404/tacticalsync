-- Phase 4: Performance Indexes
-- Add completion status indexes
CREATE INDEX IF NOT EXISTS idx_priorities_completion 
  ON meeting_instance_priorities(completion_status);
CREATE INDEX IF NOT EXISTS idx_topics_completion 
  ON meeting_instance_topics(completion_status);
CREATE INDEX IF NOT EXISTS idx_action_items_completion 
  ON meeting_series_action_items(completion_status);

-- Add due date index
CREATE INDEX IF NOT EXISTS idx_action_items_due_date 
  ON meeting_series_action_items(due_date);

-- Add composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_priorities_assigned_completion 
  ON meeting_instance_priorities(assigned_to, completion_status);
CREATE INDEX IF NOT EXISTS idx_topics_assigned_completion 
  ON meeting_instance_topics(assigned_to, completion_status);
CREATE INDEX IF NOT EXISTS idx_action_items_assigned_completion 
  ON meeting_series_action_items(assigned_to, completion_status);
