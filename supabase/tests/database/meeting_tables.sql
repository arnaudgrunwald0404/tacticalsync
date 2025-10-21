-- Start transaction and plan the tests
BEGIN;
SELECT plan(42);

-- Test meeting_series_agenda
SELECT has_table('public', 'meeting_series_agenda', 'Table meeting_series_agenda should exist');
SELECT has_column('public', 'meeting_series_agenda', 'id', 'Should have id column');
SELECT has_column('public', 'meeting_series_agenda', 'series_id', 'Should have series_id column');
SELECT has_column('public', 'meeting_series_agenda', 'title', 'Should have title column');
SELECT has_column('public', 'meeting_series_agenda', 'time_minutes', 'Should have time_minutes column');

-- Test meeting_instance_priorities
SELECT has_table('public', 'meeting_instance_priorities', 'Table meeting_instance_priorities should exist');
SELECT has_column('public', 'meeting_instance_priorities', 'id', 'Should have id column');
SELECT has_column('public', 'meeting_instance_priorities', 'instance_id', 'Should have instance_id column');
SELECT has_column('public', 'meeting_instance_priorities', 'title', 'Should have title column');
SELECT has_column('public', 'meeting_instance_priorities', 'completion_status', 'Should have completion_status column');

-- Test meeting_instance_topics
SELECT has_table('public', 'meeting_instance_topics', 'Table meeting_instance_topics should exist');
SELECT has_column('public', 'meeting_instance_topics', 'id', 'Should have id column');
SELECT has_column('public', 'meeting_instance_topics', 'instance_id', 'Should have instance_id column');
SELECT has_column('public', 'meeting_instance_topics', 'title', 'Should have title column');
SELECT has_column('public', 'meeting_instance_topics', 'completion_status', 'Should have completion_status column');

-- Test meeting_series_action_items
SELECT has_table('public', 'meeting_series_action_items', 'Table meeting_series_action_items should exist');
SELECT has_column('public', 'meeting_series_action_items', 'id', 'Should have id column');
SELECT has_column('public', 'meeting_series_action_items', 'series_id', 'Should have series_id column');
SELECT has_column('public', 'meeting_series_action_items', 'title', 'Should have title column');
SELECT has_column('public', 'meeting_series_action_items', 'completion_status', 'Should have completion_status column');

-- Test foreign key constraints
SELECT col_is_fk('public', 'meeting_instance_priorities', 'instance_id', 'Foreign key instance_id should exist');
SELECT col_is_fk('public', 'meeting_instance_topics', 'instance_id', 'Foreign key instance_id should exist');

-- Test check constraints
SELECT col_has_check('public', 'meeting_series_agenda', 'title', 'Title should have check constraint');
SELECT col_has_check('public', 'meeting_series_agenda', 'time_minutes', 'Time minutes should have check constraint');
SELECT col_has_check('public', 'meeting_instance_priorities', 'title', 'Title should have check constraint');
SELECT col_has_check('public', 'meeting_instance_topics', 'title', 'Title should have check constraint');
SELECT col_has_check('public', 'meeting_series_action_items', 'title', 'Title should have check constraint');

-- Test completion_status enum
SELECT has_type('public', 'completion_status_enum', 'Type completion_status_enum should exist');

-- Test indexes
SELECT has_index('public', 'meeting_instance_priorities', 'idx_priorities_completion', 'Should have completion status index');
SELECT has_index('public', 'meeting_instance_topics', 'idx_topics_completion', 'Should have completion status index');
SELECT has_index('public', 'meeting_series_action_items', 'idx_action_items_completion', 'Should have completion status index');
SELECT has_index('public', 'meeting_series_action_items', 'idx_action_items_due_date', 'Should have due date index');

-- Test triggers
SELECT has_trigger('public', 'meeting_series_agenda', 'update_agenda_updated_at', 'Should have updated_at trigger');
SELECT has_trigger('public', 'meeting_instance_priorities', 'update_priorities_updated_at', 'Should have updated_at trigger');
SELECT has_trigger('public', 'meeting_instance_topics', 'update_topics_updated_at', 'Should have updated_at trigger');
SELECT has_trigger('public', 'meeting_series_action_items', 'update_action_items_updated_at', 'Should have updated_at trigger');

-- Test trigger function
SELECT has_function('public', 'update_updated_at_column', 'Should have update_updated_at_column function');
SELECT function_returns('public', 'update_updated_at_column', 'trigger', 'update_updated_at_column should return trigger');

-- Test RLS is enabled
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname = 'meeting_series_agenda'
    AND c.relrowsecurity = true
  ),
  'RLS should be enabled on meeting_series_agenda'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname = 'meeting_instance_priorities'
    AND c.relrowsecurity = true
  ),
  'RLS should be enabled on meeting_instance_priorities'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname = 'meeting_instance_topics'
    AND c.relrowsecurity = true
  ),
  'RLS should be enabled on meeting_instance_topics'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname = 'meeting_series_action_items'
    AND c.relrowsecurity = true
  ),
  'RLS should be enabled on meeting_series_action_items'
);

-- Finish the tests and rollback
SELECT * FROM finish();
ROLLBACK;