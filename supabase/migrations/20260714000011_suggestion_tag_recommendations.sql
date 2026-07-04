-- AI-recommended inbox tag destination(s) for a meeting suggestion, computed
-- from the suggestion's content (not meeting attendance). Same shape as
-- inbox_items.tag_suggestions so the frontend can render both the same way.
ALTER TABLE dci_suggested_tasks
  ADD COLUMN IF NOT EXISTS tag_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN dci_suggested_tasks.tag_suggestions IS
  'Up to 2 AI-recommended inbox tag destinations ([{tag_id, tag_name, color, reason}]), computed from suggestion content, not meeting attendance.';
