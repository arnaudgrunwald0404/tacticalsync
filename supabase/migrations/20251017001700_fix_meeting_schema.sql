-- Create the missing meeting_series table
CREATE TABLE IF NOT EXISTS meeting_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'bi-weekly', 'monthly')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix the meeting_instances table to reference meeting_series instead of recurring_meetings
ALTER TABLE meeting_instances 
DROP COLUMN IF EXISTS recurring_meeting_id,
ADD COLUMN IF NOT EXISTS series_id UUID NOT NULL REFERENCES meeting_series(id) ON DELETE CASCADE;

-- Add foreign key constraints for the meeting tables (only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_series_agenda_series_id_fkey') THEN
        ALTER TABLE meeting_series_agenda 
        ADD CONSTRAINT meeting_series_agenda_series_id_fkey 
        FOREIGN KEY (series_id) REFERENCES meeting_series(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_series_action_items_series_id_fkey') THEN
        ALTER TABLE meeting_series_action_items 
        ADD CONSTRAINT meeting_series_action_items_series_id_fkey 
        FOREIGN KEY (series_id) REFERENCES meeting_series(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_instance_priorities_instance_id_fkey') THEN
        ALTER TABLE meeting_instance_priorities 
        ADD CONSTRAINT meeting_instance_priorities_instance_id_fkey 
        FOREIGN KEY (instance_id) REFERENCES meeting_instances(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_instance_topics_instance_id_fkey') THEN
        ALTER TABLE meeting_instance_topics 
        ADD CONSTRAINT meeting_instance_topics_instance_id_fkey 
        FOREIGN KEY (instance_id) REFERENCES meeting_instances(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add completion_status columns with proper defaults
ALTER TABLE meeting_series_agenda 
ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'not_started' 
CHECK (completion_status IN ('not_started', 'in_progress', 'completed'));

ALTER TABLE meeting_series_action_items 
ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'not_started' 
CHECK (completion_status IN ('not_started', 'in_progress', 'completed'));

ALTER TABLE meeting_instance_priorities 
ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'not_started' 
CHECK (completion_status IN ('not_started', 'in_progress', 'completed'));

ALTER TABLE meeting_instance_topics 
ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'not_started' 
CHECK (completion_status IN ('not_started', 'in_progress', 'completed'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_meeting_series_team_id ON meeting_series(team_id);
CREATE INDEX IF NOT EXISTS idx_meeting_instances_series_id ON meeting_instances(series_id);
CREATE INDEX IF NOT EXISTS idx_meeting_series_agenda_series_id ON meeting_series_agenda(series_id);
CREATE INDEX IF NOT EXISTS idx_meeting_series_action_items_series_id ON meeting_series_action_items(series_id);
CREATE INDEX IF NOT EXISTS idx_meeting_instance_priorities_instance_id ON meeting_instance_priorities(instance_id);
CREATE INDEX IF NOT EXISTS idx_meeting_instance_topics_instance_id ON meeting_instance_topics(instance_id);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_meeting_series_updated_at 
    BEFORE UPDATE ON meeting_series 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_instances_updated_at 
    BEFORE UPDATE ON meeting_instances 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_series_agenda_updated_at 
    BEFORE UPDATE ON meeting_series_agenda 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_series_action_items_updated_at 
    BEFORE UPDATE ON meeting_series_action_items 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_instance_priorities_updated_at 
    BEFORE UPDATE ON meeting_instance_priorities 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_instance_topics_updated_at 
    BEFORE UPDATE ON meeting_instance_topics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE meeting_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_series_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_series_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_instance_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_instance_topics ENABLE ROW LEVEL SECURITY;

-- RLS policies are already created in the previous migration
