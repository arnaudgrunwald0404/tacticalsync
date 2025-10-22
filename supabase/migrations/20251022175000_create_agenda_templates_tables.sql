-- Create agenda_templates and agenda_template_items tables
-- These tables support both user-created templates and system templates

-- Create agenda_templates table
CREATE TABLE IF NOT EXISTS agenda_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create agenda_template_items table
CREATE TABLE IF NOT EXISTS agenda_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES agenda_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_minutes INTEGER,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agenda_templates_user_id ON agenda_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_agenda_templates_is_system ON agenda_templates(is_system);
CREATE INDEX IF NOT EXISTS idx_agenda_template_items_template_id ON agenda_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_agenda_template_items_order ON agenda_template_items(template_id, order_index);

-- Add comments to document the tables
COMMENT ON TABLE agenda_templates IS 'Agenda templates for meetings - includes both user-created and system templates';
COMMENT ON TABLE agenda_template_items IS 'Individual agenda items within templates';
COMMENT ON COLUMN agenda_templates.is_system IS 'System templates are managed by superadmin only';
COMMENT ON COLUMN agenda_templates.user_id IS 'NULL for system templates, user ID for user-created templates';
