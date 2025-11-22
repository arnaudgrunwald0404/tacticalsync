-- Extend cascade behavior: when a DO is unlocked, unlock all child SIs
-- We replace the function to handle both transitions (lock and unlock)

CREATE OR REPLACE FUNCTION rcdo_cascade_lock_sis_on_do()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- DO transitioned from unlocked -> locked: lock SIs that are not yet locked
    IF NEW.locked_at IS NOT NULL AND OLD.locked_at IS NULL THEN
      UPDATE rc_strategic_initiatives
      SET
        locked_at = COALESCE(locked_at, now()),
        locked_by = COALESCE(locked_by, auth.uid())
      WHERE defining_objective_id = NEW.id
        AND locked_at IS NULL;

    -- DO transitioned from locked -> unlocked: unlock all SIs under this DO
    ELSIF NEW.locked_at IS NULL AND OLD.locked_at IS NOT NULL THEN
      UPDATE rc_strategic_initiatives
      SET
        locked_at = NULL,
        locked_by = NULL
      WHERE defining_objective_id = NEW.id
        AND locked_at IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate trigger to ensure it's present (idempotent behavior)
DROP TRIGGER IF EXISTS trg_rcdo_cascade_lock_sis_on_do ON rc_defining_objectives;
CREATE TRIGGER trg_rcdo_cascade_lock_sis_on_do
AFTER UPDATE OF locked_at ON rc_defining_objectives
FOR EACH ROW
WHEN (
  (NEW.locked_at IS NOT NULL AND OLD.locked_at IS NULL)
  OR (NEW.locked_at IS NULL AND OLD.locked_at IS NOT NULL)
)
EXECUTE FUNCTION rcdo_cascade_lock_sis_on_do();