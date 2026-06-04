import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Smoke test for the rcdo_promote_task_to_sub_si RPC migration.
//
// A real "does the RPC work?" test would need a live Postgres — that lives in
// the e2e suite (which boots Supabase). Here we just verify the migration's
// contract has the structural pieces we depend on, so an accidental rewrite
// (signature change, missing exception, dropped DELETE) fails CI loudly.

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../supabase/migrations/20260604041155_promote_task_to_sub_si.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf-8');

// Normalize whitespace so regex assertions don't depend on indentation.
const norm = sql.replace(/\s+/g, ' ');

describe('migration: rcdo_promote_task_to_sub_si', () => {
  it('declares the function with the expected signature', () => {
    // CREATE OR REPLACE FUNCTION rcdo_promote_task_to_sub_si(p_task_id UUID) RETURNS UUID
    expect(norm).toMatch(
      /CREATE OR REPLACE FUNCTION rcdo_promote_task_to_sub_si\s*\(\s*p_task_id\s+UUID\s*\)\s+RETURNS\s+UUID/i,
    );
  });

  it('reads the source task fields it needs to copy onto the new sub-SI', () => {
    // The new sub-SI inherits title, description (from completion_criteria),
    // owner, dates from the task. Drop any of these and the promote becomes
    // lossy — assert each appears in the SELECT.
    for (const col of ['title', 'completion_criteria', 'owner_user_id', 'start_date', 'target_delivery_date']) {
      expect(norm).toContain(col);
    }
  });

  it('inserts a new sub-SI row that points at the parent SI', () => {
    expect(norm).toMatch(/INSERT\s+INTO\s+rc_strategic_initiatives/i);
    // The insert must set parent_si_id so the new row is recognized as a sub-SI.
    expect(norm).toContain('parent_si_id');
  });

  it('deletes the original task in the same transaction (atomicity)', () => {
    // The DB-level atomicity guarantee: caller never observes both the task AND
    // the new sub-SI coexisting. The function body must perform DELETE FROM rc_tasks.
    expect(norm).toMatch(/DELETE\s+FROM\s+rc_tasks\s+WHERE\s+id\s*=\s*p_task_id/i);
  });

  it('raises if the task does not exist', () => {
    expect(norm).toMatch(/RAISE\s+EXCEPTION\s+'Task .* not found/i);
  });

  it('rejects promotion of a flat-mode task (parent_si_id IS NULL on its container)', () => {
    // Critical safety check: a task can only be promoted when it lives under
    // a sub-SI, never directly under a top-level SI. The UI gates this too,
    // but a direct RPC call must still bounce.
    expect(norm).toMatch(/IF\s+v_parent_si_id\s+IS\s+NULL\s+THEN/i);
    expect(norm).toMatch(/RAISE\s+EXCEPTION\s+'Cannot promote task .* not under a sub-initiative/i);
  });

  it('rejects promotion when the parent SI is not in sub-SI mode', () => {
    // accepts_sub_sis === TRUE is the runtime guarantee. If it's false we'd
    // create an orphaned sub-SI under a flat-mode parent.
    expect(norm).toMatch(/accepts_sub_sis/i);
    expect(norm).toMatch(/RAISE\s+EXCEPTION\s+'Cannot promote task .* does not accept sub-initiatives/i);
  });

  it('appends the new sub-SI at end of order (MAX(display_order) + 1)', () => {
    // The newly-created sub-SI should show up below the task's previous container.
    expect(norm).toMatch(/COALESCE\s*\(\s*MAX\s*\(\s*display_order\s*\)\s*,\s*-?\d+\s*\)\s*\+\s*1/i);
  });

  it('returns the new sub-SI id so callers can navigate / select it', () => {
    expect(norm).toMatch(/RETURNING\s+id\s+INTO\s+v_new_sub_si_id/i);
    expect(norm).toMatch(/RETURN\s+v_new_sub_si_id/i);
  });
});
