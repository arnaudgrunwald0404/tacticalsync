ALTER TABLE cos_priorities ADD COLUMN IF NOT EXISTS done_at timestamptz DEFAULT NULL;
