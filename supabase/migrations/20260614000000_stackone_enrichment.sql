-- Add StackOne enrichment toggle to prep schedule
ALTER TABLE cos_prep_schedule
  ADD COLUMN IF NOT EXISTS enrich_stackone boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cos_prep_schedule.enrich_stackone
  IS 'When true, pull HRIS/ticketing/CRM data from StackOne during prep generation';
