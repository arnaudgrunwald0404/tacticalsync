-- Add tag_suggestions column to inbox_items.
-- Stores AI-proposed tags: [{ tag_id, tag_name, color, reason }]
-- Items with non-empty suggestions float to top in the UI.
alter table inbox_items
  add column if not exists tag_suggestions jsonb not null default '[]'::jsonb;
