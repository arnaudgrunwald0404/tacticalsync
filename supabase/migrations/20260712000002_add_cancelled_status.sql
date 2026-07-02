-- Allow 'cancelled' as a valid status for manually stopped batch runs.
ALTER TABLE cos_prep_batch_log
  DROP CONSTRAINT IF EXISTS cos_prep_batch_log_status_check;

ALTER TABLE cos_prep_batch_log
  ADD CONSTRAINT cos_prep_batch_log_status_check
  CHECK (status IN ('running', 'ok', 'partial', 'failed', 'cancelled'));
