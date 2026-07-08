-- Unified funnel (Idea #1): reverse sync — completing/reopening a mirrored
-- inbox item pushes the status back to its source row
-- (cos_meeting_actions or meeting_series_action_items).
--
-- Only the open<->done transition round-trips. archived/snoozed on the inbox
-- side do not touch the source row's completion state — archiving an inbox
-- item is a personal inbox-management action, not a statement that the
-- underlying commitment/action item is done or not done.
--
-- Loop-guard: this trigger only fires UPDATE ... WHERE it actually needs to
-- change the source row's value (checked in application logic below via
-- IS DISTINCT FROM), and the forward-sync triggers only UPDATE inbox_items
-- when the value differs, so a settled pair of rows does not keep pinging
-- each other.

CREATE OR REPLACE FUNCTION sync_inbox_item_status_to_source()
RETURNS TRIGGER AS $$
DECLARE
  v_source_type text;
  v_source_id uuid;
BEGIN
  IF NEW.source_ref IS NULL THEN
    RETURN NEW;
  END IF;

  v_source_type := NEW.source_ref->>'type';
  IF v_source_type NOT IN ('cos_meeting_action', 'meeting_action_item') THEN
    RETURN NEW;
  END IF;

  -- Only react to an actual open<->done transition.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('open', 'done') AND OLD.status NOT IN ('open', 'done') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_source_id := (NEW.source_ref->>'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    -- Malformed source_ref.id — nothing sensible to sync back to.
    RETURN NEW;
  END;

  IF v_source_type = 'cos_meeting_action' THEN
    IF NEW.status = 'done' THEN
      UPDATE cos_meeting_actions
      SET status = 'done'
      WHERE id = v_source_id AND status IS DISTINCT FROM 'done';
    ELSIF NEW.status = 'open' AND OLD.status = 'done' THEN
      UPDATE cos_meeting_actions
      SET status = 'pending'
      WHERE id = v_source_id AND status IS DISTINCT FROM 'pending';
    END IF;
    -- No-op (0 rows affected) if the source row was deleted — by design.

  ELSIF v_source_type = 'meeting_action_item' THEN
    IF NEW.status = 'done' THEN
      UPDATE meeting_series_action_items
      SET completion_status = 'completed'
      WHERE id = v_source_id AND completion_status IS DISTINCT FROM 'completed';
    ELSIF NEW.status = 'open' AND OLD.status = 'done' THEN
      UPDATE meeting_series_action_items
      SET completion_status = 'not_completed'
      WHERE id = v_source_id AND completion_status IS DISTINCT FROM 'not_completed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_inbox_item_status_to_source ON inbox_items;
CREATE TRIGGER trg_sync_inbox_item_status_to_source
  AFTER UPDATE ON inbox_items
  FOR EACH ROW EXECUTE FUNCTION sync_inbox_item_status_to_source();
