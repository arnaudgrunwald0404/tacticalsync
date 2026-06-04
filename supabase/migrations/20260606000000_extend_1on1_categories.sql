-- Extend relationship_type to support the full org taxonomy.
ALTER TABLE cos_team_members
  DROP CONSTRAINT IF EXISTS cos_team_members_relationship_type_check;
ALTER TABLE cos_team_members
  ADD CONSTRAINT cos_team_members_relationship_type_check
  CHECK (relationship_type IN (
    'direct_report', 'collaborator', 'boss', 'peer',
    'skip_level', 'stakeholder', 'external'
  ));

-- Make team_member_id nullable so events without a matching member can still be stored.
ALTER TABLE cos_one_on_one_events
  ALTER COLUMN team_member_id DROP NOT NULL;

-- Store the raw attendee info from Google so cards render even without a member row.
ALTER TABLE cos_one_on_one_events
  ADD COLUMN IF NOT EXISTS attendee_name text,
  ADD COLUMN IF NOT EXISTS attendee_email text,
  ADD COLUMN IF NOT EXISTS inferred_category text NOT NULL DEFAULT 'stakeholder';
