-- Sub-Strategic Initiatives: one level of hierarchy under rc_strategic_initiatives.
-- An SI either holds tasks directly (accepts_sub_sis = FALSE, default) or holds sub-SIs
-- (accepts_sub_sis = TRUE). Sub-SIs are rows with parent_si_id set; they inherit the
-- parent's defining_objective_id so existing RLS via DO -> RC -> cycle -> team works
-- unchanged. Sub-SIs cannot themselves accept sub-SIs (no nesting beyond one level).

ALTER TABLE rc_strategic_initiatives
  ADD COLUMN IF NOT EXISTS parent_si_id UUID REFERENCES rc_strategic_initiatives(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS accepts_sub_sis BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  ALTER TABLE rc_strategic_initiatives
    ADD CONSTRAINT no_nested_sub_sis CHECK (parent_si_id IS NULL OR accepts_sub_sis = FALSE);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_rc_strategic_initiatives_parent_si_id
  ON rc_strategic_initiatives(parent_si_id);

-- Top-level SIs only (parent_si_id IS NULL). List queries should read from this view
-- so newly added sub-SIs never accidentally appear as DO children.
CREATE OR REPLACE VIEW rc_top_level_strategic_initiatives AS
  SELECT * FROM rc_strategic_initiatives WHERE parent_si_id IS NULL;

-- Atomic conversion: flip an SI to "accepts sub-SIs" mode while it has existing direct
-- tasks. Creates a default sub-SI and reparents every task under it. Caller's identity
-- (auth.uid()) is preserved so RLS UPDATE policies on rc_strategic_initiatives /
-- rc_tasks apply normally.
CREATE OR REPLACE FUNCTION rcdo_convert_si_to_sub_si_mode(p_si_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_do_id UUID;
  v_already_converted BOOLEAN;
  v_is_sub_si BOOLEAN;
  v_new_sub_si_id UUID;
BEGIN
  SELECT defining_objective_id, accepts_sub_sis, parent_si_id IS NOT NULL
  INTO v_do_id, v_already_converted, v_is_sub_si
  FROM rc_strategic_initiatives
  WHERE id = p_si_id;

  IF v_do_id IS NULL THEN
    RAISE EXCEPTION 'Strategic initiative % not found', p_si_id;
  END IF;

  IF v_is_sub_si THEN
    RAISE EXCEPTION 'Cannot convert a sub-initiative to accept sub-initiatives (nesting cap is one level)';
  END IF;

  IF v_already_converted THEN
    RAISE EXCEPTION 'Strategic initiative % already accepts sub-initiatives', p_si_id;
  END IF;

  INSERT INTO rc_strategic_initiatives (
    defining_objective_id,
    parent_si_id,
    title,
    status,
    display_order
  ) VALUES (
    v_do_id,
    p_si_id,
    'Sub-initiative 1',
    'not_started',
    0
  )
  RETURNING id INTO v_new_sub_si_id;

  UPDATE rc_tasks
  SET strategic_initiative_id = v_new_sub_si_id
  WHERE strategic_initiative_id = p_si_id;

  UPDATE rc_strategic_initiatives
  SET accepts_sub_sis = TRUE
  WHERE id = p_si_id;

  RETURN v_new_sub_si_id;
END;
$$;
