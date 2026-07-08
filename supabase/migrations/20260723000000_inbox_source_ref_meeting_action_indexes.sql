-- Unified funnel (Idea #1): partial expression indexes to support fast
-- dedupe lookups when syncing meeting/1:1 action items into inbox_items.
--
-- source_ref is unindexed jsonb today (see 20260713000001_inbox_tables.sql).
-- The sync triggers added in the following migrations look up an existing
-- mirrored inbox_items row by `source_ref->>'type'` + `source_ref->>'id'` on
-- every INSERT/UPDATE of the source tables, so this needs to be fast rather
-- than a sequential scan per write.

CREATE INDEX IF NOT EXISTS inbox_items_source_ref_meeting_action
  ON inbox_items ((source_ref->>'id'))
  WHERE source_ref->>'type' = 'meeting_action_item';

CREATE INDEX IF NOT EXISTS inbox_items_source_ref_cos_action
  ON inbox_items ((source_ref->>'id'))
  WHERE source_ref->>'type' = 'cos_meeting_action';
