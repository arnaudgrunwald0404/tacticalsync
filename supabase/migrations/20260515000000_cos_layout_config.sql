-- Drop the category CHECK constraint so custom/new category keys are allowed
-- (next_week, next_quarter, and user-defined custom keys must be storable)
ALTER TABLE cos_priorities DROP CONSTRAINT IF EXISTS cos_priorities_category_check;

-- Add layout config columns to cos_settings
ALTER TABLE cos_settings
  ADD COLUMN IF NOT EXISTS tab_labels jsonb
    DEFAULT '{"priorities":"Priorities","dci":"DCI","team":"Team"}'::jsonb,
  ADD COLUMN IF NOT EXISTS col1_sections jsonb
    DEFAULT '[
      {"key":"now","label":"Now","auto_label":false,"enabled":true},
      {"key":"this_week","label":"This Week","auto_label":false,"enabled":true},
      {"key":"next_week","label":"Next Week","auto_label":false,"enabled":false},
      {"key":"this_month","label":null,"auto_label":true,"enabled":true},
      {"key":"next_month","label":null,"auto_label":true,"enabled":true},
      {"key":"next_quarter","label":null,"auto_label":true,"enabled":false}
    ]'::jsonb,
  ADD COLUMN IF NOT EXISTS col2_sections jsonb
    DEFAULT '[
      {"key":"strategic","label":"Strategic Opportunities","enabled":true},
      {"key":"people","label":"People to Meet","enabled":true}
    ]'::jsonb,
  ADD COLUMN IF NOT EXISTS col3_label text DEFAULT 'Direct Reports';
