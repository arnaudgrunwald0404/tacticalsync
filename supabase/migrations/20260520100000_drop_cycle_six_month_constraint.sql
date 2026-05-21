-- Allow manual date editing for cycles by removing the fixed 6-month duration constraint
ALTER TABLE rc_cycles DROP CONSTRAINT IF EXISTS rc_cycles_six_month_duration;

-- Keep basic sanity: end_date must be after start_date
ALTER TABLE rc_cycles ADD CONSTRAINT rc_cycles_end_after_start CHECK (end_date > start_date);
