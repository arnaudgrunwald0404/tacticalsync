-- Cascade-lock Strategic Initiatives when a Defining Objective is locked
-- When rc_defining_objectives.locked_at transitions from NULL -> timestamp,
-- lock all child rc_strategic_initiatives (set locked_at if not already locked).

CREATE OR REPLACE FUNCTION rcdo_cascade_lock_sis_on_do()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only act on transitions from unlocked -> locked
  IF TG_OP = 'UPDATE' THEN
    IF NEW.locked_at IS NOT NULL AND OLD.locked_at IS NULL THEN
      UPDATE rc_strategic_initiatives
      SET
        locked_at = COALESCE(locked_at, now()),
        locked_by = COALESCE(locked_by, auth.uid())
      WHERE defining_objective_id = NEW.id
        AND locked_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Replace trigger if it exists
DROP TRIGGER IF EXISTS trg_rcdo_cascade_lock_sis_on_do ON rc_defining_objectives;
CREATE TRIGGER trg_rcdo_cascade_lock_sis_on_do
AFTER UPDATE OF locked_at ON rc_defining_objectives
FOR EACH ROW
WHEN (NEW.locked_at IS NOT NULL AND OLD.locked_at IS NULL)
EXECUTE FUNCTION rcdo_cascade_lock_sis_on_do();