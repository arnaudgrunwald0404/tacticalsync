-- RCDO delete-in-one-transaction RPCs.
--
-- deleteDO()/deleteInitiative() in src/hooks/useRCDOMutations.ts used to
-- issue several separate PostgREST requests (an rc_links delete, an
-- rc_checkins delete, then the main row delete). Every PostgREST request
-- runs in its own Postgres transaction, so one "delete this DO" user action
-- produced writes spread across 2+ transactions. The rc_deleted_items
-- trash-capture trigger (20260807234142_add_rc_deleted_items_audit_table.sql)
-- has a batch_id that falls back to the transaction id when the app hasn't
-- set app.delete_batch_id, so a multi-transaction delete like the old
-- deleteDO/deleteInitiative landed its rows in multiple batches and
-- restore_deleted_rc_batch (20260807234201_add_restore_deleted_rc_batch_rpc.sql)
-- could only restore part of what a single user action deleted.
--
-- Fix: do the whole delete in one PL/pgSQL function body (one transaction,
-- one batch_id) instead of one PostgREST call per table. Triggers fire
-- regardless of whether the DELETE came from the JS client or from inside a
-- function body, so no changes are needed to the capture layer itself.
--
-- This migration's timestamp sorts after both of the migrations named above,
-- which is required — it doesn't reference rc_deleted_items or
-- capture_deleted_rc_row() directly, but the whole point of doing these
-- deletes in one transaction only pays off once the capture trigger exists
-- to observe that transaction.
--
-- RLS BYPASS — READ BEFORE MODIFYING: both functions below are
-- SECURITY DEFINER (required so the function, not the calling role, owns
-- permission to delete across tables). That bypasses RLS entirely for every
-- statement run inside the function body, so each function starts with an
-- explicit check that replicates the *current* DELETE policy on its target
-- table, confirmed by reading supabase/migrations/20251112100000_make_rcdo_company_wide.sql
-- (the only migration that has ever defined these two DELETE policies —
-- grepped all of supabase/migrations/*.sql for later redefinitions and found
-- none):
--   - rc_defining_objectives: policy "Admins can delete defining objectives"
--     — admin/super-admin ONLY. There is no owner-based exception, unlike
--     the UPDATE policy on the same table.
--   - rc_strategic_initiatives: policy "Initiative owners and admins can
--     delete initiatives" — owner_user_id = auth.uid() OR admin/super-admin.
-- Do not loosen these checks (e.g. to match the app's canLockDO permission
-- helper, which also allows is_rcdo_admin — that helper is broader than the
-- actual DB policy and this pre-existing UI/RLS mismatch is out of scope
-- here) without first updating the underlying RLS policy to match.
--
-- BUG FIX FOUND WHILE PORTING: the old deleteDO/deleteInitiative cleaned up
-- rc_links/rc_checkins for SIs with `.eq('parent_type', 'si')`, but 'si' is
-- not a legal value under either table's parent_type CHECK constraint
-- (rc_links: 'do'|'initiative'; rc_checkins: 'do'|'initiative'|'task', the
-- last added by 20251121224834_add_task_to_checkins.sql) and is never used
-- by any other call site in the app — every real SI-scoped row uses
-- 'initiative' (see e.g. useSIWithProgress.ts, useUserCheckins.ts,
-- CheckInDialog.tsx). So those SI-scoped cleanup deletes have always been
-- silent no-ops. Fixed here to use 'initiative'.

-- ============================================================================
-- delete_rc_do(p_do_id): delete a Defining Objective and everything scoped
-- to it (and its child/sub SIs) in one transaction.
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_rc_do(p_do_id UUID)
RETURNS VOID AS $$
DECLARE
  v_si_ids UUID[];
BEGIN
  -- Replicates "Admins can delete defining objectives" — admin/super-admin only.
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND (p.is_super_admin = true OR p.is_admin = true)
  ) THEN
    RAISE EXCEPTION 'delete_rc_do requires admin privileges';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM rc_defining_objectives d WHERE d.id = p_do_id) THEN
    RAISE EXCEPTION 'rc_defining_objectives % not found', p_do_id;
  END IF;

  -- Looked up server-side instead of trusting a caller-supplied list. This
  -- also picks up sub-SIs (parent_si_id set) for free, since they share the
  -- same defining_objective_id as their parent SI.
  SELECT array_agg(si.id) INTO v_si_ids
  FROM rc_strategic_initiatives si
  WHERE si.defining_objective_id = p_do_id;

  DELETE FROM rc_links WHERE parent_type = 'do' AND parent_id = p_do_id;
  DELETE FROM rc_checkins WHERE parent_type = 'do' AND parent_id = p_do_id;

  IF v_si_ids IS NOT NULL AND array_length(v_si_ids, 1) > 0 THEN
    DELETE FROM rc_links WHERE parent_type = 'initiative' AND parent_id = ANY(v_si_ids);
    DELETE FROM rc_checkins WHERE parent_type = 'initiative' AND parent_id = ANY(v_si_ids);
  END IF;

  -- FK ON DELETE CASCADE handles rc_do_metrics, rc_strategic_initiatives
  -- (including sub-SIs transitively), and those SIs' rc_tasks.
  DELETE FROM rc_defining_objectives WHERE id = p_do_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION delete_rc_do(UUID) IS 'Admin-only (matches the rc_defining_objectives DELETE RLS policy): deletes a DO plus its child/sub-SIs'' rc_links/rc_checkins in one transaction, so a delete-recovery trash capture trigger groups every affected row into a single batch_id.';

-- Default ACL on this project grants EXECUTE to anon/authenticated on new
-- functions regardless of the check inside the body — drop anon, keep
-- authenticated (the admin check above is the real gate), matching the
-- convention in 20260807234201_add_restore_deleted_rc_batch_rpc.sql.
REVOKE EXECUTE ON FUNCTION delete_rc_do(UUID) FROM anon;

-- ============================================================================
-- delete_rc_initiative(p_si_id): delete a Strategic Initiative (or sub-SI)
-- and everything scoped to it in one transaction.
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_rc_initiative(p_si_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rc_strategic_initiatives si WHERE si.id = p_si_id) THEN
    RAISE EXCEPTION 'rc_strategic_initiatives % not found', p_si_id;
  END IF;

  -- Replicates "Initiative owners and admins can delete initiatives" —
  -- owner or admin/super-admin.
  IF NOT EXISTS (
    SELECT 1 FROM rc_strategic_initiatives si
    WHERE si.id = p_si_id
    AND (
      si.owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (p.is_super_admin = true OR p.is_admin = true)
      )
    )
  ) THEN
    RAISE EXCEPTION 'delete_rc_initiative requires ownership or admin privileges';
  END IF;

  DELETE FROM rc_links WHERE parent_type = 'initiative' AND parent_id = p_si_id;
  DELETE FROM rc_checkins WHERE parent_type = 'initiative' AND parent_id = p_si_id;

  -- FK ON DELETE CASCADE handles rc_tasks and any sub-SIs
  -- (rc_strategic_initiatives.parent_si_id).
  DELETE FROM rc_strategic_initiatives WHERE id = p_si_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION delete_rc_initiative(UUID) IS 'Owner- or admin-gated (matches the rc_strategic_initiatives DELETE RLS policy): deletes an SI plus its rc_links/rc_checkins in one transaction, so a delete-recovery trash capture trigger groups every affected row into a single batch_id.';

REVOKE EXECUTE ON FUNCTION delete_rc_initiative(UUID) FROM anon;
