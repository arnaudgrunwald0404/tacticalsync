-- Fix rc_links.created_by foreign key to reference profiles(id)
-- Required for PostgREST relationship embedding: creator:profiles!created_by

ALTER TABLE rc_links
  DROP CONSTRAINT IF EXISTS rc_links_created_by_fkey,
  ADD CONSTRAINT rc_links_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

COMMENT ON COLUMN rc_links.created_by IS 'User who created the link (references profiles.id)';