-- Fix foreign key relationships for created_by columns
-- The created_by fields should reference profiles.id, not auth.users.id

-- Drop existing foreign key constraints for created_by columns
ALTER TABLE meeting_series_agenda DROP CONSTRAINT IF EXISTS meeting_series_agenda_created_by_fkey;
ALTER TABLE meeting_instance_priorities DROP CONSTRAINT IF EXISTS meeting_instance_priorities_created_by_fkey;
ALTER TABLE meeting_instance_topics DROP CONSTRAINT IF EXISTS meeting_instance_topics_created_by_fkey;
ALTER TABLE meeting_series_action_items DROP CONSTRAINT IF EXISTS meeting_series_action_items_created_by_fkey;

-- Add new foreign key constraints that reference profiles.id
ALTER TABLE meeting_series_agenda 
ADD CONSTRAINT fk_meeting_series_agenda_created_by 
FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE meeting_instance_priorities 
ADD CONSTRAINT fk_meeting_instance_priorities_created_by 
FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE meeting_instance_topics 
ADD CONSTRAINT fk_meeting_instance_topics_created_by 
FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE meeting_series_action_items 
ADD CONSTRAINT fk_meeting_series_action_items_created_by 
FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

-- Add comments to document the relationships
COMMENT ON COLUMN meeting_series_agenda.created_by IS 'User who created this agenda item (references profiles.id)';
COMMENT ON COLUMN meeting_instance_priorities.created_by IS 'User who created this priority (references profiles.id)';
COMMENT ON COLUMN meeting_instance_topics.created_by IS 'User who created this topic (references profiles.id)';
COMMENT ON COLUMN meeting_series_action_items.created_by IS 'User who created this action item (references profiles.id)';
