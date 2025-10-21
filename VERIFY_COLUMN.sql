-- Verify column exists and its type
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'meeting_items' 
  AND column_name = 'due_date';

-- Show table definition
\d+ meeting_items;
ity tablr