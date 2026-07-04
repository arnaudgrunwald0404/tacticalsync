-- Marks suggestions intended for a colleague to action (vs. the user's own inbox).
-- When assignee_member_id IS NOT NULL, the suggestion appears in that person's prep
-- drawer for the user to approve/dismiss rather than in the user's own suggestions panel.
ALTER TABLE dci_suggested_tasks
  ADD COLUMN IF NOT EXISTS assignee_member_id uuid
    REFERENCES cos_team_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN dci_suggested_tasks.assignee_member_id IS
  'When set, this action item is assigned to the named colleague; shown in their prep drawer for the user to approve/dismiss.';

CREATE INDEX IF NOT EXISTS idx_dci_suggested_tasks_assignee
  ON dci_suggested_tasks(assignee_member_id)
  WHERE assignee_member_id IS NOT NULL;
