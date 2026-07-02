alter table inbox_tags
  add column if not exists settings jsonb not null default '{}'::jsonb;
