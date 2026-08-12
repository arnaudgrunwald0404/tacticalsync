-- Restore RPC for the rc_deleted_items trash capture layer added in
-- 20260807234142_add_rc_deleted_items_audit_table.sql.
-- Admins call restore_deleted_rc_batch(batch_id) to reinsert every
-- not-yet-restored row in a batch, in FK-safe order.

CREATE OR REPLACE FUNCTION restore_deleted_rc_batch(p_batch_id TEXT)
RETURNS TABLE(source_table TEXT, restored_count INTEGER, skipped_count INTEGER) AS $$
DECLARE
  r RECORD;
  v_pass INTEGER := 0;
  v_progress BOOLEAN;
  v_last_error TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND (p.is_super_admin = true OR p.is_admin = true)
  ) THEN
    RAISE EXCEPTION 'restore_deleted_rc_batch requires admin privileges';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM rc_deleted_items di WHERE di.batch_id = p_batch_id) THEN
    RAISE EXCEPTION 'No rc_deleted_items rows found for batch_id %', p_batch_id;
  END IF;

  -- Rows are reinserted table-by-table in FK dependency order, but a table
  -- can also self-reference within a batch (rc_strategic_initiatives.parent_si_id
  -- for sub-SIs cascaded from their parent). Rather than hand-rolling a full
  -- topological sort, loop passes over the remaining rows and let each pass
  -- pick up whatever now has its dependencies satisfied; stop once a pass
  -- makes no progress.
  LOOP
    v_pass := v_pass + 1;
    v_progress := FALSE;

    FOR r IN
      SELECT di.* FROM rc_deleted_items di
      WHERE di.batch_id = p_batch_id AND di.restored_at IS NULL
      ORDER BY
        CASE di.table_name
          WHEN 'rc_defining_objectives' THEN 1
          WHEN 'rc_do_metrics' THEN 2
          WHEN 'rc_strategic_initiatives' THEN 3
          WHEN 'rc_tasks' THEN 4
          WHEN 'rc_links' THEN 5
          WHEN 'rc_checkins' THEN 6
          ELSE 99
        END,
        di.deleted_at
    LOOP
      BEGIN
        EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)', r.table_name, r.table_name)
          USING r.row_data;
        UPDATE rc_deleted_items SET restored_at = NOW() WHERE id = r.id;
        v_progress := TRUE;
      EXCEPTION WHEN foreign_key_violation OR unique_violation THEN
        -- Dependency not restored yet (or a conflicting row already exists);
        -- leave restored_at NULL and retry on a later pass.
        v_last_error := SQLERRM;
      END;
    END LOOP;

    EXIT WHEN NOT v_progress OR v_pass > 20;
  END LOOP;

  IF EXISTS (SELECT 1 FROM rc_deleted_items di WHERE di.batch_id = p_batch_id AND di.restored_at IS NULL) THEN
    RAISE WARNING 'restore_deleted_rc_batch: % row(s) in batch % could not be restored (last error: %)',
      (SELECT count(*) FROM rc_deleted_items di WHERE di.batch_id = p_batch_id AND di.restored_at IS NULL),
      p_batch_id, v_last_error;
  END IF;

  RETURN QUERY
    SELECT di.table_name,
           count(*) FILTER (WHERE di.restored_at IS NOT NULL)::INTEGER,
           count(*) FILTER (WHERE di.restored_at IS NULL)::INTEGER
    FROM rc_deleted_items di
    WHERE di.batch_id = p_batch_id
    GROUP BY di.table_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION restore_deleted_rc_batch(TEXT) IS 'Admin-only: reinserts every not-yet-restored rc_deleted_items row for a batch, in FK-safe order. Rows that still conflict (dependency missing or unique-constraint clash) are left unrestored and reported in skipped_count.';

-- Default ACL on this project grants EXECUTE to anon/authenticated on new
-- functions regardless of the admin check inside the body — drop anon,
-- keep authenticated (the admin check is the real gate).
REVOKE EXECUTE ON FUNCTION restore_deleted_rc_batch(TEXT) FROM anon;

-- capture_deleted_rc_row() is trigger-only and should never be invocable
-- directly, same rationale as the other trigger functions revoked in
-- 20260729000004_revoke_anon_execute_on_security_definer_functions.sql.
REVOKE EXECUTE ON FUNCTION capture_deleted_rc_row() FROM anon, authenticated;
