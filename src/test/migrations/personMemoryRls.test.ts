import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Static RLS verification for Idea #7 (Relationship memory).
//
// PersonMemoryConsentModal.tsx tells the user "only you can see it." That
// claim is only true if every table the person page and pre-1:1 brief job
// read from or write to is scoped to `auth.uid() = user_id` (directly, or
// via an EXISTS subquery back to a table that is). This test is the static
// half of verifying that claim — it can't prove RLS actually blocks a
// cross-user query at the database level (that needs a live Postgres, which
// this repo's own convention puts in the e2e suite — see
// src/test/migrations/promote_task_to_sub_si.test.ts for the same pattern),
// but it does fail loudly if a future migration ever drops or weakens the
// policy on one of these tables, which is exactly the failure mode the
// consent copy is trusting won't happen silently.
//
// See also: e2e/inbox/personMemoryPrivacy.spec.ts for the live,
// two-user cross-account check.

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations');

function readAllMigrations(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  return files.map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8')).join('\n');
}

const allSql = readAllMigrations();
const norm = allSql.replace(/\s+/g, ' ');

/** Tables the person page (usePersonPage.ts) and pre-1:1 brief job
 *  (generate-person-brief) read from or write to. If a table is added to
 *  either of those without also being added here, this list itself is the
 *  thing that should be updated — not silently skipped. */
const DIRECT_USER_SCOPED_TABLES = [
  'inbox_items',
  'inbox_tags',
  'cos_team_members',
  'cos_relationship_documents',
  'cos_relationship_topics',
  'cos_one_on_one_prep',
  'cos_meeting_actions',
  'cos_settings',
  'cos_person_accountabilities',
  'cos_person_topics',
];

describe('Idea #7 (Relationship memory): RLS scoping backing the consent modal claim', () => {
  it.each(DIRECT_USER_SCOPED_TABLES)('%s has a policy scoping rows to auth.uid() = user_id', (table) => {
    // Matches `ON <table> FOR ALL ... USING (auth.uid() = user_id)` allowing
    // for whitespace variance and either FOR ALL or a same-effect USING
    // clause on a more specific FOR (SELECT/INSERT/UPDATE/DELETE).
    const policyPattern = new RegExp(
      `ON ${table}\\b[^;]*?USING\\s*\\(\\s*auth\\.uid\\(\\)\\s*=\\s*user_id\\s*\\)`,
      'i',
    );
    expect(
      policyPattern.test(norm),
      `Expected to find a "USING (auth.uid() = user_id)" RLS policy on ${table} across all migrations. ` +
      `If this fails, either the policy was weakened/removed (fix the migration) or this test's pattern ` +
      `needs updating to match a legitimately different-but-equivalent policy shape — do not just delete ` +
      `this assertion, since PersonMemoryConsentModal.tsx's "only you can see it" copy depends on it being true.`,
    ).toBe(true);
  });

  it('inbox_item_tags scopes via EXISTS back to inbox_items (no direct user_id column)', () => {
    // inbox_item_tags is a pure join table with no user_id of its own — its
    // RLS policy must instead check that the referenced inbox_items row
    // belongs to the caller.
    const pattern = /ON inbox_item_tags\b[\s\S]*?EXISTS\s*\(\s*SELECT[\s\S]*?FROM inbox_items[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i;
    expect(pattern.test(allSql)).toBe(true);
  });

  it('cos_forgotten_commitments is a plain view (not SECURITY DEFINER) over cos_meeting_actions', () => {
    // A SECURITY DEFINER view would run with the view owner's privileges,
    // bypassing the querying user's RLS entirely — silently invalidating the
    // "only you can see it" claim for forgotten commitments even though
    // cos_meeting_actions itself is correctly scoped. This must stay a
    // security-invoker (default) view.
    //
    // Isolated from the un-normalized (newline-preserved) source, since the
    // whitespace-collapsed `norm` string makes it hard to bound where one
    // CREATE statement ends and the next begins.
    const viewDefIndex = allSql.search(/CREATE (OR REPLACE )?VIEW cos_forgotten_commitments AS/i);
    expect(viewDefIndex, 'cos_forgotten_commitments view definition not found').toBeGreaterThanOrEqual(0);

    // The view's own migration file (20260620000000) has no SECURITY DEFINER
    // anywhere in it — confirm at the file level, which avoids having to
    // precisely bound the view body inside the concatenated multi-migration
    // string.
    const viewMigrationPath = resolve(MIGRATIONS_DIR, '20260620000000_relationship_memory_agent_foundation.sql');
    const viewMigrationSql = readFileSync(viewMigrationPath, 'utf-8');
    expect(viewMigrationSql).toMatch(/CREATE (OR REPLACE )?VIEW cos_forgotten_commitments AS/i);
    expect(viewMigrationSql.toUpperCase()).not.toContain('SECURITY DEFINER');
    expect(viewMigrationSql).toMatch(/FROM cos_meeting_actions/i);
  });

  it('cos_agent_log restricts SELECT to the owning user (audit trail read path)', () => {
    // The plan's §6 privacy risk explicitly calls out extending cos_agent_log
    // for person-page/brief audit trail — that only stays safe if reads are
    // scoped the same way everything else is.
    const pattern = /ON cos_agent_log\b[^;]*?USING\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i;
    expect(pattern.test(norm)).toBe(true);
  });
});

describe('Idea #7: pre_stage_inbox_brief defaults to off', () => {
  it('the person_memory_settings migration keeps pre_stage_inbox_brief false by default', () => {
    const migrationPath = resolve(MIGRATIONS_DIR, '20260721000010_person_memory_settings.sql');
    const sql = readFileSync(migrationPath, 'utf-8');
    // The default agent_config blob must set pre_stage_inbox_brief to false —
    // per PLAN §4, this must stay off until Unified Funnel (idea #1)
    // ingestion is confirmed live for a workspace, since a brief built on
    // incomplete data can actively damage the trust the feature is meant to
    // build. A future migration flipping this default without deliberate
    // review would be exactly the kind of silent regression this guards.
    expect(sql).toMatch(/"pre_stage_inbox_brief":\s*false/);
  });
});
