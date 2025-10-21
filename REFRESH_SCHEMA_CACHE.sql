-- Force schema cache refresh
BEGIN;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

-- Alternative method to force schema refresh
COMMENT ON COLUMN meeting_items.due_date IS 'Due date for action items';

COMMIT;
