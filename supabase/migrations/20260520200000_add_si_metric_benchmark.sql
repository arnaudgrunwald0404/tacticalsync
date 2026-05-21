-- Add dedicated columns for success metric and benchmark on strategic initiatives
ALTER TABLE rc_strategic_initiatives ADD COLUMN IF NOT EXISTS primary_success_metric TEXT;
ALTER TABLE rc_strategic_initiatives ADD COLUMN IF NOT EXISTS benchmark TEXT;
