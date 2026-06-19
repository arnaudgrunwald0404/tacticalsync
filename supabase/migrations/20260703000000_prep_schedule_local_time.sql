-- Replace the DST-broken fixed UTC run hour with a timezone-aware local run hour.
--
-- Previously cos_prep_schedule stored run_hour_utc (a fixed UTC hour) but the UI
-- labelled it "local time", so the scheduled time silently drifted an hour across
-- DST boundaries. We now store run_hour_local (0-23) interpreted against the
-- existing IANA `timezone` column; daily-prep-batch matches run_hour_local against
-- the current hour in each user's timezone, keeping schedules DST-correct.
--
-- run_hour_utc is retained (no longer written) to avoid a destructive drop.

ALTER TABLE cos_prep_schedule
  ADD COLUMN IF NOT EXISTS run_hour_local integer NOT NULL DEFAULT 8
    CHECK (run_hour_local >= 0 AND run_hour_local <= 23);

-- Backfill so existing schedules keep firing at the same instant.
-- For UTC users (the default) local hour == old UTC hour. For users with a real
-- IANA timezone, convert the stored UTC hour into their local hour.
UPDATE cos_prep_schedule
SET run_hour_local = EXTRACT(
  HOUR FROM (
    (current_date + make_time(run_hour_utc, 0, 0)) AT TIME ZONE 'UTC'
  ) AT TIME ZONE COALESCE(NULLIF(timezone, ''), 'UTC')
)::int
WHERE run_hour_utc IS NOT NULL;

COMMENT ON COLUMN cos_prep_schedule.run_hour_local IS
  'Hour of day (0-23) in the user''s `timezone` at which the daily batch runs. Replaces run_hour_utc (DST-safe).';
COMMENT ON COLUMN cos_prep_schedule.run_hour_utc IS
  'DEPRECATED: fixed UTC hour, DST-unsafe. Superseded by run_hour_local + timezone. Retained for back-compat; no longer written.';
