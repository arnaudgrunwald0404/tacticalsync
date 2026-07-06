-- Add priority_due_at to inbox_items — an informal "gut feel" due date set via
-- Prioritize mode's per-row pills (now / +1d / +3d / +1w / +2w / +1m). It is a
-- plain timestamp, not a status: the tier shown in the UI is derived from how
-- much time remains until this date, so it naturally decays toward more urgent
-- tiers as time passes without needing its own stored value.
alter table inbox_items
  add column if not exists priority_due_at timestamptz;

create index if not exists idx_inbox_items_priority_due_at
  on inbox_items (priority_due_at);

-- Picking a tier pill (now/1d/3d/.../1m) sets priority_due_at but leaves it
-- "loosey goosey": the displayed tier decays over time (see currentPriorityTier
-- in inboxValidation.ts). Picking a calendar date instead sets a hard due date
-- that does NOT decay — priority_fixed distinguishes the two.
alter table inbox_items
  add column if not exists priority_fixed boolean not null default false;
