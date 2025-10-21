-- Phase 3: Foreign Key Updates
-- Update meeting_instance_priorities
ALTER TABLE meeting_instance_priorities 
  DROP CONSTRAINT IF EXISTS meeting_instance_priorities_instance_id_fkey,
  ADD CONSTRAINT meeting_instance_priorities_instance_id_fkey 
    FOREIGN KEY (instance_id) REFERENCES meeting_instances(id) ON DELETE CASCADE;

-- Update meeting_instance_topics
ALTER TABLE meeting_instance_topics 
  DROP CONSTRAINT IF EXISTS meeting_instance_topics_instance_id_fkey,
  ADD CONSTRAINT meeting_instance_topics_instance_id_fkey 
    FOREIGN KEY (instance_id) REFERENCES meeting_instances(id) ON DELETE CASCADE;
