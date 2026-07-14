-- Enforce "at most one active cycle" at the database level.
--
-- Previously this invariant was only enforced by application code:
-- handleActivateCycle() in src/pages/StrategyHome.tsx and
-- src/pages/CyclePlanner.tsx ran two sequential client-side UPDATEs
-- (archive whatever cycle is currently active, then activate the target
-- cycle). A race between two concurrent activations could leave zero or
-- two cycles with status = 'active' (see docs/SPECIFICATION.md §13 #4).
--
-- This migration adds:
--   1. A partial unique index on rc_cycles that makes it impossible for
--      more than one row to have status = 'active' at any committed
--      instant, regardless of what application code does.
--   2. An rcdo_activate_cycle() RPC that performs the archive-then-activate
--      sequence atomically inside a single function call (Postgres
--      functions execute inside one transaction), so the two writes can no
--      longer be interleaved with a concurrent caller's writes the way two
--      separate .update() calls from the client could be.

-- ============================================================================
-- Step 1: Partial unique index - at most one row with status = 'active'
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS rc_cycles_single_active_idx
  ON rc_cycles ((true))
  WHERE status = 'active';

COMMENT ON INDEX rc_cycles_single_active_idx IS
  'Enforces at most one rc_cycles row with status = ''active'' company-wide. '
  'Indexing the constant expression (true) only for rows matching the '
  'partial WHERE clause means a second concurrent UPDATE/INSERT trying to '
  'set status = ''active'' while one already exists will fail with a unique '
  'violation instead of silently producing two active cycles.';

-- ============================================================================
-- Step 2: rcdo_activate_cycle() - atomic archive-old / activate-new RPC
-- ============================================================================
-- SECURITY INVOKER (the default - no SECURITY DEFINER clause below) so the
-- function runs with the calling user's own privileges: the existing RLS
-- UPDATE policies on rc_cycles ("Cycle creators and admins can update
-- cycles" / "RCDO admins can activate cycles", see
-- 20251112100000_make_rcdo_company_wide.sql and
-- 20251112110000_add_rcdo_admin_role.sql) are evaluated per-row exactly as
-- they are today for direct client .update() calls - only cycle creators,
-- admins, super-admins, or RCDO admins can activate a cycle. Wrapping both
-- writes in one function call just makes them atomic; it does not change
-- who is allowed to call it.
CREATE OR REPLACE FUNCTION rcdo_activate_cycle(p_cycle_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rc_cycles WHERE id = p_cycle_id) THEN
    RAISE EXCEPTION 'Cycle % not found', p_cycle_id;
  END IF;

  -- Archive whatever other cycle is currently active. Excluding the target
  -- cycle itself means activating an already-active cycle is a harmless
  -- no-op rather than a self-archive-then-reactivate.
  UPDATE rc_cycles
  SET status = 'archived',
      updated_at = now()
  WHERE status = 'active'
    AND id <> p_cycle_id;

  UPDATE rc_cycles
  SET status = 'active',
      updated_at = now()
  WHERE id = p_cycle_id;
END;
$$;

COMMENT ON FUNCTION rcdo_activate_cycle(UUID) IS
  'Atomically archives whatever rc_cycles row is currently active and '
  'activates p_cycle_id, replacing the two sequential client-side UPDATEs '
  'previously issued by handleActivateCycle() in StrategyHome.tsx / '
  'CyclePlanner.tsx. SECURITY INVOKER: relies on the caller''s own RLS '
  'UPDATE permissions on rc_cycles, so only cycle creators/admins/'
  'super-admins/RCDO admins can successfully activate a cycle - same as '
  'before. Paired with rc_cycles_single_active_idx, which guarantees that '
  'if two callers race to activate different cycles at once, only one '
  'commits and the other fails with a unique-violation instead of leaving '
  'two active cycles.';

GRANT EXECUTE ON FUNCTION rcdo_activate_cycle(UUID) TO authenticated;
