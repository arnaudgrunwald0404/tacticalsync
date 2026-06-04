-- Prevent duplicate quarters with the same label + dates.
-- Production was deduped manually on 2026-06-04: two "Q1 2026" rows that
-- predated 20260602155907_make_commitment_quarters_company_wide.sql were
-- merged — 15 priorities + 42 commitments from the losing row were
-- repointed to the surviving row, 9 priorities + 27 commitments from
-- 3 users who had dual-entered were dropped (winner had the more refined
-- copy), and the losing quarter row was deleted.

ALTER TABLE commitment_quarters
  ADD CONSTRAINT commitment_quarters_label_dates_unique
  UNIQUE (label, start_date, end_date);
