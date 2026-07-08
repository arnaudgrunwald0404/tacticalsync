-- Delegation v2: structured, per-step plan with real execution.
--
-- Replaces the v1 behavior where "seeking_approval" approved a *summary* of
-- work that was never actually taken. `plan` (markdown) is kept as the
-- human-readable narrative; `plan_steps` is the executable contract.

ALTER TABLE inbox_delegations
  ADD COLUMN plan_steps jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN inbox_delegations.plan_steps IS
  'Ordered array of PlanStep objects: { id, order, tool, description, params, status, result?, error?, approved_by?, approved_at?, executed_at?, idempotency_key }. status in (proposed, approved, rejected, running, succeeded, failed, skipped).';

-- Records exactly one execution attempt-outcome per (delegation, step), keyed
-- by idempotency_key. This is the idempotency source of truth: before a step
-- executes, the caller checks this table first. A retried approve on an
-- already-executed step is a no-op that returns the stored result instead of
-- re-running the tool.
CREATE TABLE inbox_delegation_step_executions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id    uuid NOT NULL REFERENCES inbox_delegations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id          text NOT NULL,
  idempotency_key  text NOT NULL,
  tool             text NOT NULL,
  target_table     text,
  target_id        uuid,
  result           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delegation_id, step_id)
);

ALTER TABLE inbox_delegation_step_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read their own step executions"
  ON inbox_delegation_step_executions FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for authenticated users: rows are written
-- exclusively by the service-role edge function.

CREATE INDEX inbox_delegation_step_executions_delegation_id
  ON inbox_delegation_step_executions (delegation_id);

-- Atomically transition one step's status inside plan_steps, guarded by the
-- step's *current* status. `FOR UPDATE` locks the delegation row for the
-- duration of the transaction, so two concurrent requests for the same step
-- (double-click, retried network call, cold-start replay) can't both observe
-- the same "from" status and both apply their transition — the second call
-- always sees the already-updated status and raises `step_not_in_expected_state`.
--
-- p_actor: pass the acting user's id for user-initiated transitions (approve/
-- reject), which are also checked against the delegation's owner. Pass NULL
-- for service-initiated transitions (running/succeeded/failed), which skip
-- the ownership check since the edge function itself is already authorized
-- via the service-role key.
CREATE OR REPLACE FUNCTION try_transition_delegation_step(
  p_delegation_id  uuid,
  p_step_id        text,
  p_from_statuses  text[],
  p_to_status      text,
  p_actor          uuid,
  p_extra          jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_steps jsonb;
  v_owner      uuid;
  v_step       jsonb;
  v_updated    jsonb;
  v_found      boolean := false;
BEGIN
  SELECT plan_steps, user_id INTO v_plan_steps, v_owner
    FROM inbox_delegations
    WHERE id = p_delegation_id
    FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'delegation_not_found';
  END IF;

  IF p_actor IS NOT NULL AND p_actor <> v_owner THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT step INTO v_step
    FROM jsonb_array_elements(v_plan_steps) AS step
    WHERE step->>'id' = p_step_id;

  IF v_step IS NULL THEN
    RAISE EXCEPTION 'step_not_found';
  END IF;

  IF NOT (v_step->>'status' = ANY(p_from_statuses)) THEN
    RAISE EXCEPTION 'step_not_in_expected_state';
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN step->>'id' = p_step_id THEN
        (step || jsonb_build_object('status', p_to_status)) || p_extra
      ELSE step
    END
    ORDER BY (step->>'order')::int
  ) INTO v_updated
  FROM jsonb_array_elements(v_plan_steps) AS step;

  UPDATE inbox_delegations
    SET plan_steps = v_updated, updated_at = now()
    WHERE id = p_delegation_id;

  RETURN v_updated;
END;
$$;

-- Append-only audit trail: who approved/rejected/executed what, when. This is
-- separate from plan_steps (the queryable "current state" projection) and
-- from agent_log (agent narration for the user) — this is the durable record,
-- since a sent Slack message or created meeting topic can't be unsent, and
-- "who approved this" must survive even if plan_steps is later overwritten.
CREATE TABLE inbox_delegation_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id  uuid NOT NULL REFERENCES inbox_delegations(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id        text NOT NULL,
  action         text NOT NULL CHECK (action IN ('approved', 'rejected', 'executed', 'failed')),
  actor_user_id  uuid NOT NULL REFERENCES auth.users(id),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inbox_delegation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read their own delegation audit log"
  ON inbox_delegation_audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated users: this
-- table is append-only and written exclusively by the service-role edge
-- function, so any client-side attempt to write or edit rows is rejected by
-- RLS outright (see src/test/migrations for the corresponding negative test).

CREATE INDEX inbox_delegation_audit_log_delegation_id
  ON inbox_delegation_audit_log (delegation_id);
