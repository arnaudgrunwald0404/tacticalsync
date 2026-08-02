# Security Audit: Pre-2026-07-13 migrations (follow-up to security_audit_20260730.md)

Scope: every `CREATE VIEW` and `SECURITY DEFINER` function in `supabase/migrations/`
dated **before** `20260713000001` (182 files) — the window `security_audit_20260730.md`
explicitly left unaudited, since it scoped itself to `20260713000001` and later.
Same two bug classes as that report: `security_invoker` gaps on views over
user-scoped tables, and `SECURITY DEFINER` functions missing `SET search_path`.

Starting hypothesis going in: "2 suspect SELECT * views, ~8 SECURITY DEFINER
functions without search_path." Verified against the actual current migration
state (deduping every function/view to its *latest* `CREATE OR REPLACE`, since
several are redefined 2–3 times across this window) rather than taken at face
value — see Self-refuted section for where the hypothesis overcounted.

---

## Findings

### `personal_priorities` view (`20260602073707_rename_personal_to_quarterly_priorities.sql:7`)

1. **[HIGH] Backward-compat view bypasses `quarterly_priorities`' privacy-scoped RLS**
   - Evidence: `CREATE OR REPLACE VIEW personal_priorities AS SELECT * FROM quarterly_priorities;`
     — no `security_invoker`, so it runs with the view owner's privileges.
     `quarterly_priorities`' RLS (`20260602155907_make_commitment_quarters_company_wide.sql:59-77`)
     is genuinely privacy-scoped, not company-wide: `"Managers can view direct
     reports priorities"` and `"Admins can view all priorities"` — a plain
     employee cannot see a peer's priorities through the base table.
   - Risk Level: High
   - Attack Scenario: Any authenticated user calls PostgREST directly —
     `GET /rest/v1/personal_priorities?select=*` — bypassing the app's own
     frontend entirely (Supabase exposes every public-schema view via the REST
     API regardless of whether frontend code queries it). The view's
     owner-privilege execution returns every user's priorities, not just
     direct reports/admin-scoped ones.
   - Impact: Cross-user disclosure of quarterly priorities (goals/commitments
     content), including for users with no manager relationship to the
     caller.
   - Solution (applied): the migration's own comment says "drop once all code
     references are updated" — grepped `src/` and `supabase/functions/` and
     found zero references (only the generated `types.ts` mentions it), so
     `20260803000007_pre_20260713_security_definer_and_view_audit.sql` drops
     it outright rather than leaving a second `security_invoker` view to
     track.

### `SECURITY DEFINER` functions missing `SET search_path`

2. **[HIGH] `is_admin()`** (`20251030090000_add_admin_role_and_rls.sql:8`)
   - Evidence: `RETURNS BOOLEAN AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;`
     — no `SET search_path` anywhere in this or any later migration.
   - Risk Level: High — this is the highest-leverage function in the batch:
     it's called inside dozens of RLS `USING`/`WITH CHECK` clauses across
     teams, RCDO, commitments, and org talking points (`grep -l is_admin
     supabase/migrations/*.sql` matches 16 files). A search_path hijack that
     got `is_admin()` to resolve an attacker-shadowed object instead of
     `public.profiles` could forge a positive admin check across every policy
     that calls it, not just one table.
   - Impact: Potential privilege escalation across every `is_admin()`-gated
     policy if `public` schema object creation is ever reachable by a
     non-superuser role (defense-in-depth — no evidence this precondition
     currently holds, see "Could not verify" below).
   - Solution (applied): `ALTER FUNCTION public.is_admin() SET search_path = public;`

3. **[MEDIUM] `handle_new_user()`** (latest def: `20260607000000_fix_default_role_tags.sql:5`)
   - Evidence: `$$ LANGUAGE plpgsql SECURITY DEFINER;` (trailing-clause style,
     no `SET search_path`) — redefined 3 times across this window
     (`20251022070000`, `20251022140000`, `20260607000000`), none set it.
   - Risk Level: Medium — fires on every `auth.users` signup, writes into
     `public.profiles`. Not directly RPC-callable by a client, but still a
     hardening gap on a function that runs unconditionally for every new
     account.
   - Impact: Same class as above, scoped to the signup path.
   - Solution (applied): `ALTER FUNCTION public.handle_new_user() SET search_path = public;`

4. **[LOW] `rcdo_cascade_lock_sis_on_do()`** (latest def: `20251122060500_cascade_unlock_si_on_do.sql:4`)
   - Evidence: same trailing-clause pattern, no `SET search_path`, in both the
     original and the redefinition.
   - Risk Level: Low — trigger-only (fires on `rc_defining_objectives`
     UPDATE), not independently callable, and its body only runs a hardcoded
     `UPDATE rc_strategic_initiatives`.
   - Solution (applied): `ALTER FUNCTION public.rcdo_cascade_lock_sis_on_do() SET search_path = public;`

5. **[LOW] `sync_super_admin_on_insert()` / `sync_super_admin_on_update()`** (`20251106020000_fix_profiles_rls_separate_table.sql:54,65`)
   - Evidence: both trailing-clause `SECURITY DEFINER`, no `SET search_path`.
   - Risk Level: Low — trigger-only (fires on `public.profiles`
     insert/update), hardcoded body syncing `public.super_admins`.
   - Solution (applied): `ALTER FUNCTION ... SET search_path = public;` for both.

---

## Self-refuted (no fix needed)

- **`cos_forgotten_commitments`** (`20260620000000_relationship_memory_agent_foundation.sql:183`)
  — this is almost certainly one of the "2 suspect views" in the starting
  hypothesis: no `security_invoker` in its original migration, matching the
  live-bug pattern exactly. But it was already found and fixed by
  `20260803000005_fix_cos_forgotten_commitments_security_invoker.sql`
  (caught by `e2e/inbox/personMemoryPrivacy.spec.ts`, per `[[project-security-invoker-view-gap]]`),
  which is already merged into `main`. No further action.

- **`rc_top_level_strategic_initiatives`** (`20260603165625_add_sub_sis.sql:24`)
  — no `security_invoker` either, but `rc_strategic_initiatives`' own SELECT
  policy is `"All authenticated users can view initiatives"`
  (`20251112100000_make_rcdo_company_wide.sql:257`) — i.e. already open to
  every authenticated user. The view's owner-privilege bypass grants nothing
  beyond what the base table already allows. Matches CLAUDE.md's "RCDO is
  company-wide, not team-scoped." No privacy boundary crossed.

- **`user_calendar_credentials_public` / `user_zoom_credentials_public` /
  `user_slack_credentials_public`** (`20260605000000`, `20260612000000`,
  `20260612100000`/`20260622000000`/`20260707000000`) — all three
  deliberately use `security_invoker = false, security_barrier = true` with
  an explicit `WHERE user_id = auth.uid()` filter and a column allowlist that
  excludes every token column. This is the exact same deliberate,
  already-validated-safe pattern `security_audit_20260730.md` confirmed for
  `user_slack_credentials_public`'s most recent redefinition — the two
  siblings use the identical shape. No findings.

- **`is_super_admin()`** — the hypothesis likely counted this given its
  history: defined without `search_path` in `20251024020000`, but *redefined*
  with `SET search_path = public` two migrations later in
  `20251106020000_fix_profiles_rls_separate_table.sql:37` (part of a larger
  rework moving super-admin checks onto a dedicated `super_admins` table).
  The live function already has the fix. No further action.

- **`is_team_member()` / `is_team_admin()` / `get_user_login_info()` /
  `get_users_login_info_batch()` / `check_manage_permissions()`** — all five
  set `search_path = public` correctly in their (only) definition. No
  findings.

- The starting "~8 SECURITY DEFINER functions without search_path" hypothesis
  overcounted relative to what's actually live: of 11 total SECURITY DEFINER
  function definitions in this window (13 counting superseded redefinitions),
  5 are genuinely missing it after deduping to the latest `CREATE OR REPLACE`
  — see Findings above. A prior naive pass over this window would plausibly
  land closer to 8 by counting raw file matches or superseded definitions
  without checking which ones a later migration in the same window already
  fixed (`is_super_admin`) — this pass corrects for that.

---

## Fixes applied

| File | Change |
|---|---|
| `supabase/migrations/20260803000007_pre_20260713_security_definer_and_view_audit.sql` | New — `SET search_path = public` on 5 functions; `DROP VIEW personal_priorities` |

## What is well-built

- The vast majority of this window's `SECURITY DEFINER` functions (6 of 11
  live) already had `search_path` set correctly, including every function
  created after the `20251106020000` profiles rework — the team's hygiene on
  this specific bug class visibly improved partway through the window.
- The three `*_credentials_public` views are a genuinely well-designed
  pattern (`security_barrier` + explicit `auth.uid()` filter + column
  allowlist) applied consistently across three different OAuth integrations
  (calendar, Zoom, Slack) — this is the correct way to expose a safe subset
  of an intentionally-lockdown table, not a workaround.
- `rc_top_level_strategic_initiatives`'s apparent gap turned out to be a
  non-issue purely because the base table's access model (company-wide,
  documented in CLAUDE.md) already grants the same access — a good example
  of why self-refuting against actual current RLS beats pattern-matching on
  "no security_invoker" alone.

## What could not be verified — please double-check

- Whether the `public` schema is writable by any non-superuser role in the
  live production database (the actual precondition for search_path
  hijacking to be exploitable at all, as opposed to defense-in-depth). Not
  checked here — recommend `SELECT has_schema_privilege('authenticated',
  'public', 'CREATE')` against production, or reviewing Supabase's advisor
  output directly (`get_advisors` in the Supabase MCP), which flags this
  function class explicitly (`function_search_path_mutable`).
- `personal_priorities` was confirmed unreferenced in `src/` and
  `supabase/functions/` (TypeScript/Deno) but not in any external tooling,
  BI exports, or saved Supabase Studio queries outside this repo.
