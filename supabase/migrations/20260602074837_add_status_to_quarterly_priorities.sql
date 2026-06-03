ALTER TABLE quarterly_priorities
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'done', 'not_done'));
