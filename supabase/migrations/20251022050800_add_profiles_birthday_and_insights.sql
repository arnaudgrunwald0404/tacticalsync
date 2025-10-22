-- Migration: Add birthday and Insights percentages to profiles
-- Description: Adds birthday (DATE) and red/blue/green/yellow percentage (INTEGER) columns to public.profiles
-- This is safe to run multiple times.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS red_percentage INTEGER,
  ADD COLUMN IF NOT EXISTS blue_percentage INTEGER,
  ADD COLUMN IF NOT EXISTS green_percentage INTEGER,
  ADD COLUMN IF NOT EXISTS yellow_percentage INTEGER;

-- Ask PostgREST to reload its schema cache so the new columns are visible immediately
DO $$ BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN undefined_object THEN
  -- In case PostgREST isn't running/listening in this environment, ignore
  NULL;
END $$;

COMMIT;
