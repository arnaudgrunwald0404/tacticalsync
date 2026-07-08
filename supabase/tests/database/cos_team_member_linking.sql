-- pgTAP tests for Phase 0 account-linking (cos_team_members <-> auth.users).
--
-- VERIFIED BY EXECUTION (as of the Idea #8 person-delegation follow-on work):
-- run against a standalone `public.ecr.aws/supabase/postgres` container with
-- this repo's full migration history applied — see the header comment in the
-- sibling supabase/tests/database/inbox_item_delegations.sql for the exact
-- setup and the two auth-schema compatibility shims that were needed (that
-- base image's auth.jwt()/auth.uid() lag the real hosted project). All 26
-- assertions in this file pass.
--
-- HOW TO RE-RUN (against a real local Supabase instance instead):
--   1. `supabase start`
--   2. `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
--         -f supabase/tests/database/cos_team_member_linking.sql`
--      (or point psql at your local Supabase Postgres connection string and
--      run this file directly; pgTAP must be enabled — `create extension
--      pgtap` — which Supabase's local stack provides out of the box.)
--
-- ROLE-SWITCHING MECHANICS:
-- Supabase's `auth.uid()` reads `request.jwt.claims ->> 'sub'`. Local pgTAP
-- runs let us fake this per-transaction with:
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<uuid>"}';
-- Since `SET LOCAL` is transaction-scoped and pgTAP wraps the whole file in
-- one BEGIN/ROLLBACK, we use explicit SAVEPOINTs between "acting as user X"
-- blocks so each block's role/claims can be reset independently without
-- losing the fixtures inserted before it.

BEGIN;
SELECT plan(26);

-- ── Fixtures (inserted as postgres/superuser, bypassing RLS) ────────────────
-- Three synthetic auth.users: the manager, the linked report, and an
-- unrelated third party who should never be able to see anything below.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'manager@example.com', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000002', 'report@example.com', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000003', 'stranger@example.com', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000004', 'other@example.com', 'x', now(), now(), now(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO cos_team_members (id, user_id, name, role, relationship_type, email)
VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Report Person', 'Engineer', 'direct_report', 'report@example.com');

-- ── Schema shape ─────────────────────────────────────────────────────────────
SELECT has_column('public', 'cos_team_members', 'linked_user_id', 'cos_team_members should have linked_user_id');
SELECT has_column('public', 'cos_team_members', 'linked_at', 'cos_team_members should have linked_at');
SELECT has_table('public', 'cos_team_member_invites', 'Table cos_team_member_invites should exist');
SELECT has_column('public', 'cos_team_member_invites', 'invite_code', 'cos_team_member_invites should have invite_code');
SELECT has_column('public', 'cos_team_member_invites', 'invited_email', 'cos_team_member_invites should have invited_email');
SELECT has_column('public', 'cos_team_member_invites', 'status', 'cos_team_member_invites should have status');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'cos_team_members'),
  'RLS should be enabled on cos_team_members'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'cos_team_member_invites'),
  'RLS should be enabled on cos_team_member_invites'
);

-- ── A stranger cannot SELECT a cos_team_members row they have no relation to ─
SAVEPOINT as_stranger;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';
SELECT is(
  (SELECT count(*)::int FROM cos_team_members WHERE id = '10000000-0000-0000-0000-000000000001'),
  0,
  'Stranger (not manager, not linked) cannot SELECT the cos_team_members row'
);
ROLLBACK TO SAVEPOINT as_stranger;

-- ── Manager can still see their own row (existing policy unaffected) ────────
SAVEPOINT as_manager_read;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
SELECT is(
  (SELECT count(*)::int FROM cos_team_members WHERE id = '10000000-0000-0000-0000-000000000001'),
  1,
  'Manager can still SELECT their own cos_team_members row'
);
ROLLBACK TO SAVEPOINT as_manager_read;

-- ── Link the row directly (as superuser, simulating a completed claim) ─────
UPDATE cos_team_members
SET linked_user_id = '00000000-0000-0000-0000-000000000002', linked_at = now()
WHERE id = '10000000-0000-0000-0000-000000000001';

-- ── Linked person CAN select their own linked row ───────────────────────────
SAVEPOINT as_linked_select;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
SELECT is(
  (SELECT count(*)::int FROM cos_team_members WHERE id = '10000000-0000-0000-0000-000000000001'),
  1,
  'Linked person can SELECT their own linked cos_team_members row via additive policy'
);
ROLLBACK TO SAVEPOINT as_linked_select;

-- ── Linked person CANNOT update the row (additive policy is SELECT-only) ────
SAVEPOINT as_linked_update;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
UPDATE cos_team_members SET name = 'Hijacked' WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM cos_team_members WHERE id = '10000000-0000-0000-0000-000000000001' AND name = 'Hijacked'),
  0,
  'Linked person cannot UPDATE the row (no matching UPDATE policy for linked_user_id)'
);
ROLLBACK TO SAVEPOINT as_linked_update;

-- ── Linked person CANNOT delete the row ─────────────────────────────────────
SAVEPOINT as_linked_delete;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
DELETE FROM cos_team_members WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM cos_team_members WHERE id = '10000000-0000-0000-0000-000000000001'),
  1,
  'Linked person cannot DELETE the row (still present afterwards)'
);
ROLLBACK TO SAVEPOINT as_linked_delete;

-- Unlink for the invite-flow tests below (reset to a clean, unlinked state).
UPDATE cos_team_members
SET linked_user_id = NULL, linked_at = NULL
WHERE id = '10000000-0000-0000-0000-000000000001';

-- ── Invite enumeration protection ───────────────────────────────────────────
INSERT INTO cos_team_member_invites (id, team_member_id, inviter_user_id, invited_email, invite_code, status)
VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'report@example.com', 'test-code-1', 'pending');

SAVEPOINT as_stranger_invites;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';
SELECT is(
  (SELECT count(*)::int FROM cos_team_member_invites WHERE id = '20000000-0000-0000-0000-000000000001'),
  0,
  'A user cannot SELECT another user''s cos_team_member_invites row (enumeration protection)'
);
ROLLBACK TO SAVEPOINT as_stranger_invites;

SAVEPOINT as_inviter_invites;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
SELECT is(
  (SELECT count(*)::int FROM cos_team_member_invites WHERE id = '20000000-0000-0000-0000-000000000001'),
  1,
  'The inviter can SELECT their own outgoing invite'
);
ROLLBACK TO SAVEPOINT as_inviter_invites;

-- ── claim_cos_team_member_invite: email mismatch is rejected ────────────────
SAVEPOINT as_wrong_claimant;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000004"}'; -- other@example.com, not report@example.com
SELECT is(
  (claim_cos_team_member_invite('test-code-1') ->> 'success')::boolean,
  false,
  'claim_cos_team_member_invite rejects a caller whose email does not match invited_email'
);
SELECT is(
  claim_cos_team_member_invite('test-code-1') ->> 'error',
  'email_mismatch',
  'claim_cos_team_member_invite reports email_mismatch for a non-matching caller'
);
ROLLBACK TO SAVEPOINT as_wrong_claimant;

-- ── claim_cos_team_member_invite: happy path as the correct claimant ────────
SAVEPOINT as_correct_claimant;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}'; -- report@example.com
SELECT is(
  (claim_cos_team_member_invite('test-code-1') ->> 'success')::boolean,
  true,
  'claim_cos_team_member_invite succeeds for the correctly-addressed claimant'
);
SELECT is(
  (SELECT linked_user_id FROM cos_team_members WHERE id = '10000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Claiming sets linked_user_id to the claimant'
);

-- ── double-claim is rejected ─────────────────────────────────────────────────
SELECT is(
  (claim_cos_team_member_invite('test-code-1') ->> 'success')::boolean,
  false,
  'Re-claiming an already-claimed invite fails'
);
SELECT is(
  claim_cos_team_member_invite('test-code-1') ->> 'error',
  'already_claimed',
  'Re-claiming reports already_claimed, not a silent no-op or double-link'
);
ROLLBACK TO SAVEPOINT as_correct_claimant;

-- ── cannot overwrite an existing different linked_user_id ───────────────────
-- Re-link the row (bypassing RLS as superuser) to user 2, then create a
-- second invite for the SAME team_member_id addressed to user 4, and try to
-- claim it as user 4 — it must be rejected because the row is already linked
-- to someone else.
UPDATE cos_team_members
SET linked_user_id = '00000000-0000-0000-0000-000000000002', linked_at = now()
WHERE id = '10000000-0000-0000-0000-000000000001';

INSERT INTO cos_team_member_invites (id, team_member_id, inviter_user_id, invited_email, invite_code, status)
VALUES ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'other@example.com', 'test-code-2', 'pending');

SAVEPOINT as_second_claimant;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000004"}'; -- other@example.com
SELECT is(
  claim_cos_team_member_invite('test-code-2') ->> 'error',
  'already_linked_to_other_user',
  'claim_cos_team_member_invite refuses to overwrite an existing different linked_user_id'
);
ROLLBACK TO SAVEPOINT as_second_claimant;

-- ── unlink_cos_team_member: unauthorized caller is rejected ─────────────────
SAVEPOINT as_unauthorized_unlink;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}'; -- stranger
SELECT throws_ok(
  $$SELECT unlink_cos_team_member('10000000-0000-0000-0000-000000000001')$$,
  'not_authorized',
  'unlink_cos_team_member raises not_authorized for a caller who is neither manager nor linked person'
);
ROLLBACK TO SAVEPOINT as_unauthorized_unlink;

-- ── unlink_cos_team_member: linked person can unlink themselves ────────────
SAVEPOINT as_linked_unlink;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
SELECT lives_ok(
  $$SELECT unlink_cos_team_member('10000000-0000-0000-0000-000000000001')$$,
  'unlink_cos_team_member succeeds when called by the linked person'
);
SELECT is(
  (SELECT linked_user_id FROM cos_team_members WHERE id = '10000000-0000-0000-0000-000000000001'),
  NULL,
  'linked_user_id is cleared after the linked person unlinks'
);
ROLLBACK TO SAVEPOINT as_linked_unlink;

-- Re-link once more (as superuser) to test the manager-initiated unlink path.
UPDATE cos_team_members
SET linked_user_id = '00000000-0000-0000-0000-000000000002', linked_at = now()
WHERE id = '10000000-0000-0000-0000-000000000001';

-- ── unlink_cos_team_member: manager can unlink too ──────────────────────────
SAVEPOINT as_manager_unlink;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
SELECT lives_ok(
  $$SELECT unlink_cos_team_member('10000000-0000-0000-0000-000000000001')$$,
  'unlink_cos_team_member succeeds when called by the manager'
);
ROLLBACK TO SAVEPOINT as_manager_unlink;

SELECT * FROM finish();
ROLLBACK;
