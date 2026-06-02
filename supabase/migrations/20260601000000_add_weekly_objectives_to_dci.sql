-- Add weekly objective columns to cos_dci_logs.
-- Weekly objectives are set on Monday and persist across the week.
-- They are stored on Monday's row and read from there Tue–Fri.

ALTER TABLE cos_dci_logs
  ADD COLUMN IF NOT EXISTS weekly_obj_1 text,
  ADD COLUMN IF NOT EXISTS weekly_obj_2 text,
  ADD COLUMN IF NOT EXISTS weekly_obj_3 text,
  ADD COLUMN IF NOT EXISTS weekly_obj_1_activities text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS weekly_obj_2_activities text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS weekly_obj_3_activities text[] DEFAULT '{}';
