-- Add status columns for weekly objectives so they can be scored like daily priorities.
ALTER TABLE cos_dci_logs
  ADD COLUMN IF NOT EXISTS weekly_obj_1_status text,
  ADD COLUMN IF NOT EXISTS weekly_obj_2_status text,
  ADD COLUMN IF NOT EXISTS weekly_obj_3_status text;
