-- Adds exclude_emails to the default calendar_sync_rules JSONB so new rows
-- include the field. Existing rows are unaffected — the client spreads
-- DEFAULT_SYNC_RULES over the stored value, filling in the missing key.

ALTER TABLE cos_settings
  ALTER COLUMN calendar_sync_rules
  SET DEFAULT '{"max_other_attendees":1,"include_relationship_types":["direct_report","collaborator"],"include_titles_regex":null,"exclude_titles_regex":null,"exclude_emails":[],"match_strategy":"email_then_name"}'::jsonb;
