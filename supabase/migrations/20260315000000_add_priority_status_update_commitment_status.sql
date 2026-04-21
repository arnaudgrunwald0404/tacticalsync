-- Add status to personal_priorities; normalize commitment status values
-- New status vocabulary: draft | in_progress | done | not_done

-- ─── personal_priorities: add status column ─────────────────────────────────
ALTER TABLE personal_priorities
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'done', 'not_done'));

-- ─── monthly_commitments: migrate old values, swap constraint ───────────────

-- Map old → new
UPDATE monthly_commitments SET status = 'draft'    WHERE status = 'pending';
UPDATE monthly_commitments SET status = 'not_done' WHERE status = 'at_risk';
-- 'in_progress' and 'done' are unchanged

-- Drop old check constraint (Postgres names it <table>_<col>_check)
ALTER TABLE monthly_commitments
  DROP CONSTRAINT IF EXISTS monthly_commitments_status_check;

-- Add new constraint
ALTER TABLE monthly_commitments
  ADD CONSTRAINT monthly_commitments_status_check
    CHECK (status IN ('draft', 'in_progress', 'done', 'not_done'));

-- Update default to match new vocabulary
ALTER TABLE monthly_commitments
  ALTER COLUMN status SET DEFAULT 'draft';
