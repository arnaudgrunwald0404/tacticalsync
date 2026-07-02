ALTER TABLE inbox_items
  ADD COLUMN IF NOT EXISTS workflow_status text
    CHECK (workflow_status IN ('Not started', 'Work in progress', 'Waiting on someone', 'Blocked'));
