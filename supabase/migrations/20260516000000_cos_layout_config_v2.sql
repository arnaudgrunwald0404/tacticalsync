-- Add unified layout_config column to cos_settings.
-- Old columns (tab_labels, col1_sections, col2_sections, col3_label) are kept
-- intact so that first-load migration logic in the app can reconstruct settings
-- for users who have not yet saved the new format.
ALTER TABLE cos_settings
  ADD COLUMN IF NOT EXISTS layout_config jsonb DEFAULT NULL;
