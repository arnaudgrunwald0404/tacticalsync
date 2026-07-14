-- Follow-up hardening for the batch of tables/views/functions added by
-- 20260713000006 through 20260728000001 (deployed together after a long
-- backlog — see session notes). Supabase's security/performance advisors,
-- run immediately after that deploy, flagged these on the newly-created
-- objects specifically (pre-existing objects elsewhere in the schema were
-- left untouched — same conventions, out of scope here):
--
--   1. Missing covering indexes on foreign key columns (perf, INFO).
--   2. RLS policies calling auth.uid()/auth.role() directly instead of
--      `(select auth.uid())` — Postgres re-evaluates the bare form once per
--      row instead of once per query (perf, WARN: auth_rls_initplan).
--   3. inbox_item_delegations used a FOR ALL policy (delegator) alongside
--      separate FOR SELECT/UPDATE policies (delegatee), so SELECT and UPDATE
--      each had two permissive policies evaluated and OR'd together (perf,
--      WARN: multiple_permissive_policies) — consolidated into one policy
--      per command with the OR condition inlined, fixing both the
--      multiple-policies and the auth_rls_initplan warning in one pass.
--
-- Deliberately NOT touched: unused_index advisories on these same tables —
-- expected noise for indexes created seconds before the advisor ran, not a
-- real signal yet.

-- ── 1. Covering indexes for FK columns ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cos_relationship_documents_group_meeting_id
  ON cos_relationship_documents(group_meeting_id);
CREATE INDEX IF NOT EXISTS idx_cos_relationship_documents_team_member_id
  ON cos_relationship_documents(team_member_id);
CREATE INDEX IF NOT EXISTS idx_cos_team_member_invites_claimed_by_user_id
  ON cos_team_member_invites(claimed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_delegation_step_executions_user_id
  ON inbox_delegation_step_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_delegation_audit_log_actor_user_id
  ON inbox_delegation_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_delegation_audit_log_user_id
  ON inbox_delegation_audit_log(user_id);

-- ── 2. Wrap auth.uid() in a subselect so it's evaluated once per query ─────
ALTER POLICY "Users own their relationship docs" ON cos_relationship_documents
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "cos_action_item_scan_state: read own rows" ON cos_action_item_scan_state
  USING ((select auth.uid()) = user_id);

ALTER POLICY "inviter can manage own cos_team_member_invites" ON cos_team_member_invites
  USING ((select auth.uid()) = inviter_user_id)
  WITH CHECK ((select auth.uid()) = inviter_user_id);

ALTER POLICY "users read their own step executions" ON inbox_delegation_step_executions
  USING ((select auth.uid()) = user_id);

ALTER POLICY "users read their own delegation audit log" ON inbox_delegation_audit_log
  USING ((select auth.uid()) = user_id);

-- ── 3. inbox_item_delegations: one policy per command instead of per-role ──
-- Replaces "delegator can manage their outgoing delegations" (FOR ALL) +
-- "delegatee can view their incoming delegations" (FOR SELECT) +
-- "delegatee can update status on their incoming delegations" (FOR UPDATE)
-- with four single-policy-per-command equivalents carrying identical access:
--   INSERT — delegator only (delegatee never inserts, unchanged)
--   SELECT — delegator OR delegatee (unchanged)
--   UPDATE — delegator OR delegatee (unchanged)
--   DELETE — delegator only (unchanged — delegatee had no delete policy)
DROP POLICY IF EXISTS "delegator can manage their outgoing delegations" ON inbox_item_delegations;
DROP POLICY IF EXISTS "delegatee can view their incoming delegations" ON inbox_item_delegations;
DROP POLICY IF EXISTS "delegatee can update status on their incoming delegations" ON inbox_item_delegations;

CREATE POLICY "inbox_item_delegations: select as delegator or delegatee"
  ON inbox_item_delegations FOR SELECT TO authenticated
  USING ((select auth.uid()) = delegator_user_id OR (select auth.uid()) = delegatee_user_id);

CREATE POLICY "inbox_item_delegations: insert as delegator"
  ON inbox_item_delegations FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = delegator_user_id);

CREATE POLICY "inbox_item_delegations: update as delegator or delegatee"
  ON inbox_item_delegations FOR UPDATE TO authenticated
  USING ((select auth.uid()) = delegator_user_id OR (select auth.uid()) = delegatee_user_id)
  WITH CHECK ((select auth.uid()) = delegator_user_id OR (select auth.uid()) = delegatee_user_id);

CREATE POLICY "inbox_item_delegations: delete as delegator"
  ON inbox_item_delegations FOR DELETE TO authenticated
  USING ((select auth.uid()) = delegator_user_id);
