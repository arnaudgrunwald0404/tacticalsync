-- Lets a user manually exclude specific 1:1s from auto-inclusion.
--
-- categorizeMeeting()'s "<=1 other attendee = 1:1" heuristic misclassifies
-- meetings invited via a single alias/distribution list (e.g. "elt@company.com")
-- as a 1:1 with one person, since Google Calendar's API only ever returns the
-- alias as a single attendee. Attendee count alone can't distinguish that case
-- from a real 1:1, so give the user a manual override instead: keyed by the
-- other attendee's email (stable across recurrences even when Google doesn't
-- expose a recurring_event_id), rather than by event/series id.
ALTER TABLE cos_prep_schedule
  ADD COLUMN IF NOT EXISTS excluded_one_on_one_emails text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN cos_prep_schedule.excluded_one_on_one_emails IS
  'Other-attendee emails the user has manually excluded from 1:1 auto-inclusion (e.g. group aliases misclassified as 1:1s). Checked by daily-prep-batch and agent-tick before qualifying a 1:1 event.';
