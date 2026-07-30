-- cos_forgotten_commitments (20260620000000_relationship_memory_agent_foundation.sql)
-- was never given security_invoker, unlike its sibling cos_manager_signal_*
-- views (see 20260729000003_fix_manager_signal_views_security_invoker.sql).
-- Without it, Postgres runs the view with its OWNER's privileges, bypassing
-- RLS on the underlying user-scoped cos_meeting_actions table entirely — any
-- authenticated user querying this view saw every user's overdue
-- commitments, not just their own. Caught by
-- e2e/inbox/personMemoryPrivacy.spec.ts.

ALTER VIEW cos_forgotten_commitments SET (security_invoker = true);
