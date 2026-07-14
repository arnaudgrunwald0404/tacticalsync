-- RCDO stale-metric / stale-check-in alerts (docs/SPECIFICATION.md §14
-- roadmap item): rcdo-stale-check (a new scheduled edge function) Slack-DMs
-- the owner of a Defining Objective, Strategic Initiative, or DO metric that
-- has gone quiet for too long inside the active cycle.
--
-- Neither rc_defining_objectives/rc_strategic_initiatives (check-ins) nor
-- rc_do_metrics (metric values) has any existing "last nudged" marker, so a
-- naive re-run of the check would re-DM the owner every single time the
-- function fires. Add one throttle column per table, following the same
-- shape rc_do_metrics.last_updated_at already uses — set once, read back on
-- the next run to decide whether the cooldown window has passed. See
-- supabase/functions/_shared/rcdoStaleness.ts for the cooldown length.

ALTER TABLE rc_defining_objectives
  ADD COLUMN IF NOT EXISTS last_stale_nudge_at TIMESTAMPTZ;

ALTER TABLE rc_strategic_initiatives
  ADD COLUMN IF NOT EXISTS last_stale_nudge_at TIMESTAMPTZ;

ALTER TABLE rc_do_metrics
  ADD COLUMN IF NOT EXISTS last_stale_nudge_at TIMESTAMPTZ;
