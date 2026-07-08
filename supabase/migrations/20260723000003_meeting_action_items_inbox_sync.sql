-- Unified funnel (Idea #1), PR 0+3+4: fix an RLS gap on
-- meeting_series_action_items, then sync it (forward) into inbox_items with
-- re-assignment and deletion handling.
--
-- RLS gap (documented in PLAN_idea1_unified_funnel.md section 1b/4 item 4):
-- the existing UPDATE policy from 20251023004000_fix_action_items_rls_policy.sql
-- only allows created_by = auth.uid() to update a row. But the app-level
-- check in src/components/meeting/ActionItems.tsx already treats the
-- assignee as allowed to toggle completion (isOwner = assigned_to ===
-- currentUserId || created_by === currentUserId). This migration brings RLS
-- in line with that existing app-level intent rather than relying solely on
-- SECURITY DEFINER trigger functions to paper over the gap.

DROP POLICY IF EXISTS "Users can update their own action items" ON meeting_series_action_items;

CREATE POLICY "Users can update their own or assigned action items" ON meeting_series_action_items
  FOR UPDATE
  USING (auth.uid() = created_by OR auth.uid() = assigned_to);

-- ── Forward sync: meeting_series_action_items -> inbox_items ────────────────
--
-- Only rows with a non-null assigned_to get mirrored (we need a user to own
-- the inbox row). Re-assignment (assigned_to changes from A to B) archives
-- A's mirrored item and creates a fresh one for B, rather than leaving a
-- stale item behind or silently re-pointing ownership of an inbox row that
-- RLS scopes to a single user_id (inbox_items.user_id is not itself
-- updatable across users in any sane design).

CREATE OR REPLACE FUNCTION sync_meeting_action_item_to_inbox()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_id uuid;
  v_status text;
  v_done_at timestamptz;
BEGIN
  -- Re-assignment or unassignment: archive the previous assignee's mirrored
  -- item since it no longer belongs to them.
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT NULL
     AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    UPDATE inbox_items
    SET status = 'archived', archived_at = now(), updated_at = now()
    WHERE source_ref->>'type' = 'meeting_action_item'
      AND source_ref->>'id' = OLD.id::text
      AND user_id = OLD.assigned_to
      AND status != 'archived';
  END IF;

  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  v_status := CASE NEW.completion_status WHEN 'completed' THEN 'done' ELSE 'open' END;
  v_done_at := CASE WHEN NEW.completion_status = 'completed' THEN COALESCE(NEW.completed_at, now()) ELSE NULL END;

  SELECT id INTO v_existing_id
  FROM inbox_items
  WHERE source_ref->>'type' = 'meeting_action_item'
    AND source_ref->>'id' = NEW.id::text
    AND user_id = NEW.assigned_to
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE inbox_items
    SET text = NEW.title,
        body = NEW.notes,
        status = v_status,
        done_at = v_done_at,
        archived_at = NULL,
        updated_at = now()
    WHERE id = v_existing_id
      AND (status IS DISTINCT FROM v_status
           OR text IS DISTINCT FROM NEW.title
           OR body IS DISTINCT FROM NEW.notes);
  ELSE
    INSERT INTO inbox_items (
      user_id, type, text, body, status, done_at,
      source_ref, bucket, workflow_status
    ) VALUES (
      NEW.assigned_to,
      'task',
      NEW.title,
      NEW.notes,
      v_status,
      v_done_at,
      jsonb_build_object('type', 'meeting_action_item', 'id', NEW.id::text),
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_meeting_action_item_to_inbox ON meeting_series_action_items;
CREATE TRIGGER trg_sync_meeting_action_item_to_inbox
  AFTER INSERT OR UPDATE ON meeting_series_action_items
  FOR EACH ROW EXECUTE FUNCTION sync_meeting_action_item_to_inbox();

-- ── Deletion handling: archive (don't delete) the mirrored inbox item ───────

CREATE OR REPLACE FUNCTION archive_inbox_item_on_meeting_action_item_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.assigned_to IS NOT NULL THEN
    UPDATE inbox_items
    SET status = 'archived', archived_at = now(), updated_at = now()
    WHERE source_ref->>'type' = 'meeting_action_item'
      AND source_ref->>'id' = OLD.id::text
      AND user_id = OLD.assigned_to
      AND status != 'archived';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_archive_inbox_item_on_meeting_action_item_delete ON meeting_series_action_items;
CREATE TRIGGER trg_archive_inbox_item_on_meeting_action_item_delete
  BEFORE DELETE ON meeting_series_action_items
  FOR EACH ROW EXECUTE FUNCTION archive_inbox_item_on_meeting_action_item_delete();
