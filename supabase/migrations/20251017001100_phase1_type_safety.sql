-- Phase 1: Type Safety and Validation
DO $$ BEGIN
  CREATE TYPE completion_status_enum AS ENUM ('completed', 'not_completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add title length constraints
DO $$ BEGIN
  ALTER TABLE meeting_series_agenda
    ADD CONSTRAINT check_title_length CHECK (length(title) > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE meeting_instance_priorities
    ADD CONSTRAINT check_title_length CHECK (length(title) > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE meeting_instance_topics
    ADD CONSTRAINT check_title_length CHECK (length(title) > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE meeting_series_action_items
    ADD CONSTRAINT check_title_length CHECK (length(title) > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add other constraints
DO $$ BEGIN
  ALTER TABLE meeting_series_agenda
    ADD CONSTRAINT check_time_minutes CHECK (COALESCE(time_minutes, 0) > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE meeting_instance_priorities
    ADD CONSTRAINT check_outcome_length CHECK (length(outcome) > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE meeting_instance_topics
    ADD CONSTRAINT check_time_minutes CHECK (COALESCE(time_minutes, 0) > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE meeting_series_action_items
    ADD CONSTRAINT check_due_date CHECK (COALESCE(due_date, CURRENT_DATE) >= CURRENT_DATE);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
