-- Allow SIs and tasks to have no owner assigned
-- When importing from markdown, unmatched owner names should result in NULL
-- rather than defaulting to the importing user.
ALTER TABLE rc_strategic_initiatives ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE rc_tasks ALTER COLUMN owner_user_id DROP NOT NULL;
