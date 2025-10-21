-- Create tables first
CREATE TABLE IF NOT EXISTS meeting_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_meeting_id UUID NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_series_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  assigned_to UUID,
  time_minutes INTEGER,
  order_index INTEGER NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_instance_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL,
  title TEXT NOT NULL,
  outcome TEXT NOT NULL,
  activities TEXT NOT NULL,
  assigned_to UUID,
  order_index INTEGER NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_instance_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  assigned_to UUID,
  time_minutes INTEGER,
  order_index INTEGER NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_series_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  assigned_to UUID,
  due_date DATE,
  order_index INTEGER NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);