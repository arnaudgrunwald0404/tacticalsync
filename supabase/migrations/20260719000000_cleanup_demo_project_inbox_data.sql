-- The Inbox demo-seeding helper (src/pages/Inbox.tsx) previously created sample
-- items/tags that referenced real project names (New Altitude, Chrysalis, Rook).
-- That's misleading for any user who sees them on first login. The seeding code
-- has been trimmed to drop project references; this migration cleans up rows
-- that were already written to existing accounts by the old seed logic.
--
-- Only exact-match demo item text is deleted (real user content can't collide
-- with this copy), and tags are only dropped once no items reference them
-- anymore, so real user-created tags/items are left untouched.

DELETE FROM inbox_items
WHERE text IN (
  'Send updated timeline to the Chrysalis stakeholders',
  'Weekly leadership brief: hiring pipeline is 2 weeks behind plan',
  'Customer call recap: they want SSO before renewal',
  'Prep talking points for the board update',
  'New Altitude retro notes: velocity dipped due to onboarding overlap',
  'Draft agenda for Friday''s Rook sync',
  'Confirm Chrysalis demo environment is reset before Thursday',
  'Marcelo: budget approval came through for the Rook contractor'
);

DELETE FROM inbox_tags t
WHERE t.type = 'project'
  AND t.name IN ('New Altitude', 'Chrysalis', 'Rook')
  AND NOT EXISTS (
    SELECT 1 FROM inbox_item_tags it WHERE it.tag_id = t.id
  );

DELETE FROM inbox_tags t
WHERE t.type = 'person'
  AND t.name = 'Marcelo Paiva'
  AND NOT EXISTS (
    SELECT 1 FROM inbox_item_tags it WHERE it.tag_id = t.id
  );
