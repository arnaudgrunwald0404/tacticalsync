-- Add user-configurable status to cos_priorities and a settings table

-- Free-text status column on priorities (no fixed enum — user defines options in cos_settings)
ALTER TABLE cos_priorities
  ADD COLUMN IF NOT EXISTS status text DEFAULT NULL;

-- Per-user Chief of Staff settings (status options, extensible)
CREATE TABLE IF NOT EXISTS cos_settings (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status_options jsonb NOT NULL DEFAULT '["WIP","WOS","Done"]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cos_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_settings"
  ON cos_settings FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
