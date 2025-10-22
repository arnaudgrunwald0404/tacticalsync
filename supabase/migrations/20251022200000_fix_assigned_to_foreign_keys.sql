-- Fix foreign key relationships for assigned_to columns
-- This migration adds proper foreign key constraints to ensure PostgREST can find relationships

-- Add foreign key constraints for assigned_to columns
-- These constraints link assigned_to to the profiles table

-- meeting_series_agenda.assigned_to -> profiles.id
ALTER TABLE meeting_series_agenda 
ADD CONSTRAINT fk_meeting_series_agenda_assigned_to 
FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

-- meeting_instance_priorities.assigned_to -> profiles.id  
ALTER TABLE meeting_instance_priorities
ADD CONSTRAINT fk_meeting_instance_priorities_assigned_to
FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

-- meeting_instance_topics.assigned_to -> profiles.id
ALTER TABLE meeting_instance_topics
ADD CONSTRAINT fk_meeting_instance_topics_assigned_to
FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

-- meeting_series_action_items.assigned_to -> profiles.id
ALTER TABLE meeting_series_action_items
ADD CONSTRAINT fk_meeting_series_action_items_assigned_to
FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

-- Add comments to document the relationships
COMMENT ON COLUMN meeting_series_agenda.assigned_to IS 'User assigned to this agenda item (references profiles.id)';
COMMENT ON COLUMN meeting_instance_priorities.assigned_to IS 'User assigned to this priority (references profiles.id)';
COMMENT ON COLUMN meeting_instance_topics.assigned_to IS 'User assigned to this topic (references profiles.id)';
COMMENT ON COLUMN meeting_series_action_items.assigned_to IS 'User assigned to this action item (references profiles.id)';
