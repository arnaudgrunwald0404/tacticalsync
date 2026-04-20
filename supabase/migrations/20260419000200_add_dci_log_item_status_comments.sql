ALTER TABLE cos_dci_logs
  ADD COLUMN IF NOT EXISTS priority_1_status text CHECK (priority_1_status IN ('done', 'in_progress', 'blocked', 'deferred')),
  ADD COLUMN IF NOT EXISTS priority_1_comment text,
  ADD COLUMN IF NOT EXISTS priority_2_status text CHECK (priority_2_status IN ('done', 'in_progress', 'blocked', 'deferred')),
  ADD COLUMN IF NOT EXISTS priority_2_comment text,
  ADD COLUMN IF NOT EXISTS priority_3_status text CHECK (priority_3_status IN ('done', 'in_progress', 'blocked', 'deferred')),
  ADD COLUMN IF NOT EXISTS priority_3_comment text;
