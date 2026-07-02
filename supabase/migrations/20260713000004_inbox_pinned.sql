ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS inbox_items_pinned ON inbox_items (user_id, pinned) WHERE pinned = true;
