-- Manager load & health signals (Idea #9): per-direct-report coaching views.
--
-- These views surface, for a manager, two rollups computed from the manager's
-- OWN inbox_items — never from anything a direct report authored themselves.
-- See PLAN_idea9_manager_signals.md §2.2 for why: cos_team_members rows are
-- private, manager-owned records (no verified FK to the report's own
-- auth.users identity), and inbox_tags(type='person') links an inbox item to
-- a cos_team_members row, not to the report's own account. So "close rate for
-- Jane" here means "close rate of the manager's own notes/tasks tagged with
-- Jane's name" — a reflection of the manager's follow-through, not Jane's.
--
-- RLS: no new policies needed. Both views select only through tables that
-- already carry owner-only RLS (`cos_team_members`, `inbox_items`,
-- `inbox_tags`, `inbox_item_tags`), and neither view is declared
-- SECURITY DEFINER, so Postgres enforces the caller's own RLS transparently
-- when querying the view. Do NOT add SECURITY DEFINER to these views without
-- re-adding an explicit manager_id = auth.uid() filter — see plan §6.2.
--
-- Volume: computed at query time, no materialized view — same call the
-- codebase already made for cos_forgotten_commitments (see
-- 20260620000000_relationship_memory_agent_foundation.sql).

-- ── View 1: per-report close-rate rollup ────────────────────────────────────
CREATE OR REPLACE VIEW cos_manager_signal_close_rate AS
SELECT
  ct.user_id                AS manager_id,
  ct.id                     AS member_id,
  ct.name                   AS member_name,
  ct.relationship_type,
  COUNT(*) FILTER (
    WHERE ii.created_at >= now() - interval '30 days'
  )                                                        AS total_30d,
  COUNT(*) FILTER (
    WHERE ii.created_at >= now() - interval '30 days' AND ii.status = 'done'
  )                                                        AS done_30d,
  COUNT(*) FILTER (
    WHERE ii.created_at >= now() - interval '90 days'
  )                                                        AS total_90d,
  COUNT(*) FILTER (
    WHERE ii.created_at >= now() - interval '90 days' AND ii.status = 'done'
  )                                                        AS done_90d
FROM cos_team_members ct
JOIN inbox_tags it        ON it.member_id = ct.id AND it.type = 'person'
JOIN inbox_item_tags iit  ON iit.tag_id = it.id
JOIN inbox_items ii       ON ii.id = iit.item_id AND ii.status != 'archived'
WHERE ct.relationship_type = 'direct_report'
GROUP BY ct.user_id, ct.id, ct.name, ct.relationship_type;

-- ── View 2: aging "Waiting on someone" / "Blocked" items per report ────────
CREATE OR REPLACE VIEW cos_manager_signal_aging_items AS
SELECT
  ct.user_id AS manager_id,
  ct.id      AS member_id,
  ct.name    AS member_name,
  ii.id      AS item_id,
  ii.text,
  ii.workflow_status,
  ii.updated_at,
  EXTRACT(DAY FROM (now() - ii.updated_at))::integer AS days_stale,
  CASE
    WHEN EXTRACT(DAY FROM (now() - ii.updated_at)) > 14 THEN 'critical'
    WHEN EXTRACT(DAY FROM (now() - ii.updated_at)) > 7  THEN 'warning'
    ELSE 'normal'
  END AS urgency
FROM cos_team_members ct
JOIN inbox_tags it        ON it.member_id = ct.id AND it.type = 'person'
JOIN inbox_item_tags iit  ON iit.tag_id = it.id
JOIN inbox_items ii       ON ii.id = iit.item_id
WHERE ii.workflow_status IN ('Waiting on someone', 'Blocked')
  AND ct.relationship_type = 'direct_report';
