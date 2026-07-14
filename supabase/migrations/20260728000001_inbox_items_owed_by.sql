-- Adds a directionality field to inbox_items: who owes the next response/action
-- on this item. Existing rows are left null (unclassified) — this only powers
-- new extraction/classification going forward, no backfill is attempted since
-- direction can't be reliably inferred from historical rows.
alter table public.inbox_items
  add column if not exists owed_by text check (owed_by in ('me', 'them'));

comment on column public.inbox_items.owed_by is
  'Who owes the next response/action on this item: ''me'' means the user is blocking someone else, ''them'' means the user is waiting on someone else. Null when unclassified.';
