-- Same issue as 20260719000000, but for the "Dan Pope" person tag: the Inbox
-- demo seed referenced a real person's name. The seed has been trimmed to
-- drop that reference; this cleans up rows already written to existing
-- accounts by the old seed logic.
--
-- Only exact-match demo item text is deleted, and the tag is only dropped
-- once no items reference it anymore, so any account that genuinely tracks
-- the real Dan Pope keeps that tag and their own items untouched.

DELETE FROM inbox_items
WHERE text IN (
  'Follow up with Dan on the delayed vendor invoice',
  'Dan mentioned the vendor contract renewal is due end of month'
);

DELETE FROM inbox_tags t
WHERE t.type = 'person'
  AND t.name = 'Dan Pope'
  AND NOT EXISTS (
    SELECT 1 FROM inbox_item_tags it WHERE it.tag_id = t.id
  );
