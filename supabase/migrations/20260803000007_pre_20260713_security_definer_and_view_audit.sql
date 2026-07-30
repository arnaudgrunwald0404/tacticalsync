-- Follow-up to reports/security_audit_20260730.md, which deliberately scoped
-- itself to migrations 20260713000001 and later. This closes the two bug
-- classes that audit already fixed elsewhere in the post-window, but never
-- checked for in everything created before it. Full findings/self-refuted
-- candidates in reports/security_audit_pre20260713.md.

-- ── SECURITY DEFINER functions missing SET search_path ──────────────────────
-- Same search_path-injection hardening already applied broadly by
-- 20260729000004_revoke_anon_execute_on_security_definer_functions.sql (a
-- different bug class on the same function type — that migration tightened
-- EXECUTE grants, not search_path). Using ALTER FUNCTION rather than
-- CREATE OR REPLACE so this is a pure hardening no-op for every caller.

-- Fires on every new user signup (auth.users AFTER INSERT trigger) and
-- writes into public.profiles.
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Used as an admin-bypass check inside dozens of RLS policies across the
-- app (teams, RCDO, commitments, org talking points, etc.) — the highest-
-- leverage function in this batch, since a search_path hijack here would
-- potentially forge a positive admin check across every policy that calls it.
ALTER FUNCTION public.is_admin() SET search_path = public;

-- Trigger on rc_defining_objectives: cascades SI lock/unlock state.
ALTER FUNCTION public.rcdo_cascade_lock_sis_on_do() SET search_path = public;

-- Triggers on public.profiles: keep the super_admins table in sync with
-- profiles.is_super_admin.
ALTER FUNCTION public.sync_super_admin_on_insert() SET search_path = public;
ALTER FUNCTION public.sync_super_admin_on_update() SET search_path = public;

-- ── Dead backward-compat view bypassing quarterly_priorities' RLS ───────────
-- personal_priorities (20260602073707_rename_personal_to_quarterly_priorities.sql)
-- was created as `SELECT * FROM quarterly_priorities` with no
-- security_invoker, so Postgres runs it with the view owner's privileges,
-- bypassing quarterly_priorities' RLS entirely — which is genuinely
-- privacy-scoped ("Managers can view direct reports priorities" /
-- "Admins can view all priorities"), unlike the company-wide tables this
-- audit otherwise found. The migration's own comment said "drop once all
-- code references are updated"; grepping src/ and supabase/functions/ found
-- zero references (only the generated types.ts file mentions it), and
-- PostgREST exposes every public-schema view regardless of whether app code
-- calls it, so this was live, exploitable dead weight rather than a fix
-- candidate — dropping it removes the gap outright instead of leaving a
-- second security_invoker view to keep track of.
DROP VIEW IF EXISTS personal_priorities;
