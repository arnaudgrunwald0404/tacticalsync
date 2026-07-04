-- The partial unique indexes added in 20260706000000_cos_group_meetings are not
-- usable with Supabase's onConflict upsert (which generates plain
-- ON CONFLICT (cols) without a WHERE clause). Replace the 1:1 partial index
-- with a full named UNIQUE constraint so the edge function upsert resolves correctly.
-- NULL values for team_member_id are distinct in PostgreSQL, so group-meeting
-- rows (team_member_id = NULL) are unaffected.

DROP INDEX IF EXISTS cos_prep_member_date_source_uniq;

ALTER TABLE cos_one_on_one_prep
  DROP CONSTRAINT IF EXISTS cos_one_on_one_prep_member_date_source_unique;

ALTER TABLE cos_one_on_one_prep
  ADD CONSTRAINT cos_one_on_one_prep_member_date_source_unique
  UNIQUE (user_id, team_member_id, prep_date, source);
