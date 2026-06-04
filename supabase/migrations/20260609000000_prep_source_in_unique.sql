-- Include source in the unique constraint so AI-generated and legacy preps
-- coexist for the same member + date without overwriting each other.

ALTER TABLE cos_one_on_one_prep
  DROP CONSTRAINT IF EXISTS cos_one_on_one_prep_member_date_unique;

ALTER TABLE cos_one_on_one_prep
  ADD CONSTRAINT cos_one_on_one_prep_member_date_source_unique
  UNIQUE (user_id, team_member_id, prep_date, source);
