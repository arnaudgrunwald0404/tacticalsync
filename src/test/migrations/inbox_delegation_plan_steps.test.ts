import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Smoke test for the Delegation v2 migration (plan_steps + step-execution
// idempotency table + audit log + the atomic transition function).
//
// A real "does the RPC work?" test needs a live Postgres — that's covered by
// the edge function's own integration path. Here we verify the migration's
// contract has the structural pieces the edge function depends on, so an
// accidental rewrite (dropped FOR UPDATE lock, missing ownership check,
// missing RLS) fails loudly instead of silently reopening the race/authz
// gaps this migration exists to close.

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../supabase/migrations/20260722000000_inbox_delegation_plan_steps.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf-8');
const norm = sql.replace(/\s+/g, ' ');

describe('migration: inbox_delegation_plan_steps', () => {
  it('adds plan_steps as a non-null jsonb column defaulting to an empty array', () => {
    expect(norm).toMatch(/ADD COLUMN plan_steps jsonb NOT NULL DEFAULT '\[\]'::jsonb/i);
  });

  it('creates the step-execution idempotency table, unique per (delegation, step)', () => {
    expect(norm).toMatch(/CREATE TABLE inbox_delegation_step_executions/i);
    expect(norm).toMatch(/UNIQUE\s*\(delegation_id,\s*step_id\)/i);
  });

  it('enables RLS and scopes step-execution reads to the owning user only', () => {
    expect(norm).toMatch(/ALTER TABLE inbox_delegation_step_executions ENABLE ROW LEVEL SECURITY/i);
    expect(norm).toMatch(/CREATE POLICY "users read their own step executions"\s+ON inbox_delegation_step_executions FOR SELECT\s+USING \(auth\.uid\(\) = user_id\)/i);
  });

  it('declares the atomic transition function with the expected signature', () => {
    expect(norm).toMatch(
      /CREATE OR REPLACE FUNCTION try_transition_delegation_step\s*\(\s*p_delegation_id\s+uuid,\s*p_step_id\s+text,\s*p_from_statuses\s+text\[\],\s*p_to_status\s+text,\s*p_actor\s+uuid,\s*p_extra\s+jsonb\s+DEFAULT\s+'\{\}'::jsonb\s*\)\s+RETURNS\s+jsonb/i,
    );
  });

  it('locks the delegation row for the duration of the transition (prevents the double-approve race)', () => {
    expect(norm).toMatch(/SELECT plan_steps, user_id INTO v_plan_steps, v_owner\s+FROM inbox_delegations\s+WHERE id = p_delegation_id\s+FOR UPDATE/i);
  });

  it('rejects a transition attempted by anyone other than the delegation owner', () => {
    expect(norm).toContain('p_actor IS NOT NULL AND p_actor <> v_owner');
    expect(norm).toContain('not_authorized');
  });

  it('rejects a transition when the step is not currently in one of the expected "from" statuses', () => {
    // This is the idempotency guard: a retried approve on an already-approved
    // step must fail here, not silently re-apply.
    expect(norm).toContain("NOT (v_step->>'status' = ANY(p_from_statuses))");
    expect(norm).toContain('step_not_in_expected_state');
  });

  it('creates an append-only audit log with no client-writable policy', () => {
    expect(norm).toMatch(/CREATE TABLE inbox_delegation_audit_log/i);
    expect(norm).toMatch(/action text NOT NULL CHECK \(action IN \('approved', 'rejected', 'executed', 'failed'\)\)/i);
    expect(norm).toMatch(/CREATE POLICY "users read their own delegation audit log"\s+ON inbox_delegation_audit_log FOR SELECT/i);
    // Deliberately no INSERT/UPDATE/DELETE policy — assert none exists for this table.
    expect(norm).not.toMatch(/CREATE POLICY[^;]*ON inbox_delegation_audit_log[^;]*FOR (INSERT|UPDATE|DELETE)/i);
  });
});
