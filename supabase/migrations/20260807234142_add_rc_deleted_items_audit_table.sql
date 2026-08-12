-- RCDO delete recovery: capture layer only (no restore RPC yet).
-- Snapshots every row deleted from the RCDO hierarchy (DO/SI/task + their
-- non-FK-linked rc_links/rc_checkins) into rc_deleted_items before it's gone,
-- so a later restore RPC can bring accidental deletes back.

-- ============================================================================
-- RC Deleted Items Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS rc_deleted_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Groups rows deleted by the same statement/transaction so a whole DO/SI
  -- delete (which cascades across tables) can be restored as one unit.
  -- Falls back to the transaction id when the app hasn't set
  -- app.delete_batch_id, since PostgREST may run each request in its own
  -- transaction and multi-call deletes (e.g. deleteDO's rc_links +
  -- rc_checkins + rc_defining_objectives) won't share a batch otherwise.
  batch_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_data JSONB NOT NULL,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rc_deleted_items_batch_id ON rc_deleted_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_rc_deleted_items_table_name ON rc_deleted_items(table_name);
CREATE INDEX IF NOT EXISTS idx_rc_deleted_items_deleted_at ON rc_deleted_items(deleted_at);

COMMENT ON TABLE rc_deleted_items IS 'Trash/audit snapshots of hard-deleted RCDO rows, captured by capture_deleted_rc_row() triggers. No restore RPC yet — capture layer only.';
COMMENT ON COLUMN rc_deleted_items.batch_id IS 'Groups rows from the same logical delete action; see capture_deleted_rc_row().';

ALTER TABLE rc_deleted_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view deleted RCDO items" ON rc_deleted_items;
CREATE POLICY "Admins can view deleted RCDO items"
  ON rc_deleted_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- No INSERT/UPDATE/DELETE policy for authenticated/anon: writes only happen
-- via the SECURITY DEFINER trigger function below, which runs as the table
-- owner and bypasses RLS.

-- ============================================================================
-- Capture trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION capture_deleted_rc_row()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO rc_deleted_items (batch_id, table_name, row_data, deleted_by)
  VALUES (
    COALESCE(current_setting('app.delete_batch_id', true), 'xact-' || pg_current_xact_id()::text),
    TG_TABLE_NAME,
    to_jsonb(OLD),
    auth.uid()
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION capture_deleted_rc_row() IS 'BEFORE DELETE trigger: snapshots the deleted row into rc_deleted_items before it is gone (FK cascades and explicit deletes alike).';

-- ============================================================================
-- Triggers — one per table that can lose rows to an RCDO delete, whether via
-- explicit app-level .delete() or FK ON DELETE CASCADE from a parent.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_capture_deleted_rc_defining_objectives ON rc_defining_objectives;
CREATE TRIGGER trg_capture_deleted_rc_defining_objectives
  BEFORE DELETE ON rc_defining_objectives
  FOR EACH ROW EXECUTE FUNCTION capture_deleted_rc_row();

DROP TRIGGER IF EXISTS trg_capture_deleted_rc_do_metrics ON rc_do_metrics;
CREATE TRIGGER trg_capture_deleted_rc_do_metrics
  BEFORE DELETE ON rc_do_metrics
  FOR EACH ROW EXECUTE FUNCTION capture_deleted_rc_row();

DROP TRIGGER IF EXISTS trg_capture_deleted_rc_strategic_initiatives ON rc_strategic_initiatives;
CREATE TRIGGER trg_capture_deleted_rc_strategic_initiatives
  BEFORE DELETE ON rc_strategic_initiatives
  FOR EACH ROW EXECUTE FUNCTION capture_deleted_rc_row();

DROP TRIGGER IF EXISTS trg_capture_deleted_rc_tasks ON rc_tasks;
CREATE TRIGGER trg_capture_deleted_rc_tasks
  BEFORE DELETE ON rc_tasks
  FOR EACH ROW EXECUTE FUNCTION capture_deleted_rc_row();

DROP TRIGGER IF EXISTS trg_capture_deleted_rc_links ON rc_links;
CREATE TRIGGER trg_capture_deleted_rc_links
  BEFORE DELETE ON rc_links
  FOR EACH ROW EXECUTE FUNCTION capture_deleted_rc_row();

DROP TRIGGER IF EXISTS trg_capture_deleted_rc_checkins ON rc_checkins;
CREATE TRIGGER trg_capture_deleted_rc_checkins
  BEFORE DELETE ON rc_checkins
  FOR EACH ROW EXECUTE FUNCTION capture_deleted_rc_row();
