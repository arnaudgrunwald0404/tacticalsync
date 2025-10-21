-- Phase 5: Updated At Triggers
-- Create or replace trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to all tables
DROP TRIGGER IF EXISTS update_agenda_updated_at ON meeting_series_agenda;
CREATE TRIGGER update_agenda_updated_at
  BEFORE UPDATE ON meeting_series_agenda
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_priorities_updated_at ON meeting_instance_priorities;
CREATE TRIGGER update_priorities_updated_at
  BEFORE UPDATE ON meeting_instance_priorities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_topics_updated_at ON meeting_instance_topics;
CREATE TRIGGER update_topics_updated_at
  BEFORE UPDATE ON meeting_instance_topics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_action_items_updated_at ON meeting_series_action_items;
CREATE TRIGGER update_action_items_updated_at
  BEFORE UPDATE ON meeting_series_action_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
