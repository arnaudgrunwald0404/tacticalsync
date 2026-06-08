-- Add onboarding completion tracking to cos_settings
ALTER TABLE cos_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed jsonb
    NOT NULL DEFAULT '{"welcome": false, "lists": false, "oneOnOnes": false}'::jsonb;
