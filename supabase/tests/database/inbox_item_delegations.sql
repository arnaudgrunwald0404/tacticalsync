-- pgTAP tests for cross-user inbox item delegation
-- (inbox_item_delegations, the additive inbox_items SELECT policy, and the
-- two-way status sync triggers). Per PLAN_idea8_people_delegation.md §9/§10,
-- this is the highest-priority test file in the feature: it is the first
-- genuinely multi-tenant read/write path in the inbox module, so every
-- negative case ("can a user see/touch something they shouldn't") matters
-- more here than anywhere else in this codebase.
--
-- VERIFIED BY EXECUTION: `supabase start` could not run in this environment
-- against this worktree (its default DB port 54322 is already held by a
-- different, unrelated local Supabase project — "cleargo" — and a second,
-- independent supabase/storage-api image-pull failure was also hit). Instead,
-- this file was run against a standalone `public.ecr.aws/supabase/postgres`
-- container on an isolated port, with all 202 of this repo's migrations
-- applied in order, plus three compatibility shims for gaps between that
-- base image and the real hosted project (confirmed via the Supabase MCP
-- against the live project schema): auth.jwt() was missing entirely,
-- auth.uid() only supported the legacy singular `request.jwt.claim.sub` GUC
-- (not the JSON `request.jwt.claims` one this file and the sibling
-- cos_team_member_linking.sql file use — patched to match the real
-- project's auth.uid(), which supports both), and a couple of unrelated
-- storage.* migrations needed stub tables/functions to apply. All 27
-- assertions below pass. One real bug was caught and fixed by this run: an
-- earlier draft of the "legitimate delegation" fixture tried to insert the
-- delegatee's copy of the item under the delegator's own RLS session, which
-- correctly fails — that insert can only happen via the service-role edge
-- function in real usage, exactly as PLAN_idea8_people_delegation.md §3
-- describes.
--
-- HOW TO RE-RUN (against a real local Supabase instance instead):
--   1. `supabase start`
--   2. `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
--         -f supabase/tests/database/inbox_item_delegations.sql`
--
-- ROLE-SWITCHING MECHANICS: see cos_team_member_linking.sql's header comment
-- for the SET LOCAL role/claims + SAVEPOINT pattern used throughout.

BEGIN;
SELECT plan(27);

-- ── Fixtures (inserted as postgres/superuser, bypassing RLS) ────────────────
-- Delegator (manager), delegatee (their linked report), and a stranger who
-- must never be able to see or touch anything below.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'delegator@example.com', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('30000000-0000-0000-0000-000000000002', 'delegatee@example.com', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('30000000-0000-0000-0000-000000000003', 'stranger@example.com', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('30000000-0000-0000-0000-000000000004', 'unlinked-target@example.com', 'x', now(), now(), now(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- A cos_team_members row owned by the delegator, linked to the delegatee —
-- the prerequisite relationship the whole feature is gated on.
INSERT INTO cos_team_members (id, user_id, name, role, relationship_type, email, linked_user_id, linked_at)
VALUES (
  '31000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Delegatee Person', 'Engineer', 'direct_report', 'delegatee@example.com',
  '30000000-0000-0000-0000-000000000002', now()
);

-- A second cos_team_members row owned by the delegator but NOT linked to
-- anyone — used to test that delegation attempts against an unlinked row are
-- rejected at the DB layer (defense in depth beyond the edge function).
INSERT INTO cos_team_members (id, user_id, name, role, relationship_type, email)
VALUES (
  '31000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  'Unlinked Person', 'Designer', 'direct_report', 'unlinked-target@example.com'
);

-- The delegator's source item.
INSERT INTO inbox_items (id, user_id, type, text, status)
VALUES ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'task', 'Review the Q3 comp bands', 'open');

-- ── Schema shape ─────────────────────────────────────────────────────────────
SELECT has_table('public', 'inbox_item_delegations', 'Table inbox_item_delegations should exist');
SELECT has_column('public', 'inbox_items', 'active_delegation_id', 'inbox_items should have active_delegation_id');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'inbox_item_delegations'),
  'RLS should be enabled on inbox_item_delegations'
);

-- ── DB-layer defense in depth: cannot delegate via an unlinked team member ──
SAVEPOINT as_delegator_bad_insert;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001"}';
SELECT throws_ok(
  $$INSERT INTO inbox_item_delegations (source_item_id, delegator_user_id, delegatee_user_id, team_member_id, status)
    VALUES ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', '31000000-0000-0000-0000-000000000002', 'pending')$$,
  NULL,
  'fn_validate_inbox_item_delegation rejects a delegation where team_member_id is not linked to the named delegatee'
);
ROLLBACK TO SAVEPOINT as_delegator_bad_insert;

-- ── DB-layer defense in depth: cannot delegate a team_member_id you don't own ─
SAVEPOINT as_stranger_bad_insert;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000003"}';
SELECT throws_ok(
  $$INSERT INTO inbox_item_delegations (source_item_id, delegator_user_id, delegatee_user_id, team_member_id, status)
    VALUES ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', 'pending')$$,
  NULL,
  'fn_validate_inbox_item_delegation rejects a delegation where the caller does not own the team_member_id row'
);
ROLLBACK TO SAVEPOINT as_stranger_bad_insert;

-- ── Legitimate delegation ────────────────────────────────────────────────────
-- The delegatee's copy is owned by the delegatee, not the delegator — the
-- delegator's own RLS grant genuinely cannot insert it (correctly so; this
-- is exactly the cross-user boundary the real delegate-inbox-item-to-person
-- edge function is trusted to cross via its service-role key, under its own
-- application-level authorization checks). So the copy is inserted here as
-- superuser to simulate that service-role write, while the
-- inbox_item_delegations row itself IS created as the delegator, since that
-- table's "delegator can manage their outgoing delegations" policy
-- (FOR ALL USING (auth.uid() = delegator_user_id)) genuinely allows it.
INSERT INTO inbox_items (id, user_id, type, text, status)
VALUES ('32000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'task', 'Review the Q3 comp bands', 'open');

SAVEPOINT as_delegator_insert;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001"}';
INSERT INTO inbox_item_delegations (id, source_item_id, delegator_user_id, delegatee_user_id, delegatee_item_id, team_member_id, status)
VALUES (
  '33000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '32000000-0000-0000-0000-000000000002',
  '31000000-0000-0000-0000-000000000001',
  'pending'
);
UPDATE inbox_items SET active_delegation_id = '33000000-0000-0000-0000-000000000001' WHERE id = '32000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM inbox_item_delegations WHERE id = '33000000-0000-0000-0000-000000000001'),
  1,
  'A legitimate delegation (linked team member, owned by delegator) can be created by the delegator'
);
-- RELEASE (not ROLLBACK TO) — this fixture data needs to persist for the
-- RLS-boundary tests below, which act as other users and must see it exist.
-- Resetting role/claims back to the superuser default before releasing keeps
-- subsequent superuser fixture inserts (below) from running under the
-- delegator's restricted RLS session by accident.
RESET role;
RESET request.jwt.claims;
RELEASE SAVEPOINT as_delegator_insert;

-- ── Core RLS boundary: a stranger cannot see the delegation row at all ──────
SAVEPOINT as_stranger_delegation_select;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000003"}';
SELECT is(
  (SELECT count(*)::int FROM inbox_item_delegations WHERE id = '33000000-0000-0000-0000-000000000001'),
  0,
  'A user who is neither delegator nor delegatee cannot SELECT the delegation row'
);
ROLLBACK TO SAVEPOINT as_stranger_delegation_select;

-- ── Core RLS boundary: stranger cannot see EITHER inbox_items row involved ──
SAVEPOINT as_stranger_items_select;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000003"}';
SELECT is(
  (SELECT count(*)::int FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000001'),
  0,
  'A stranger cannot SELECT the delegator''s source inbox_items row'
);
SELECT is(
  (SELECT count(*)::int FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000002'),
  0,
  'A stranger cannot SELECT the delegatee''s copy inbox_items row'
);
-- Regression guard: the base single-owner policy is unaffected by the new
-- additive policy — a stranger still sees zero rows of ANY other user's
-- non-delegated items in a broad scan.
SELECT is(
  (SELECT count(*)::int FROM inbox_items WHERE user_id IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002')),
  0,
  'A stranger cannot see any of the delegator''s or delegatee''s inbox_items via a broad scan (base per-user RLS intact)'
);
ROLLBACK TO SAVEPOINT as_stranger_items_select;

-- ── Delegatee CAN see the delegator's source item (additive SELECT policy) ──
SAVEPOINT as_delegatee_source_select;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000002"}';
SELECT is(
  (SELECT count(*)::int FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000001'),
  1,
  'The delegatee CAN SELECT the delegator''s source item while the delegation is live'
);
ROLLBACK TO SAVEPOINT as_delegatee_source_select;

-- ── Delegatee CANNOT update or delete the delegator's source item ───────────
SAVEPOINT as_delegatee_source_update;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000002"}';
UPDATE inbox_items SET text = 'Hijacked' WHERE id = '32000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000001' AND text = 'Hijacked'),
  0,
  'The delegatee cannot UPDATE the delegator''s source item (additive policy is SELECT-only)'
);
DELETE FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000001'),
  1,
  'The delegatee cannot DELETE the delegator''s source item (still present afterwards)'
);
ROLLBACK TO SAVEPOINT as_delegatee_source_update;

-- ── Delegator CANNOT directly update the delegatee's copy ───────────────────
SAVEPOINT as_delegator_delegatee_item_update;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001"}';
UPDATE inbox_items SET text = 'Hijacked by delegator' WHERE id = '32000000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT count(*)::int FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000002' AND text = 'Hijacked by delegator'),
  0,
  'The delegator cannot UPDATE the delegatee''s copy directly (no RLS grant on a row they don''t own)'
);
ROLLBACK TO SAVEPOINT as_delegator_delegatee_item_update;

-- ── Delegatee CAN see their own incoming delegation row ─────────────────────
SAVEPOINT as_delegatee_delegation_select;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000002"}';
SELECT is(
  (SELECT count(*)::int FROM inbox_item_delegations WHERE id = '33000000-0000-0000-0000-000000000001'),
  1,
  'The delegatee can SELECT their own incoming delegation row'
);
ROLLBACK TO SAVEPOINT as_delegatee_delegation_select;

-- ── One-active-delegation-per-source-item constraint ────────────────────────
SAVEPOINT as_duplicate_delegation;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001"}';
SELECT throws_ok(
  $$INSERT INTO inbox_item_delegations (source_item_id, delegator_user_id, delegatee_user_id, team_member_id, status)
    VALUES ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', 'pending')$$,
  NULL,
  'A second live delegation for the same source_item_id is rejected (idx_inbox_item_delegations_one_active_per_source)'
);
ROLLBACK TO SAVEPOINT as_duplicate_delegation;

-- ── Two-way status sync: delegatee marks their copy done ────────────────────
SAVEPOINT as_delegatee_marks_done;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000002"}';
UPDATE inbox_items SET status = 'done', done_at = now() WHERE id = '32000000-0000-0000-0000-000000000002';
-- RELEASE, not ROLLBACK TO — the trigger's side effects (below) must persist.
RESET role;
RESET request.jwt.claims;
RELEASE SAVEPOINT as_delegatee_marks_done;

-- Verify the trigger propagated: delegation is done, source item is done,
-- source item's active_delegation_id is cleared, source item's body carries
-- a completion note. Read back as postgres (bypassing RLS) since we're
-- verifying ground truth, not a specific user's read access.
SELECT is(
  (SELECT status FROM inbox_item_delegations WHERE id = '33000000-0000-0000-0000-000000000001'),
  'done',
  'fn_sync_delegation_on_delegatee_item_change marks the delegation done when the delegatee completes their copy'
);
SELECT is(
  (SELECT status FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000001'),
  'done',
  'The sync trigger marks the delegator''s source item done'
);
SELECT is(
  (SELECT active_delegation_id FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000001'),
  NULL,
  'The sync trigger clears active_delegation_id on the delegator''s source item'
);
SELECT ok(
  (SELECT body FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000001') LIKE '%Completed by%',
  'The sync trigger appends a "Completed by" note to the delegator''s source item body'
);
SELECT isnt(
  (SELECT completed_at FROM inbox_item_delegations WHERE id = '33000000-0000-0000-0000-000000000001'),
  NULL,
  'completed_at is set on the delegation once the delegatee marks it done'
);

-- ── Two-way status sync: delegator cancels -> delegatee's copy is archived ──
-- Fresh delegation for this half of the sync test, so it starts from a clean
-- pending state independent of the completed one above.
INSERT INTO inbox_items (id, user_id, type, text, status)
VALUES ('32000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'task', 'Second task', 'open');
INSERT INTO inbox_items (id, user_id, type, text, status)
VALUES ('32000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', 'task', 'Second task', 'open');
INSERT INTO inbox_item_delegations (id, source_item_id, delegator_user_id, delegatee_user_id, delegatee_item_id, team_member_id, status)
VALUES (
  '33000000-0000-0000-0000-000000000002',
  '32000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '32000000-0000-0000-0000-000000000004',
  '31000000-0000-0000-0000-000000000001',
  'pending'
);
UPDATE inbox_items SET active_delegation_id = '33000000-0000-0000-0000-000000000002' WHERE id = '32000000-0000-0000-0000-000000000003';

SAVEPOINT as_delegator_cancels;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001"}';
UPDATE inbox_item_delegations SET status = 'cancelled' WHERE id = '33000000-0000-0000-0000-000000000002';
-- RELEASE, not ROLLBACK TO — the trigger's side effects (below) must persist.
RESET role;
RESET request.jwt.claims;
RELEASE SAVEPOINT as_delegator_cancels;

SELECT is(
  (SELECT status FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000004'),
  'archived',
  'fn_sync_delegation_on_cancel archives the delegatee''s copy when the delegator cancels'
);
SELECT is(
  (SELECT active_delegation_id FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000003'),
  NULL,
  'fn_sync_delegation_on_cancel clears active_delegation_id on the delegator''s source item'
);

-- ── Delegatee cannot cancel/tamper with a delegation on someone else's behalf ─
-- (i.e. the delegatee updating status to something other than what their own
-- UPDATE policy permits still only affects rows where they are named
-- delegatee_user_id — re-verifying the base RLS boundary holds here too.)
SAVEPOINT as_stranger_update_delegation;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000003"}';
UPDATE inbox_item_delegations SET status = 'cancelled' WHERE id = '33000000-0000-0000-0000-000000000001';
SELECT isnt(
  (SELECT status FROM inbox_item_delegations WHERE id = '33000000-0000-0000-0000-000000000001'),
  'cancelled',
  'A stranger cannot update a delegation they are not a party to'
);
ROLLBACK TO SAVEPOINT as_stranger_update_delegation;

-- ── get_inbox_delegation_display_names: only resolves names for delegations
--    the caller is actually a party to ─────────────────────────────────────
SAVEPOINT as_delegator_names_rpc;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000001"}';
SELECT is(
  (SELECT count(*)::int FROM get_inbox_delegation_display_names(ARRAY['33000000-0000-0000-0000-000000000001'::uuid])),
  1,
  'get_inbox_delegation_display_names resolves names for a delegation the caller is the delegator on'
);
ROLLBACK TO SAVEPOINT as_delegator_names_rpc;

SAVEPOINT as_stranger_names_rpc;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000003"}';
SELECT is(
  (SELECT count(*)::int FROM get_inbox_delegation_display_names(ARRAY['33000000-0000-0000-0000-000000000001'::uuid])),
  0,
  'get_inbox_delegation_display_names returns nothing for a delegation the caller has no part in'
);
ROLLBACK TO SAVEPOINT as_stranger_names_rpc;

-- ── Cross-check: a totally unrelated user's inbox_items are still invisible
--    to the delegatee too (delegation grants a narrow exception, not a
--    broad one) ───────────────────────────────────────────────────────────
INSERT INTO inbox_items (id, user_id, type, text, status)
VALUES ('32000000-0000-0000-0000-000000000099', '30000000-0000-0000-0000-000000000003', 'task', 'Stranger''s private item', 'open');

SAVEPOINT as_delegatee_broad_scan;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000002"}';
SELECT is(
  (SELECT count(*)::int FROM inbox_items WHERE id = '32000000-0000-0000-0000-000000000099'),
  0,
  'The delegatee still cannot see an unrelated stranger''s inbox_items row (additive policy is narrowly scoped, not a blanket cross-user grant)'
);
ROLLBACK TO SAVEPOINT as_delegatee_broad_scan;

SELECT * FROM finish();
ROLLBACK;
