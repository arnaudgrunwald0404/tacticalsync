# Security Audit: Inbox Wave (migrations 20260713+ and related edge functions)

Scope: every `CREATE VIEW` and `SECURITY DEFINER` function in `supabase/migrations/`
dated `20260713000001` or later (68 files, through `20260803000004`); RLS on every
table added in that window, with special focus on the two-way `inbox_item_delegations`
sync; and authorization in seven edge functions: `delegate-inbox-item-to-person`,
`generate-person-brief`, `inbox-assistant-chat`, `agent-slack-action`,
`extract-inbox-action-items`, `gmail-inbox-sync`, `slack-inbox-sync`.

Context: two prior ad hoc fixes already closed similar gaps —
`20260729000003_fix_manager_signal_views_security_invoker.sql` and
`20260729000004_revoke_anon_execute_on_security_definer_functions.sql`. A third,
`20260803000005_fix_cos_forgotten_commitments_security_invoker.sql` (same
`security_invoker` bug class, different view), landed on another branch
concurrently with this audit and needs no further action.

All findings below were independently verified by reading the exact cited
file/lines after the initial pass (self-refute step) — quoted code is verbatim.

---

## Findings

### `supabase/migrations/20260727000001_inbox_item_delegations.sql` / `20260729000005_new_inbox_delegation_objects_perf_security.sql`

1. **[CRITICAL] Cross-user read/write IDOR via unvalidated delegation FK columns on UPDATE**
   - Evidence: `20260729000005_new_inbox_delegation_objects_perf_security.sql:76-79`
     ```sql
     CREATE POLICY "inbox_item_delegations: update as delegator or delegatee"
       ON inbox_item_delegations FOR UPDATE TO authenticated
       USING ((select auth.uid()) = delegator_user_id OR (select auth.uid()) = delegatee_user_id)
       WITH CHECK ((select auth.uid()) = delegator_user_id OR (select auth.uid()) = delegatee_user_id);
     ```
     The only guard on `source_item_id`/`delegatee_item_id`/`delegator_user_id`/
     `delegatee_user_id`/`team_member_id` — `fn_validate_inbox_item_delegation`
     (`20260727000001_inbox_item_delegations.sql:99-126`) — fires `BEFORE INSERT`
     only (`:124-126`). `delegate-inbox-item-to-person/index.ts:164-176` is the
     only legitimate writer of these columns, and sets all five exactly once, at
     insert.
   - Risk Level: Critical
   - Attack Scenario: An attacker who is a legitimate delegatee on any real
     delegation row (trivial to create, even between two accounts they control)
     runs `UPDATE inbox_item_delegations SET source_item_id = '<victim inbox_items.id>' WHERE id = '<their own delegation>'`.
     This passes both `USING` and `WITH CHECK` — they remain the named
     delegatee. The existing SELECT policy on `inbox_items`
     (`20260727000001:80-89`, `d.source_item_id = inbox_items.id AND
     d.delegatee_user_id = auth.uid() AND d.status IN ('pending','accepted')`)
     now grants them read access to the victim's private inbox item. A second,
     more damaging path: the attacker also sets `delegatee_item_id` to one of
     their own `inbox_items` rows, then flips that row's own status to `'done'`
     (which they're allowed to do). The `SECURITY DEFINER` trigger
     `fn_sync_delegation_on_delegatee_item_change`
     (`20260727000002_inbox_item_delegation_sync.sql:46-55`) fires, trusts
     `v_delegation.source_item_id` blindly, and writes attacker-chosen text
     into, and marks `done`, the **victim's** row — bypassing RLS entirely via
     `SECURITY DEFINER`. A third path via `fn_sync_delegation_on_cancel`
     (`20260727000002:94-99`) lets a rewritten `delegatee_item_id` get an
     arbitrary victim item silently archived.
   - Impact: Any other user's `inbox_items` row is readable and/or corruptible
     (forced to `done`/`archived`, body text appended) with no relationship to
     the attacker required.
   - Solution (applied): `supabase/migrations/20260803000006_lock_inbox_item_delegation_identity_columns.sql`
     adds a `BEFORE UPDATE` trigger making `source_item_id`,
     `delegatee_item_id`, `delegator_user_id`, `delegatee_user_id`, and
     `team_member_id` immutable after insert — closing the gap with zero
     functional impact, since nothing legitimately updates those columns.

---

### `supabase/functions/generate-person-brief/index.ts`

2. **[CRITICAL] No caller authentication — trusts client-supplied `user_id` for reads and inbox writes**
   - Evidence: `generate-person-brief/index.ts:69-79` (pre-fix) — no
     `Authorization` parsing, no `auth.getUser()`, no shared-secret check
     anywhere in the file; absent from `supabase/config.toml`, so it ran under
     the platform default `verify_jwt = true` (any authenticated user's own
     session token is sufficient to reach it).
     ```ts
     const body = await req.json() as { user_id: string; member_id: string; ... }
     const { user_id, member_id, event_id, meeting_time } = body
     ...
     .from('cos_team_members').select(...).eq('id', member_id).eq('user_id', user_id) // checked against attacker-chosen user_id
     ...
     .from('inbox_items').insert({ user_id, type: 'brief_item', ... }) // writes into that user_id's inbox
     ```
   - Risk Level: Critical
   - Attack Scenario: Any logged-in user calls this function with their own
     valid session JWT (satisfies the gateway) and body
     `{user_id: "<victim>", member_id: "<victim's cos_team_members.id>", ...}`.
     Every "ownership" check in the file is checked against the
     attacker-supplied `user_id`, verifying nothing.
   - Impact: Reads the victim's relationship topics/forgotten commitments,
     writes an unauthorized `inbox_items` row into the victim's account, and
     is an account-enumeration oracle via differential responses.
   - Solution (applied): require `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
     before trusting `body.user_id` — this function is documented
     (`index.ts:7-9`) as service-to-service only, called exclusively from
     `agent-tick`, which already always sends the service-role key
     (`agent-tick/index.ts:987-991`).

---

### `supabase/functions/gmail-inbox-sync/index.ts` and `supabase/functions/slack-inbox-sync/index.ts`

3. **[CRITICAL] `x-supabase-user-id` header trusted without proving possession of the service-role key**
   - Evidence: `gmail-inbox-sync/index.ts:173-181` and identically
     `slack-inbox-sync/index.ts:125-133` (pre-fix):
     ```ts
     if (xUserId) {
       userId = xUserId
     } else if (token && token !== serviceRoleKey) {
       ...
     }
     ```
     Contrast the correct pattern already used in the sibling function
     `extract-inbox-action-items/index.ts:256`:
     ```ts
     if (overrideUserId && jwt === serviceRoleKey) {
       targetUserIds = [overrideUserId]
     ```
   - Risk Level: Critical
   - Attack Scenario: Any authenticated user sends a request with their own
     valid session JWT as `Authorization` (any value satisfies the `xUserId`
     branch — it's never inspected there) and header
     `x-supabase-user-id: <victim-uuid>`. The function proceeds fully as the
     victim.
   - Impact: Full impersonation of the victim in both sync pipelines — reads
     the victim's Gmail/Slack OAuth-scoped content, burns their OAuth quota,
     and writes `dci_suggested_tasks` / marks `suggestion_source_processed`
     rows in the victim's account (which can cause the victim's next
     legitimate scan to silently skip real content).
   - Solution (applied): gate the header override on
     `xUserId && token === serviceRoleKey`, matching
     `extract-inbox-action-items`. Verified the legitimate caller
     (`agent-tick/index.ts:293-300`, `:328-336`) already always sends
     `Authorization: Bearer ${serviceRoleKey}` alongside the header, so this
     is a no-op for the real flow.

---

### `supabase/functions/agent-slack-action/index.ts`

4. **[LOW] Feedback handler doesn't verify the Slack-supplied `log_id` belongs to the resolved caller**
   - Evidence: `agent-slack-action/index.ts:227-236` (pre-fix) —
     ```ts
     if (effectiveId.startsWith('feedback:')) {
       const logId = parts[1]
       ...
       await supabase.from('cos_agent_feedback').insert({ user_id: userId, log_id: logId, ... })
     ```
     compared with the sibling `dismiss_escalation` handler two blocks above
     (`:206-211`), which does check `.eq('id', logId).eq('user_id', userId)`
     before acting.
   - Risk Level: Low — `userId` itself is soundly resolved (Slack request
     signature verified in `_shared/slack.ts:31-57`, then mapped via
     `user_slack_credentials`), so this is not caller impersonation; a
     forged/compromised Slack action could only attach a feedback row to a
     `log_id` it doesn't own — a write-only integrity issue, no data
     disclosure.
   - Impact: Feedback data could be misattributed to another user's
     `cos_agent_log` entry.
   - Solution (applied): added the same `.eq('id', logId).eq('user_id', userId)`
     ownership check used by `dismiss_escalation`, returning an ephemeral
     "not found" message if the log doesn't belong to the caller.

---

## Self-refuted (no fix needed)

- **`user_slack_credentials_public` view** (`20260801000000_slack_auto_sync.sql:20-41`)
  was created with `security_invoker = false`, matching the shape of the two
  already-fixed bugs. Verified this is intentional and safe, not a repeat of
  the bug: the base table `user_slack_credentials` has RLS **enabled with zero
  policies** (`20260612100000_slack_credentials.sql:21`, no matching
  `CREATE POLICY` anywhere), so switching this view to `security_invoker = true`
  would return zero rows to every authenticated caller — a regression, not a
  fix. The view instead uses `security_barrier = true` (blocks leaky-function
  pushdown before the `WHERE` clause runs) plus an explicit
  `WHERE user_id = auth.uid()` and a column allowlist that excludes
  `access_token`/`refresh_token`/`user_access_token` entirely. This is the
  correct, deliberate pattern for exposing a safe subset of an
  intentionally-lockdown table — left unchanged.

- **`inbox-assistant-chat`, `delegate-inbox-item-to-person`,
  `extract-inbox-action-items`, `agent-slack-action` (Slack signature check)**:
  read in full; each verifies caller identity via `auth.getUser()` or Slack
  request signature (`_shared/slack.ts`) and scopes every downstream query by
  the verified identity, never a client-supplied one. No findings.

- **`cos_manager_signal_close_rate` / `cos_manager_signal_aging_items` views**:
  had the `security_invoker` bug, already fixed by
  `20260729000003_fix_manager_signal_views_security_invoker.sql`. Verified the
  fix is sufficient given the RLS on the tables they join.

- All ~15 `SECURITY DEFINER` functions created in this window have
  `SET search_path = public` locked and had `anon`/`authenticated` `EXECUTE`
  correctly scoped by `20260729000004_revoke_anon_execute_on_security_definer_functions.sql`
  (or, where client-callable by design, validate the caller against
  `auth.uid()` internally — e.g. `claim_cos_team_member_invite`,
  `try_transition_delegation_step`, `get_inbox_delegation_display_names`).

- No table added in this window was found with RLS entirely disabled.

---

## Fixes applied

| File | Change |
|---|---|
| `supabase/migrations/20260803000006_lock_inbox_item_delegation_identity_columns.sql` | New — `BEFORE UPDATE` trigger locking the 5 delegation identity/FK columns |
| `supabase/functions/generate-person-brief/index.ts` | Require service-role bearer token before trusting `body.user_id` |
| `supabase/functions/gmail-inbox-sync/index.ts` | Gate `x-supabase-user-id` override on `token === serviceRoleKey` |
| `supabase/functions/slack-inbox-sync/index.ts` | Same gate |
| `supabase/functions/agent-slack-action/index.ts` | Ownership check on `log_id` before inserting feedback |

`npm run db:validate` passes with all 250 migrations, including the new one.

## What's well-built

- The delegation feature's *design* (insert-time relationship-legitimacy
  trigger, narrow additive SELECT policy on `inbox_items`, SECURITY DEFINER
  sync scoped to specific fields) is sound in spirit — the gap was purely
  "the same rigor wasn't applied to UPDATE." The extensive inline comments in
  these migrations (explaining *why* each policy exists) made this audit
  substantially faster and more reliable.
- `extract-inbox-action-items`'s three-way auth gate (service-role override /
  user JWT / cron self-discovery) is the correct reference pattern; the two
  sync functions just hadn't been brought in line with it.
- `agent-slack-action`'s Slack signature verification (constant-time compare,
  timestamp skew window, fail-closed) is textbook-correct.
- The team already has good instincts here: three separate ad hoc
  `security_invoker`/`EXECUTE`-grant fixes landed in this same window before
  this audit even started, and the audit found no new instance of that
  specific bug class beyond what's already fixed or self-refuted above.

## What could not be verified — please double-check

- I did not run the app or a live Postgres instance; all findings are static
  analysis of migration SQL and TypeScript source. Recommend running
  `supabase db reset` + the existing `e2e/inbox/` suite (which already has a
  `personMemoryPrivacy.spec.ts` for a related bug class) against the new
  migration before merging, and adding a regression test for the
  delegation-column-tampering scenario specifically.
- I did not audit `delegate-inbox-task` (a similarly-named but distinct
  function/branch visible in `git branch -a`) — out of the requested scope.
- Whether any production traffic has already exploited findings #2/#3 (no
  caller auth on `generate-person-brief`, unguarded header on the two sync
  functions) — recommend checking edge function logs for calls to these three
  functions with an `Authorization` header that is a user JWT rather than the
  service-role key.

## Addendum (2026-07-30): production exploitation check for findings #2/#3

Followed up on the open question above via the Supabase MCP against the live
`tactical-sync` project (`pxirfndomjlqpkwfpqxq`).

**Platform edge-function logs (`get_logs`) only retain the last 24 hours** —
this cannot answer the question for the actual exposure window, which ran
from `generate-person-brief`'s creation (`751d21f`, 2026-07-08) to the fix
(`fb09b10`, 2026-07-30), roughly 3 weeks. The last-24h window itself shows
zero calls to `generate-person-brief` at all (it only fires when agent-tick
has a due 1:1 brief), so it's uninformative either way. This means **no
direct request-level confirmation is possible** — the platform simply didn't
retain logs that far back.

Fell back to a DB-side forensic check instead: `generate-person-brief`'s
*write* side (finding #2) leaves a data trail — every call inserts an
`inbox_items` row with `type = 'brief_item'`. If an attacker had exploited
the no-auth gap to write into a victim's inbox, the `user_id` on some of
those rows would belong to someone other than the legitimate caller.

```sql
-- 322 real accounts existed before the fix — a genuine multi-tenant
-- attack surface, not a single-user toy deployment.
SELECT count(*) FROM auth.users;  --> 322

-- Every brief_item row, across the function's entire lifetime, belongs to
-- exactly one user_id.
SELECT count(*), count(DISTINCT user_id) FROM inbox_items WHERE type = 'brief_item';
--> 19 rows, 1 distinct user_id

-- Same check on the gmail/slack sync pipelines (finding #3): every
-- dci_suggested_tasks row's user_id matches the (also single) real
-- user_slack_credentials holder — no orphaned/mismatched user_id.
SELECT count(DISTINCT user_id) FROM dci_suggested_tasks;  --> 1
SELECT count(DISTINCT user_id) FROM user_slack_credentials;  --> 1
```

**No evidence of cross-user exploitation was found** for either finding: the
write-side data trail shows only one real user ever received a `brief_item`
or a synced Slack/Gmail suggestion, despite 322 accounts existing that could
have served as either attacker or victim. This is not proof of absence
(a pure read-only exfiltration via `generate-person-brief`'s response body —
reading a victim's relationship topics/forgotten commitments without ever
writing anything — would leave no trace in this data, and is exactly the
scenario finding #2 also describes), but it rules out the write-IDOR path
being used, and is the strongest evidence obtainable given the log-retention
gap above.

**Recommend**, if this needs a firmer answer: check whether the Supabase
project's plan includes extended log retention via the dashboard's Logs
Explorer (some plans retain 7–28 days, longer than this tool's 24h window) —
though even that would still fall short of the full 3-week exposure window.
