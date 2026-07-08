-- Two-way status sync for person-delegated inbox items.
-- Per PLAN_idea8_people_delegation.md §4:
--   1. Delegatee marks their inbox_items copy done -> the delegation row and
--      the delegator's source item both update, without granting the
--      delegatee UPDATE rights on the delegator's row (SECURITY DEFINER
--      trigger functions bypass RLS safely, scoped to exactly this sync).
--   2. Delegator cancels the delegation -> the delegatee's copy is archived
--      so it doesn't sit orphaned in their inbox.

-- ── 1. Delegatee's copy -> delegation row -> delegator's source item ───────

CREATE OR REPLACE FUNCTION fn_sync_delegation_on_delegatee_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delegation inbox_item_delegations%ROWTYPE;
  v_delegatee_name text;
BEGIN
  -- Only act when this row is actually someone's delegatee-side copy.
  SELECT * INTO v_delegation
  FROM inbox_item_delegations
  WHERE delegatee_item_id = NEW.id
    AND status IN ('pending', 'accepted')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Delegatee marked their copy done -> close out the delegation and the
  -- delegator's source item.
  IF NEW.status = 'done' AND OLD.status <> 'done' THEN
    UPDATE inbox_item_delegations
    SET status = 'done', completed_at = now()
    WHERE id = v_delegation.id;

    SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), u.email)
      INTO v_delegatee_name
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    WHERE u.id = v_delegation.delegatee_user_id;

    UPDATE inbox_items
    SET status = 'done',
        done_at = now(),
        workflow_status = NULL,
        active_delegation_id = NULL,
        body = COALESCE(body, '') ||
          CASE WHEN body IS NULL OR body = '' THEN '' ELSE E'\n\n' END ||
          '_Completed by ' || COALESCE(v_delegatee_name, 'delegatee') || ' on ' ||
          to_char(now(), 'Mon DD, YYYY') || '._'
    WHERE id = v_delegation.source_item_id;

  -- Delegatee re-opened a previously accepted/pending item — first accept
  -- signal; not part of the plan's core flow but avoids a stuck 'pending'
  -- delegation once the delegatee starts actually working the item.
  ELSIF v_delegation.status = 'pending' AND NEW.status = 'open' THEN
    UPDATE inbox_item_delegations
    SET status = 'accepted'
    WHERE id = v_delegation.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_delegation_on_delegatee_item_change
  AFTER UPDATE ON inbox_items
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_sync_delegation_on_delegatee_item_change();

COMMENT ON FUNCTION fn_sync_delegation_on_delegatee_item_change() IS
  'SECURITY DEFINER: propagates the delegatee''s own status change on their '
  'inbox_items copy to the shared inbox_item_delegations row and the '
  'delegator''s source inbox_items row, which the delegatee has no RLS grant '
  'to write directly. Scoped to exactly the delegation-sync fields (status, '
  'done_at, active_delegation_id, an appended completion note) — never '
  'touches text/tags/other delegator-owned fields, so it cannot be used as a '
  'general-purpose RLS bypass by the delegatee.';

-- ── 2. Delegator cancels -> archive the delegatee's copy ────────────────────

CREATE OR REPLACE FUNCTION fn_sync_delegation_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.delegatee_item_id IS NOT NULL THEN
    UPDATE inbox_items
    SET status = 'archived',
        archived_at = now()
    WHERE id = NEW.delegatee_item_id
      AND status NOT IN ('done', 'archived');

    UPDATE inbox_items
    SET active_delegation_id = NULL
    WHERE id = NEW.source_item_id
      AND active_delegation_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_delegation_on_cancel
  AFTER UPDATE ON inbox_item_delegations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_sync_delegation_on_cancel();

COMMENT ON FUNCTION fn_sync_delegation_on_cancel() IS
  'SECURITY DEFINER: when a delegator cancels a delegation, archives the '
  'delegatee''s copy (owned by a different user_id, so the delegator has no '
  'direct RLS write access to it) and clears the delegator''s own '
  'active_delegation_id pointer.';
