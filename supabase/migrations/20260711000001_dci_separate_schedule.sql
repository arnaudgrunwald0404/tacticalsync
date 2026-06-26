-- Add separate schedule fields for the Daily Brief (DCI) so it can run
-- at a different time than the 1:1 prep batch.
-- Falls back to the shared run_hour_local/timezone for existing rows.

ALTER TABLE cos_prep_schedule
  ADD COLUMN IF NOT EXISTS dci_run_hour_local integer,
  ADD COLUMN IF NOT EXISTS dci_timezone       text;
