import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Structural smoke tests for the unified-funnel sync migrations (Idea #1:
// meeting action items + 1:1 "for me" commitments -> inbox_items).
//
// Same convention as promote_task_to_sub_si.test.ts: these are not live-DB
// tests (that lives in e2e, which boots Supabase) — they assert the raw SQL
// file content has the structural pieces the design in
// PLAN_idea1_unified_funnel.md depends on, so an accidental rewrite (dropped
// guard, changed signature, missing trigger) fails CI loudly.

function readMigration(filename: string): string {
  const path = resolve(__dirname, '../../../supabase/migrations', filename);
  const sql = readFileSync(path, 'utf-8');
  // Normalize whitespace so regex assertions don't depend on indentation.
  return sql.replace(/\s+/g, ' ');
}

describe('migration: 20260723000000_inbox_source_ref_meeting_action_indexes', () => {
  const norm = readMigration('20260723000000_inbox_source_ref_meeting_action_indexes.sql');

  it('adds a partial index for meeting_action_item source_ref lookups', () => {
    expect(norm).toMatch(
      /CREATE INDEX IF NOT EXISTS inbox_items_source_ref_meeting_action\s+ON inbox_items\s*\(\s*\(\s*source_ref->>'id'\s*\)\s*\)\s+WHERE source_ref->>'type' = 'meeting_action_item'/i,
    );
  });

  it('adds a partial index for cos_meeting_action source_ref lookups', () => {
    expect(norm).toMatch(
      /CREATE INDEX IF NOT EXISTS inbox_items_source_ref_cos_action\s+ON inbox_items\s*\(\s*\(\s*source_ref->>'id'\s*\)\s*\)\s+WHERE source_ref->>'type' = 'cos_meeting_action'/i,
    );
  });
});

describe('migration: sync_cos_meeting_action_to_inbox', () => {
  const norm = readMigration('20260723000001_cos_meeting_actions_inbox_sync.sql');

  it('declares the trigger function', () => {
    expect(norm).toMatch(/CREATE OR REPLACE FUNCTION sync_cos_meeting_action_to_inbox\(\)\s*RETURNS TRIGGER/i);
  });

  it('is wired as an AFTER INSERT OR UPDATE trigger on cos_meeting_actions', () => {
    expect(norm).toMatch(
      /CREATE TRIGGER trg_sync_cos_meeting_action_to_inbox\s+AFTER INSERT OR UPDATE ON cos_meeting_actions\s+FOR EACH ROW EXECUTE FUNCTION sync_cos_meeting_action_to_inbox\(\)/i,
    );
  });

  it('only syncs owner=\'me\' rows', () => {
    expect(norm).toContain("NEW.owner IS DISTINCT FROM 'me'");
  });

  it('archives the mirrored item when a previously-me row flips owner away from me', () => {
    expect(norm).toMatch(/OLD\.owner = 'me'/);
    expect(norm).toMatch(/SET status = 'archived', archived_at = now\(\)/);
  });

  it('dedupes via a SELECT on source_ref before inserting', () => {
    expect(norm).toMatch(
      /SELECT id INTO v_existing_id\s+FROM inbox_items\s+WHERE source_ref->>'type' = 'cos_meeting_action'\s+AND source_ref->>'id' = NEW\.id::text/i,
    );
  });

  it('has both an UPDATE branch (existing mirror) and an INSERT branch (new mirror)', () => {
    expect(norm).toMatch(/IF v_existing_id IS NOT NULL THEN.*?UPDATE inbox_items/i);
    expect(norm).toMatch(/ELSE\s+INSERT INTO inbox_items/i);
  });

  it('sets the source_ref to the cos_meeting_action dedupe key on insert', () => {
    expect(norm).toContain("jsonb_build_object('type', 'cos_meeting_action', 'id', NEW.id::text)");
  });

  it('declares a BEFORE DELETE archive trigger, not a hard delete, on cos_meeting_actions', () => {
    expect(norm).toMatch(/CREATE OR REPLACE FUNCTION archive_inbox_item_on_cos_meeting_action_delete\(\)\s*RETURNS TRIGGER/i);
    expect(norm).toMatch(
      /CREATE TRIGGER trg_archive_inbox_item_on_cos_meeting_action_delete\s+BEFORE DELETE ON cos_meeting_actions/i,
    );
    expect(norm).not.toMatch(/DELETE FROM inbox_items/i);
  });
});

describe('migration: sync_inbox_item_status_to_source', () => {
  const norm = readMigration('20260723000002_inbox_items_reverse_sync.sql');

  it('declares the trigger function and wires it as an AFTER UPDATE trigger on inbox_items', () => {
    expect(norm).toMatch(/CREATE OR REPLACE FUNCTION sync_inbox_item_status_to_source\(\)\s*RETURNS TRIGGER/i);
    expect(norm).toMatch(
      /CREATE TRIGGER trg_sync_inbox_item_status_to_source\s+AFTER UPDATE ON inbox_items\s+FOR EACH ROW EXECUTE FUNCTION sync_inbox_item_status_to_source\(\)/i,
    );
  });

  it('branches on source_ref type for both source tables', () => {
    expect(norm).toContain("v_source_type NOT IN ('cos_meeting_action', 'meeting_action_item')");
    expect(norm).toMatch(/IF v_source_type = 'cos_meeting_action' THEN/i);
    expect(norm).toMatch(/ELSIF v_source_type = 'meeting_action_item' THEN/i);
  });

  it('only reacts to an actual status change, and only open<->done transitions', () => {
    expect(norm).toContain('NEW.status IS NOT DISTINCT FROM OLD.status');
    expect(norm).toContain("NEW.status NOT IN ('open', 'done') AND OLD.status NOT IN ('open', 'done')");
  });

  it('tolerates the source row being gone (WHERE guard, no exception on 0 rows)', () => {
    // Both UPDATE targets are guarded by an id match with no accompanying
    // existence check/RAISE — a 0-row UPDATE is treated as a silent no-op.
    expect(norm).toMatch(/UPDATE cos_meeting_actions\s+SET status = 'done'\s+WHERE id = v_source_id/i);
    expect(norm).toMatch(/UPDATE meeting_series_action_items\s+SET completion_status = 'completed'\s+WHERE id = v_source_id/i);
    expect(norm).not.toMatch(/RAISE EXCEPTION/i);
  });

  it('guards against malformed source_ref.id instead of raising', () => {
    expect(norm).toMatch(/EXCEPTION WHEN OTHERS THEN/i);
  });

  it('uses IS DISTINCT FROM guards to avoid re-firing the trigger pointlessly', () => {
    expect(norm).toContain("status IS DISTINCT FROM 'done'");
    expect(norm).toContain("completion_status IS DISTINCT FROM 'completed'");
  });
});

describe('migration: sync_meeting_action_item_to_inbox', () => {
  const norm = readMigration('20260723000003_meeting_action_items_inbox_sync.sql');

  it('fixes the RLS gap: assignee can update, not just the creator', () => {
    expect(norm).toMatch(
      /CREATE POLICY "Users can update their own or assigned action items" ON meeting_series_action_items\s+FOR UPDATE\s+USING \(auth\.uid\(\) = created_by OR auth\.uid\(\) = assigned_to\)/i,
    );
  });

  it('declares the trigger function and wires it as an AFTER INSERT OR UPDATE trigger', () => {
    expect(norm).toMatch(/CREATE OR REPLACE FUNCTION sync_meeting_action_item_to_inbox\(\)\s*RETURNS TRIGGER/i);
    expect(norm).toMatch(
      /CREATE TRIGGER trg_sync_meeting_action_item_to_inbox\s+AFTER INSERT OR UPDATE ON meeting_series_action_items/i,
    );
  });

  it('archives the previous assignee\'s mirrored item on re-assignment', () => {
    expect(norm).toContain('OLD.assigned_to IS DISTINCT FROM NEW.assigned_to');
    expect(norm).toMatch(/SET status = 'archived', archived_at = now\(\)/);
  });

  it('only mirrors rows with a non-null assigned_to', () => {
    expect(norm).toContain('NEW.assigned_to IS NULL');
  });

  it('dedupes via a SELECT on source_ref before inserting', () => {
    expect(norm).toMatch(
      /SELECT id INTO v_existing_id\s+FROM inbox_items\s+WHERE source_ref->>'type' = 'meeting_action_item'\s+AND source_ref->>'id' = NEW\.id::text/i,
    );
  });

  it('sets the source_ref to the meeting_action_item dedupe key on insert', () => {
    expect(norm).toContain("jsonb_build_object('type', 'meeting_action_item', 'id', NEW.id::text)");
  });

  it('declares a BEFORE DELETE archive trigger, not a hard delete', () => {
    expect(norm).toMatch(/CREATE OR REPLACE FUNCTION archive_inbox_item_on_meeting_action_item_delete\(\)\s*RETURNS TRIGGER/i);
    expect(norm).toMatch(
      /CREATE TRIGGER trg_archive_inbox_item_on_meeting_action_item_delete\s+BEFORE DELETE ON meeting_series_action_items/i,
    );
    expect(norm).not.toMatch(/DELETE FROM inbox_items/i);
  });
});

describe('migration: 20260723000004_profile_feature_announcements', () => {
  const norm = readMigration('20260723000004_profile_feature_announcements.sql');

  it('adds a not-null jsonb column with an empty-object default', () => {
    expect(norm).toMatch(/ALTER TABLE profiles\s+ADD COLUMN IF NOT EXISTS feature_announcements jsonb NOT NULL DEFAULT '\{\}'::jsonb/i);
  });
});
