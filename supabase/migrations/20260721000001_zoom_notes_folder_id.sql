-- Stores each user's Zoom Docs "My Notes" folder id once discovered, so the
-- notes sync can list its children on every run instead of relying solely on
-- the type=notes filter (which misses docs that aren't AI Companion output).
ALTER TABLE user_zoom_credentials
  ADD COLUMN IF NOT EXISTS notes_folder_id text;
