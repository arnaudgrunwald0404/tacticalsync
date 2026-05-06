-- Soft-archive support for cos_priorities
-- Trash icon now sets archived_at instead of hard-deleting rows

ALTER TABLE cos_priorities ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cos_priorities_archived ON cos_priorities(user_id, archived_at)
  WHERE archived_at IS NOT NULL;
