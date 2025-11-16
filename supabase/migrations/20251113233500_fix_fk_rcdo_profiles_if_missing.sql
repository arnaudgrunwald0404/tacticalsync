-- Ensure RCDO FKs to profiles exist so PostgREST relationships work
-- This is idempotent: it checks for constraints before adding them.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rc_rallying_cries_owner_user_id_fkey'
      AND table_name = 'rc_rallying_cries'
  ) THEN
    ALTER TABLE rc_rallying_cries
      ADD CONSTRAINT rc_rallying_cries_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rc_rallying_cries_locked_by_fkey'
      AND table_name = 'rc_rallying_cries'
  ) THEN
    ALTER TABLE rc_rallying_cries
      ADD CONSTRAINT rc_rallying_cries_locked_by_fkey
      FOREIGN KEY (locked_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rc_defining_objectives_owner_user_id_fkey'
      AND table_name = 'rc_defining_objectives'
  ) THEN
    ALTER TABLE rc_defining_objectives
      ADD CONSTRAINT rc_defining_objectives_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rc_defining_objectives_locked_by_fkey'
      AND table_name = 'rc_defining_objectives'
  ) THEN
    ALTER TABLE rc_defining_objectives
      ADD CONSTRAINT rc_defining_objectives_locked_by_fkey
      FOREIGN KEY (locked_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rc_strategic_initiatives_owner_user_id_fkey'
      AND table_name = 'rc_strategic_initiatives'
  ) THEN
    ALTER TABLE rc_strategic_initiatives
      ADD CONSTRAINT rc_strategic_initiatives_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;