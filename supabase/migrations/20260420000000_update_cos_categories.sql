-- Update cos_priorities category constraint: add 'now', 'this_month', 'next_month'; drop 'april'
ALTER TABLE cos_priorities DROP CONSTRAINT IF EXISTS cos_priorities_category_check;

-- Migrate existing 'april' rows to 'this_month'
UPDATE cos_priorities SET category = 'this_month' WHERE category = 'april';

ALTER TABLE cos_priorities ADD CONSTRAINT cos_priorities_category_check
  CHECK (category IN ('now', 'this_week', 'this_month', 'next_month', 'strategic', 'people'));
