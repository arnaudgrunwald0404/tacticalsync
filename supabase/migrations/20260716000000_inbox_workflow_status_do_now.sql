-- Add 'Do Now' as a workflow status (replaces the ASAP urgency tag as the
-- sidebar's top view — that view now filters on workflow_status = 'Do Now'
-- instead of tag membership). Recreate the CHECK constraint to include it.
ALTER TABLE inbox_items DROP CONSTRAINT IF EXISTS inbox_items_workflow_status_check;
ALTER TABLE inbox_items
  ADD CONSTRAINT inbox_items_workflow_status_check
  CHECK (workflow_status IN ('Do Now', 'Not started', 'Work in progress', 'Waiting on someone', 'Blocked'));
