-- Seed Beem agenda template and add RLS policies for system template editing
-- This migration creates the Beem template with 6 standard agenda items
-- and ensures only superadmin (agrunwald@clearcompany.com) can edit system templates

-- Insert Beem system template
INSERT INTO agenda_templates (id, name, description, is_system, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Beem Weekly Meeting',
  'Standard Beem agenda template with opening comments, action items review, priority setting, scorecard, and risk assessment',
  true,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  updated_at = now();

-- Insert template items
INSERT INTO agenda_template_items (template_id, title, duration_minutes, order_index, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Opening Comments', 2, 1, now()),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Past Action Items', 4, 2, now()),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Calendar Review', 2, 3, now()),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Priority Review + Setting', 10, 4, now()),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Team Scorecard', 10, 5, now()),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Employees At-Risk', 10, 6, now())
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on both tables (if not already enabled)
ALTER TABLE agenda_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_template_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read templates/items
DROP POLICY IF EXISTS "Anyone can read templates" ON agenda_templates;
CREATE POLICY "Anyone can read templates" ON agenda_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read template items" ON agenda_template_items;
CREATE POLICY "Anyone can read template items" ON agenda_template_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users can create/edit their own templates (user_id matches)
-- Superadmin can edit system templates
DROP POLICY IF EXISTS "Users manage own templates" ON agenda_templates;
CREATE POLICY "Users manage own templates" ON agenda_templates
  FOR ALL USING (
    auth.uid() = user_id OR
    (is_system = true AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND email = 'agrunwald@clearcompany.com'
    ))
  );

DROP POLICY IF EXISTS "Users manage own template items" ON agenda_template_items;
CREATE POLICY "Users manage own template items" ON agenda_template_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM agenda_templates t
      WHERE t.id = agenda_template_items.template_id
      AND (
        auth.uid() = t.user_id OR
        (t.is_system = true AND EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() 
          AND email = 'agrunwald@clearcompany.com'
        ))
      )
    )
  );

-- Add comments to document the changes
COMMENT ON TABLE agenda_templates IS 'Agenda templates for meetings - includes system templates editable by superadmin only';
COMMENT ON COLUMN agenda_templates.is_system IS 'System templates are managed by superadmin (agrunwald@clearcompany.com)';
COMMENT ON TABLE agenda_template_items IS 'Individual agenda items within templates';
