-- Promote a task into a peer sub-initiative. Available only when the task lives under
-- a sub-SI (i.e., its strategic_initiative_id row has parent_si_id NOT NULL). The new
-- sub-SI inherits the task's metadata; the task itself is deleted (it has *become* the
-- container). Atomic: caller never observes a state where both the task and the new
-- sub-SI coexist.

CREATE OR REPLACE FUNCTION rcdo_promote_task_to_sub_si(p_task_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_title TEXT;
  v_description TEXT;
  v_owner_user_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_container_si_id UUID;
  v_parent_si_id UUID;
  v_defining_objective_id UUID;
  v_parent_accepts_sub_sis BOOLEAN;
  v_next_display_order INTEGER;
  v_new_sub_si_id UUID;
BEGIN
  -- Pull the task we want to promote. completion_criteria becomes the sub-SI
  -- description; target_delivery_date becomes end_date (SI uses end_date, tasks use
  -- target_delivery_date — same concept, different column name).
  SELECT
    title,
    completion_criteria,
    owner_user_id,
    start_date,
    target_delivery_date,
    strategic_initiative_id
  INTO
    v_title,
    v_description,
    v_owner_user_id,
    v_start_date,
    v_end_date,
    v_container_si_id
  FROM rc_tasks
  WHERE id = p_task_id;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Task % not found', p_task_id;
  END IF;

  -- The container_si_id must be a sub-SI (have a parent) for promotion to make sense.
  -- Promoting a task that lives directly under a flat-mode SI is rejected here; the UI
  -- enforces the same gate, but we double-check at the DB layer so a direct RPC call
  -- can't violate the invariant.
  SELECT parent_si_id, defining_objective_id
  INTO v_parent_si_id, v_defining_objective_id
  FROM rc_strategic_initiatives
  WHERE id = v_container_si_id;

  IF v_parent_si_id IS NULL THEN
    RAISE EXCEPTION 'Cannot promote task %: it is not under a sub-initiative. Convert the strategic initiative to sub-initiative mode first.', p_task_id;
  END IF;

  -- Defensive: the parent SI should be in sub-SI mode (otherwise the data is already
  -- inconsistent and we'd be creating an orphaned sub-SI). The no_nested_sub_sis CHECK
  -- guarantees a sub-SI's parent has parent_si_id IS NULL, but we still verify the
  -- accepts_sub_sis flag is TRUE on that parent.
  SELECT accepts_sub_sis
  INTO v_parent_accepts_sub_sis
  FROM rc_strategic_initiatives
  WHERE id = v_parent_si_id;

  IF v_parent_accepts_sub_sis IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot promote task %: parent SI % does not accept sub-initiatives.', p_task_id, v_parent_si_id;
  END IF;

  -- Append the new sub-SI at the end of the existing sibling order so it shows up
  -- below the container the task came from. COALESCE handles the empty-set case (only
  -- possible if a concurrent delete just emptied the sub-SI list, which is benign).
  SELECT COALESCE(MAX(display_order), -1) + 1
  INTO v_next_display_order
  FROM rc_strategic_initiatives
  WHERE parent_si_id = v_parent_si_id;

  INSERT INTO rc_strategic_initiatives (
    defining_objective_id,
    parent_si_id,
    title,
    description,
    owner_user_id,
    start_date,
    end_date,
    status,
    display_order
  ) VALUES (
    v_defining_objective_id,
    v_parent_si_id,
    v_title,
    v_description,
    v_owner_user_id,
    v_start_date,
    v_end_date,
    'not_started',
    v_next_display_order
  )
  RETURNING id INTO v_new_sub_si_id;

  -- Delete the original task. The trigger trg_block_tasks_on_sub_si_mode does not fire
  -- on DELETE (it watches INSERT/UPDATE of strategic_initiative_id only), so this is
  -- safe even after the conversion.
  DELETE FROM rc_tasks WHERE id = p_task_id;

  RETURN v_new_sub_si_id;
END;
$$;
