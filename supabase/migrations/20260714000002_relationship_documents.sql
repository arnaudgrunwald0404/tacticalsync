-- Auto-accumulating relationship brief per team member or group meeting.
-- Updated after each prep generation via consolidate-relationship-doc edge function.

CREATE TABLE cos_relationship_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id   uuid REFERENCES cos_team_members(id) ON DELETE CASCADE,
  group_meeting_id uuid REFERENCES cos_group_meetings(id) ON DELETE CASCADE,
  content          text NOT NULL DEFAULT '',
  version_count    integer NOT NULL DEFAULT 0,
  last_updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exactly_one_target CHECK (
    (team_member_id IS NOT NULL)::int + (group_meeting_id IS NOT NULL)::int = 1
  )
);

-- One document per person, one per group
CREATE UNIQUE INDEX rel_doc_member ON cos_relationship_documents(user_id, team_member_id)
  WHERE team_member_id IS NOT NULL;
CREATE UNIQUE INDEX rel_doc_group ON cos_relationship_documents(user_id, group_meeting_id)
  WHERE group_meeting_id IS NOT NULL;

ALTER TABLE cos_relationship_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their relationship docs"
  ON cos_relationship_documents
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
