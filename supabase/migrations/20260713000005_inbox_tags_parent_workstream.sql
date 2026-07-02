-- Inbox tags: reconcile schema with application code.
--
-- The frontend (useInboxTags.createWorkstream / createTag) creates tags of type
-- 'workstream' and sets a parent_id, but the original inbox_tags table (migration
-- 20260713000001) neither allowed the 'workstream' type nor had a parent_id column.
-- Those inserts would have failed a CHECK / "column does not exist" error.
-- This migration makes the schema match the code so nested workstream tags persist.

-- 1. Parent pointer for nested tags (workstream → its parent project/context).
ALTER TABLE inbox_tags
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES inbox_tags(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS inbox_tags_parent ON inbox_tags (parent_id) WHERE parent_id IS NOT NULL;

-- 2. Allow the 'workstream' tag type. Recreate the CHECK constraint to include it.
ALTER TABLE inbox_tags DROP CONSTRAINT IF EXISTS inbox_tags_type_check;
ALTER TABLE inbox_tags
  ADD CONSTRAINT inbox_tags_type_check
  CHECK (type IN ('project', 'person', 'urgency', 'folder', 'context', 'workstream'));
