-- Per-user prep auto-generation schedule.
-- Each user configures when preps are generated and what inclusion rules to apply.

CREATE TABLE IF NOT EXISTS cos_prep_schedule (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  -- Cron-style hour in UTC (0-23). Default 11 = 4am PT / 7am ET.
  run_hour_utc integer NOT NULL DEFAULT 11 CHECK (run_hour_utc >= 0 AND run_hour_utc <= 23),
  -- Inclusion rules for which meetings qualify as 1-on-1s.
  -- always_include: team member names always treated as 1-on-1 (e.g. "Dan Pope", "Marcelo Paiva")
  -- max_others_after_exclude: after removing always_include people, if this many or fewer
  --   other attendees remain (besides the user), the meeting qualifies.
  --   Default 1 = true 1-on-1. Set to 0 to only match always_include people.
  always_include text[] NOT NULL DEFAULT '{}',
  max_others_after_exclude integer NOT NULL DEFAULT 1,
  -- Also sync Zoom + Slack before generating preps.
  sync_zoom_before boolean NOT NULL DEFAULT true,
  sync_slack_before boolean NOT NULL DEFAULT true,
  slack_channels text[] NOT NULL DEFAULT '{}',
  -- Last run tracking.
  last_run_at timestamptz,
  last_run_status text,
  last_run_preps_generated integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cos_prep_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cos_prep_schedule"
  ON cos_prep_schedule FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cos_prep_schedule_updated_at
  BEFORE UPDATE ON cos_prep_schedule
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
