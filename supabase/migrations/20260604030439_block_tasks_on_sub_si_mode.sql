-- Hard invariant: a strategic initiative that accepts sub-SIs cannot also hold tasks
-- directly. The SI UI gates this via a disabled "Add Task" button when accepts_sub_sis
-- is TRUE, and `rcdo_convert_si_to_sub_si_mode` reparents existing tasks into a default
-- sub-SI during the flip. This trigger backs the same invariant at the database layer so
-- bulk imports, future feature code, or out-of-band scripts can never put rc_tasks into
-- an inconsistent state.

CREATE OR REPLACE FUNCTION rcdo_block_tasks_on_sub_si_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_accepts_sub_sis BOOLEAN;
BEGIN
  SELECT accepts_sub_sis INTO v_accepts_sub_sis
  FROM rc_strategic_initiatives
  WHERE id = NEW.strategic_initiative_id;

  IF v_accepts_sub_sis IS TRUE THEN
    RAISE EXCEPTION
      'Cannot attach a task to strategic initiative % directly: it accepts sub-initiatives. Attach the task to one of its sub-initiatives instead.',
      NEW.strategic_initiative_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_tasks_on_sub_si_mode ON rc_tasks;
CREATE TRIGGER trg_block_tasks_on_sub_si_mode
  BEFORE INSERT OR UPDATE OF strategic_initiative_id ON rc_tasks
  FOR EACH ROW EXECUTE FUNCTION rcdo_block_tasks_on_sub_si_mode();

-- Symmetric guard on the SI side: flipping an SI into sub-SI mode while it still has
-- direct tasks would orphan those tasks from the UI (which renders the sub-SI tree, not
-- the task list, when accepts_sub_sis is TRUE). The supported conversion path is
-- `rcdo_convert_si_to_sub_si_mode`, which reparents tasks before the flag flips. Reject
-- any direct UPDATE that bypasses that path.

CREATE OR REPLACE FUNCTION rcdo_block_sub_si_mode_with_direct_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_task_count INTEGER;
BEGIN
  IF NEW.accepts_sub_sis IS TRUE AND (OLD.accepts_sub_sis IS DISTINCT FROM TRUE) THEN
    SELECT COUNT(*) INTO v_task_count
    FROM rc_tasks
    WHERE strategic_initiative_id = NEW.id;

    IF v_task_count > 0 THEN
      RAISE EXCEPTION
        'Cannot flip strategic initiative % to accepts_sub_sis=TRUE while it has % direct task(s). Use rcdo_convert_si_to_sub_si_mode to reparent tasks atomically.',
        NEW.id, v_task_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_sub_si_mode_with_direct_tasks ON rc_strategic_initiatives;
CREATE TRIGGER trg_block_sub_si_mode_with_direct_tasks
  BEFORE UPDATE OF accepts_sub_sis ON rc_strategic_initiatives
  FOR EACH ROW EXECUTE FUNCTION rcdo_block_sub_si_mode_with_direct_tasks();
