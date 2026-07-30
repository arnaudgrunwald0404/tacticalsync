-- Security fix: inbox_item_delegations' UPDATE policy
-- ("inbox_item_delegations: update as delegator or delegatee",
-- 20260729000005) is row-scoped only — it re-checks that the caller is
-- still named as delegator_user_id/delegatee_user_id on the row, but does
-- NOT re-validate source_item_id, delegatee_item_id, delegator_user_id, or
-- delegatee_user_id themselves. The only guard on those columns
-- (fn_validate_inbox_item_delegation, 20260727000001) fires BEFORE INSERT
-- only, never on UPDATE.
--
-- delegate-inbox-item-to-person (the only legitimate writer of these
-- columns) sets all five identity/FK columns exactly once, at INSERT —
-- nothing in the app ever updates them afterward, so locking them post-
-- insert costs no functionality.
--
-- Exploit this closes:
--   1. Read IDOR: a delegatee rewrites their own delegation row's
--      source_item_id to point at a victim's inbox_items.id. The existing
--      "inbox_items: delegatee can view delegated source item" policy
--      (20260727000001) then grants them SELECT on that victim's item,
--      since it only checks d.source_item_id/d.delegatee_user_id, not who
--      originally created the link.
--   2. Write IDOR: a delegatee rewrites delegatee_item_id to point at one
--      of their own inbox_items rows, and source_item_id to point at a
--      victim's item, then flips their own item's status. The SECURITY
--      DEFINER sync trigger fn_sync_delegation_on_delegatee_item_change
--      (20260727000002) then writes attacker-chosen text into, and marks
--      done, the victim's inbox_items row — trusting source_item_id
--      blindly. A similar path via fn_sync_delegation_on_cancel lets a
--      rewritten delegatee_item_id get an arbitrary victim item archived.

CREATE OR REPLACE FUNCTION fn_lock_inbox_item_delegation_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_item_id IS DISTINCT FROM OLD.source_item_id
     OR NEW.delegatee_item_id IS DISTINCT FROM OLD.delegatee_item_id
     OR NEW.delegator_user_id IS DISTINCT FROM OLD.delegator_user_id
     OR NEW.delegatee_user_id IS DISTINCT FROM OLD.delegatee_user_id
     OR NEW.team_member_id IS DISTINCT FROM OLD.team_member_id
  THEN
    RAISE EXCEPTION 'inbox_item_delegations identity/FK columns (source_item_id, delegatee_item_id, delegator_user_id, delegatee_user_id, team_member_id) are immutable after creation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_inbox_item_delegation_identity
  BEFORE UPDATE ON inbox_item_delegations
  FOR EACH ROW EXECUTE FUNCTION fn_lock_inbox_item_delegation_identity();

COMMENT ON FUNCTION fn_lock_inbox_item_delegation_identity() IS
  'Defense-in-depth: RLS''s UPDATE policy only re-checks who the row names '
  'as delegator/delegatee, not whether source_item_id/delegatee_item_id/'
  'delegator_user_id/delegatee_user_id/team_member_id themselves were '
  'tampered with. This trigger makes those columns immutable post-insert, '
  'closing a cross-user read/write IDOR via the delegation-sync triggers '
  'and the delegatee-can-view-source-item policy.';

-- The SECURITY DEFINER sync trigger functions (fn_sync_delegation_on_cancel,
-- fn_sync_delegation_on_delegatee_item_change, 20260727000002) already only
-- write status/timestamp/note fields on inbox_items, keyed off these now-
-- immutable columns, so no change is needed there once the columns
-- themselves can no longer be forged post-insert.
