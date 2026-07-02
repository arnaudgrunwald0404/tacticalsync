-- Mark any prep batch log rows that have been "running" for more than 1 hour as failed.
-- These are stuck runs that never got a finished_at (process crashed/timed out).
UPDATE cos_prep_batch_log
SET
  status      = 'failed',
  finished_at = now()
WHERE
  status     = 'running'
  AND started_at < now() - INTERVAL '1 hour';

-- Same cleanup for DCI brief log.
UPDATE cos_dci_log
SET
  status      = 'failed',
  finished_at = now()
WHERE
  status     = 'running'
  AND started_at < now() - INTERVAL '1 hour';
