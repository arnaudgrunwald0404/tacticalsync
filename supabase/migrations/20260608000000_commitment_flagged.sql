-- Add "flagged" (red-hot) toggle to priorities and commitments
alter table quarterly_priorities add column if not exists flagged boolean not null default false;
alter table monthly_commitments  add column if not exists flagged boolean not null default false;
