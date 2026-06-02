-- Rename personal_priorities → quarterly_priorities for clarity.
-- Create a view with the old name so existing queries keep working during transition.

ALTER TABLE personal_priorities RENAME TO quarterly_priorities;

-- Backward-compat view (drop once all code references are updated)
CREATE OR REPLACE VIEW personal_priorities AS SELECT * FROM quarterly_priorities;
