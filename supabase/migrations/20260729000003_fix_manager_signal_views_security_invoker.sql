-- 20260721000003_manager_signal_views.sql's own comment claims "neither view
-- is declared SECURITY DEFINER, so Postgres enforces the caller's own RLS
-- transparently when querying the view" — but omitting SECURITY DEFINER is
-- not sufficient on its own: Postgres views run with the OWNER's privileges
-- (bypassing RLS on the underlying owner-scoped tables) unless
-- security_invoker is explicitly set. Without this, any authenticated user
-- querying these views could see every manager's rollups, not just their
-- own. Confirmed via Supabase's security advisor (security_definer_view,
-- ERROR level) immediately after these views were first deployed.

ALTER VIEW cos_manager_signal_close_rate SET (security_invoker = true);
ALTER VIEW cos_manager_signal_aging_items SET (security_invoker = true);
