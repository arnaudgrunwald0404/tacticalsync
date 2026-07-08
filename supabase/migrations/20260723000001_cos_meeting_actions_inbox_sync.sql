-- Unified funnel (Idea #1), PR 1+2: sync cos_meeting_actions (1:1 prep
-- commitments) into inbox_items, forward direction, plus reverse status
-- sync and deletion handling.
--
-- Only rows with owner = 'me' are synced — those are the current user's own
-- commitments from a 1:1 ("to-dos for me"). owner = 'them' rows belong to
-- the report (cos_team_members.member_id), who may not even be an app user,
-- so there is no inbox to sync into for those.
--
-- Dedupe: keyed by source_ref = {"type": "cos_meeting_action", "id": <row id>}
-- via the partial index added in 20260721000000.

-- ── Forward sync: cos_meeting_actions -> inbox_items ────────────────────────

CREATE OR REPLACE FUNCTION sync_cos_meeting_action_to_inbox()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_id uuid;
  v_status text;
  v_done_at timestamptz;
BEGIN
  -- Only "to-dos for me" get mirrored into the inbox.
  IF NEW.owner IS DISTINCT FROM 'me' THEN
    -- If this row was previously owner='me' (edited to 'them'), archive its
    -- mirrored inbox item since it no longer belongs to the current user's
    -- personal to-do list.
    IF TG_OP = 'UPDATE' AND OLD.owner = 'me' THEN
      UPDATE inbox_items
      SET status = 'archived', archived_at = now(), updated_at = now()
      WHERE source_ref->>'type' = 'cos_meeting_action'
        AND source_ref->>'id' = NEW.id::text
        AND status != 'archived';
    END IF;
    RETURN NEW;
  END IF;

  v_status := CASE NEW.status WHEN 'done' THEN 'done' ELSE 'open' END;
  v_done_at := CASE WHEN NEW.status = 'done' THEN COALESCE(NEW.completed_at, now()) ELSE NULL END;

  SELECT id INTO v_existing_id
  FROM inbox_items
  WHERE source_ref->>'type' = 'cos_meeting_action'
    AND source_ref->>'id' = NEW.id::text
    AND user_id = NEW.user_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update in place. Only move status if it isn't already what we'd set it
    -- to, so a reverse-sync-triggered update to inbox_items doesn't bounce
    -- back and forth pointlessly (still safe either way since values match).
    UPDATE inbox_items
    SET text = NEW.text,
        status = v_status,
        done_at = v_done_at,
        archived_at = NULL,
        updated_at = now()
    WHERE id = v_existing_id
      AND (status IS DISTINCT FROM v_status OR text IS DISTINCT FROM NEW.text);
  ELSE
    INSERT INTO inbox_items (
      user_id, type, text, status, done_at,
      source_ref, bucket, workflow_status
    ) VALUES (
      NEW.user_id,
      'task',
      NEW.text,
      v_status,
      v_done_at,
      jsonb_build_object('type', 'cos_meeting_action', 'id', NEW.id::text),
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_cos_meeting_action_to_inbox ON cos_meeting_actions;
CREATE TRIGGER trg_sync_cos_meeting_action_to_inbox
  AFTER INSERT OR UPDATE ON cos_meeting_actions
  FOR EACH ROW EXECUTE FUNCTION sync_cos_meeting_action_to_inbox();

-- ── Deletion handling: archive (don't delete) the mirrored inbox item ───────

CREATE OR REPLACE FUNCTION archive_inbox_item_on_cos_meeting_action_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inbox_items
  SET status = 'archived', archived_at = now(), updated_at = now()
  WHERE source_ref->>'type' = 'cos_meeting_action'
    AND source_ref->>'id' = OLD.id::text
    AND status != 'archived';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_archive_inbox_item_on_cos_meeting_action_delete ON cos_meeting_actions;
CREATE TRIGGER trg_archive_inbox_item_on_cos_meeting_action_delete
  BEFORE DELETE ON cos_meeting_actions
  FOR EACH ROW EXECUTE FUNCTION archive_inbox_item_on_cos_meeting_action_delete();
