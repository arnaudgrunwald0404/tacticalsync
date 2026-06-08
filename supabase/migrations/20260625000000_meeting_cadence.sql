-- Add recurring event tracking to calendar events
-- and meeting cadence to team members (computed at sync time).

-- 1. Store Google Calendar recurringEventId on each event instance
ALTER TABLE cos_one_on_one_events
  ADD COLUMN IF NOT EXISTS recurring_event_id text;

CREATE INDEX IF NOT EXISTS idx_cos_events_recurring
  ON cos_one_on_one_events(recurring_event_id)
  WHERE recurring_event_id IS NOT NULL;

-- 2. Store computed cadence on the team member (updated during calendar sync)
ALTER TABLE cos_team_members
  ADD COLUMN IF NOT EXISTS meeting_cadence text,         -- 'Weekly', 'Biweekly', 'Monthly', etc.
  ADD COLUMN IF NOT EXISTS meeting_cadence_days integer;  -- average days between meetings (null = no data)
