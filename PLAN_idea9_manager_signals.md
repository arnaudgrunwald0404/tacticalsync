# Plan: Idea #9 — Manager Load & Health Signals

Status: **PLANNING ONLY — no feature code written.** This document is for review/approval before implementation begins.

## 0. TL;DR

This idea is **blocked on a data-model gap that is more fundamental than sequencing on Idea #1 (Unified Funnel)**: there is currently no link in the schema between a manager's private "direct report" record (`cos_team_members`) and that report's actual account (`auth.users` / `profiles` / their own `inbox_items`). Every signal this feature wants to show — close rate, aging items, silent topics — depends on aggregating a *report's* inbox activity, but today `cos_team_members` is a free-text CRM row owned entirely by the manager, with no foreign key to the report's identity. RLS on both `inbox_items` and `cos_team_members` is strictly owner-only (`auth.uid() = user_id`). This plan covers what to build, but Phase 0 (identity linking) is a prerequisite that must be scoped and approved separately, and it is arguably higher-risk than anything else in this doc.

---

## 1. Existing Insights surface (grounding)

- **Route:** `src/App.tsx:98` → `<Route path="/insights" element={<DashboardWithTabs />} />`
- **Tab gating:** `src/pages/DashboardWithTabs.tsx` lazy-loads `./Insights` as `LazyInsightsPage` (line 9) and only renders the "insights" tab `if (isAdmin || isSuperAdmin)` (line 21, `showInsights`).
- **Page:** `src/pages/Insights.tsx` (293 lines). This is the *only* thing currently living at `/insights`.

What it actually does today — and why it's a false friend for this feature:
- It bootstraps the user's `team_id` from `team_members`, loads all `team_members` for that team, joins to `profiles(id, full_name)` — all via inline `.from().select()` calls in a `useEffect`, not a hook.
- It aggregates **quarterly priorities and monthly commitments** (`useActiveQuarter`, `useTeamCommitments` from `src/hooks/useCommitments.ts`) and lets an admin categorize each item into `churn_reduction` / `net_new_functionality` / `net_new_accounts` / `uncategorized` via `usePriorityAnalysis` (`src/hooks/usePriorityAnalysis.ts`), which reads/writes a `priority_categorizations` table and does **client-side** percentage-breakdown math over an in-memory array (`buildBreakdown()`).
- UI pattern: card sections (`rounded-xl border bg-white p-6 shadow-sm`) with a custom stacked percentage bar + legend, and clickable category chips. No charting library, no data tables.
- Scope: **per-team, admin-only**, RCDO-priority domain — entirely unrelated to inbox items, CoS team members, or per-person coaching data.

There is no `useInsights` hook anywhere in `src/hooks/`.

**Conclusion:** `/insights` is a real, live route with an established tab-based pattern (`DashboardWithTabs` + lazy page + admin gate), and this feature should plug into that pattern (a new tab or a new sub-view within it) rather than invent a new top-level route. But none of the *data* or *aggregation logic* on that page is reusable — it's a different domain (team-wide RCDO priorities vs. per-report coaching signals), and the page is presently gated to admins, which is the **wrong audience** for this feature (see §4 — this must be manager-only, not admin-only).

The closest reusable **aggregation pattern** in the codebase is not on the Insights page at all — it's the `cos_forgotten_commitments` SQL view:
```sql
-- supabase/migrations/20260620000000_relationship_memory_agent_foundation.sql:183-201
CREATE OR REPLACE VIEW cos_forgotten_commitments AS
SELECT
  a.id, a.user_id, a.member_id, a.text, a.due_date, a.created_at, a.surface_count,
  EXTRACT(DAY FROM (now() - a.created_at))::integer AS days_pending,
  CASE
    WHEN a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE - interval '7 days' THEN 'critical'
    WHEN EXTRACT(DAY FROM (now() - a.created_at)) > 30 THEN 'critical'
    WHEN a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE THEN 'warning'
    WHEN EXTRACT(DAY FROM (now() - a.created_at)) > 14 THEN 'warning'
    ELSE 'normal'
  END AS urgency
FROM cos_meeting_actions a
WHERE a.status = 'pending' AND (...)
```
consumed by a thin hook (`src/hooks/useRelationshipTopics.ts:132`, `.from('cos_forgotten_commitments').select(...)`) and by an edge function (`supabase/functions/generate-1on1-prep/index.ts:235`). The comment on the view (`"Computed at query time — no materialized view needed for this data volume"`) is the house style precedent this plan follows in §3.

---

## 2. The data-model gap (read this before anything else)

### 2.1 `cos_team_members` is not an org-chart edge

`supabase/migrations/20260419000000_create_cos_tables.sql`:
```sql
CREATE TABLE cos_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- the MANAGER
  name text NOT NULL,        -- free text, NOT a FK to auth.users
  role text NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN ('direct_report', 'collaborator')),
  context_notes text,
  last_1on1_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
`user_id` identifies the *manager* (the CoS module's owner). `name`/`role` describe the report as free text. A later migration (`20260605000000_calendar_integration.sql`) adds `cos_team_members.email`, but explicitly and only "for attendee matching" against calendar invites (`match_strategy: 'email_then_name'`) — it is not a verified, unique identity link, and there is no guarantee the email matches an `auth.users` row in this app at all (the report may not even be a TacticalSync user).

Twenty-five later migrations touch `cos_team_members` (1:1 prep, quotes, Slack, Zoom, relationship memory, etc.) — **none of them add a `manager_id`/reciprocal-`user_id` column**, confirmed by direct search.

Separately, the RCDO org model (`team_members`, `supabase/migrations/20251017000000_basic_tables.sql`) is a flat roster:
```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  ...
);
```
`role` is `admin`/`member` — there is no manager/report hierarchy here either. **No table in this schema encodes "user A manages user B."**

### 2.2 Consequence for "items tagged to a person"

`inbox_tags` (type `'person'`) has `member_id uuid REFERENCES cos_team_members(id)`. So "an inbox item tagged to a person" means: **the manager's own inbox item**, tagged with a person-tag pointing at one of the manager's private `cos_team_members` rows. It is the manager's notes/tasks *about* Jane, tracked in the manager's own inbox — **not Jane's own inbox activity, and not anything Jane created or can see.**

This reframes the whole feature. Read literally, "close rate of action items tagged to a direct report" is really "close rate of the manager's own tasks/notes that the manager tagged with that report's name" — which is a legitimate and useful coaching signal (it reflects the manager's own follow-through on things concerning that report), but it is **not** a signal about the report's behavior, productivity, or performance. That framing is actually good news for the "coaching aid, not surveillance" requirement (see §4) — the data literally cannot be about the report's personal output, because the report never touches these rows. But it must be stated correctly in the product copy, or it will be misread as measuring the employee rather than the manager's own responsiveness to that employee.

### 2.3 RLS today

Only two `CREATE POLICY` statements exist for these tables in the entire migrations directory (confirmed exhaustive search, no later ALTER/DROP touches):
```sql
-- 20260419000000_create_cos_tables.sql
CREATE POLICY "Users can manage own cos_team_members"
  ON cos_team_members FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 20260713000001_inbox_tables.sql
CREATE POLICY "inbox_items: own rows" ON inbox_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
Both are strict owner-only. **This is actually the correct RLS shape for what this feature turns out to need** (see §2.2 — all the source data is already scoped to the manager's own `user_id`), which considerably simplifies the security story versus what the source doc implies. There is no cross-user read to authorize, because the signals are computed entirely from rows the manager already owns. §6 revisits this in detail, including the one place a future identity-linking phase would change this.

### 2.4 Idea #1 (Unified Funnel) status

Exhaustive repo-wide search for "funnel" (case-insensitive, all file types) returns **zero matches** — no table, no component, no doc reference beyond the source planning doc. It has not shipped and has no scaffolding. Treat §7's phase ordering as strict: do not start building the aggregation layer until either (a) idea #1 is live and person-tagged inbox volume is real, or (b) this plan's low-volume fallback (§7, Phase 2) is explicitly accepted as the launch condition.

---

## 3. Signal definitions

All three signals are computed **per `cos_team_members` row** (i.e., per report-as-tracked-by-this-manager), scoped to `inbox_items.user_id = auth.uid()` joined through `inbox_item_tags` → `inbox_tags` where `inbox_tags.member_id = cos_team_members.id AND inbox_tags.type = 'person'`.

### 3.1 Close rate
- **Definition:** `done_count / total_count` for items tagged to the person, where `total_count` excludes `status = 'archived'` (archiving is a dismissal, not a work outcome) and the window is rolling (default 30 days, configurable 7/30/90) keyed on `created_at`.
- `done_count`: `status = 'done'` AND `done_at` within the window (use `done_at`, not `created_at`, so an old item closed this week counts in this week's rate, matching how a manager would intuitively read "did we close things this period").
- Denominator ambiguity to resolve explicitly in spec review: "items created in window" vs. "items open at any point during window." Recommend **created-in-window** for v1 (simplest, matches the `cos_forgotten_commitments` precedent of created_at-based aging) and note the alternative as a v2 refinement.
- Guard against divide-by-zero / low-N: if `total_count < 5`, do not render a percentage — render "not enough data yet (N items)" (see §4, this is also a framing guardrail, not just a math one).

### 3.2 Aging items ("Waiting on someone" / "Blocked")
- **Definition:** items tagged to the person where `workflow_status IN ('Waiting on someone', 'Blocked')`, sorted descending by `days_since = EXTRACT(DAY FROM (now() - updated_at))`.
- Use `updated_at`, not `created_at`, as the aging clock — an item that has been sitting in "Blocked" is more accurately timed from when it *entered* that state. Caveat: the current schema does not timestamp workflow_status transitions, so `updated_at` is a proxy that also moves on unrelated edits (e.g. text edits bump `updated_at` without a status change). Flag as a known imprecision for v1; a future migration could add `workflow_status_changed_at` if this proves misleading in practice.
- Surface top N (e.g. 5) oldest per person, with an urgency tier mirroring `cos_forgotten_commitments`' style (`critical` > 14 days, `warning` > 7 days, `normal` otherwise — tune thresholds with real usage data once idea #1 ships).

### 3.3 "Topics that never surface"
- **Definition (proposed):** a `workstream`-type `inbox_tag` (per `20260713000005_inbox_tags_parent_workstream.sql`, tags can be nested under a parent via `parent_id`) that is associated with the person (i.e., has been co-tagged on at least one item alongside the person's `person`-type tag historically) but has had **zero new items** co-tagged with that person in the last N days (default 21 — roughly 3 weekly 1:1 cycles).
- This requires a defined universe of "topics associated with this person" — proposed as: any `workstream` tag that has ever appeared on the same `inbox_item` as this person's `person` tag. New workstreams with no history yet are excluded (nothing to compare against "never surfaces again").
- This is the least well-specified signal and the most likely to need a product/design pass before engineering: what counts as a "topic" (workstream tags only, or also `project`/`context` tags?), what N should be, and whether to show absence (a topic that stopped) vs. presence (topics that show up) as the primary framing. **Recommend treating this as a stretch signal for a later phase (§7) rather than launch-blocking**, since it's the signal most likely to produce false "silence" readings (e.g., a workstream that legitimately finished, not one being avoided).

---

## 4. Framing requirement: coaching aid, not performance scoring

This is a product-risk item, not just an engineering one — flag for a dedicated copy/UX review before any UI ships, not as a trailing polish pass.

**Concrete guardrails:**
1. **No cross-report ranking or leaderboard.** Never render reports sorted by close rate against each other on the same screen in a way that invites comparison (no "Jane: 90%, Tom: 40%" side-by-side table). If multiple reports are shown, sort alphabetically or by last-interaction recency, never by score.
2. **No raw percentage as the headline.** Lead with the underlying facts ("3 of 4 items from the last 30 days are still open") and treat the percentage as secondary, de-emphasized text — or omit it below a minimum N (see §3.1).
3. **Frame as questions, not verdicts.** Copy pattern: instead of "Close rate: 40%" prefer "4 items are still open from your notes on Jane — worth a check-in?" Instead of "3 items aging in Waiting on someone," prefer "3 things you flagged as waiting on Jane haven't moved in 2+ weeks."
4. **Always attribute to the manager's own tracking, not the report's output**, per §2.2 — e.g. never "Jane hasn't closed her action items," always "Items you've noted for Jane are still open." This is both more accurate (per the data model) and inherently less surveillance-flavored.
5. **No export/print/share of a single report's signal view** in v1 — reduces risk of this being pasted into a performance review doc out of context.
6. **No historical trend line comparing a report's rate over time framed as "improving/declining"** without a human-legible caveat — a naive downward trend line reads exactly like a performance chart. If trends ship at all, pair with the low-N guard and a one-line disclaimer ("based on your own inbox notes, not a full picture").
7. **Access-copy note:** the entry point should be labeled in a way that signals its purpose, e.g. "Coaching prep" or "1:1 signals," not "Report performance" or "Team scorecard."
8. **Recommend a lightweight internal review** (PM/design, not just eng) of the final copy and layout before launch — this doc is not a substitute for that review, it's the trigger for scheduling it.

---

## 5. Query / aggregation layer

### 5.1 Approach: SQL views + thin hook (follow `cos_forgotten_commitments` precedent)

Given current expected volume (one manager, single-digit-to-low-tens of direct reports, hundreds not millions of inbox items), **no materialized view or scheduled job is needed at launch** — same conclusion the codebase already reached for `cos_forgotten_commitments` ("Computed at query time — no materialized view needed for this data volume"). Revisit if/when idea #1 (Unified Funnel) meaningfully increases person-tagged item volume; the migration path from a plain view to a materialized one refreshed on a cron (there's existing scheduled-job infra to check — see `supabase/functions/` for existing cron-triggered edge functions as precedent) is low-risk to defer.

Proposed new views (new migration file, see §5.2):

```sql
-- View 1: per-report close-rate rollup (rolling window parameterized via a companion function, or fixed windows precomputed as columns)
CREATE OR REPLACE VIEW cos_manager_signal_close_rate AS
SELECT
  ct.user_id                AS manager_id,
  ct.id                     AS member_id,
  ct.name                   AS member_name,
  ct.relationship_type,
  COUNT(*) FILTER (WHERE ii.created_at >= now() - interval '30 days') AS total_30d,
  COUNT(*) FILTER (WHERE ii.created_at >= now() - interval '30 days' AND ii.status = 'done') AS done_30d,
  COUNT(*) FILTER (WHERE ii.created_at >= now() - interval '90 days') AS total_90d,
  COUNT(*) FILTER (WHERE ii.created_at >= now() - interval '90 days' AND ii.status = 'done') AS done_90d
FROM cos_team_members ct
JOIN inbox_tags it        ON it.member_id = ct.id AND it.type = 'person'
JOIN inbox_item_tags iit  ON iit.tag_id = it.id
JOIN inbox_items ii       ON ii.id = iit.item_id AND ii.status != 'archived'
WHERE ct.relationship_type = 'direct_report'
GROUP BY ct.user_id, ct.id, ct.name, ct.relationship_type;

-- View 2: aging items (reuses cos_forgotten_commitments' urgency-tier style, but scoped to inbox_items/workflow_status)
CREATE OR REPLACE VIEW cos_manager_signal_aging_items AS
SELECT
  ct.user_id AS manager_id,
  ct.id      AS member_id,
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
```
View 3 ("topics that never surface") is deferred to a later phase per §3.3/§7 and is not specified in SQL here pending the product decision on scope.

Both views inherit RLS from the underlying tables (Postgres views run with the querying user's permissions by default unless declared `SECURITY DEFINER`/security-barrier in a way that bypasses RLS — **do not** make these `SECURITY DEFINER`; there's no need to, since the manager already owns every row via `cos_team_members.user_id = ii.user_id = auth.uid()`). Add `WHERE ct.user_id = auth.uid()` is not needed inside the view (RLS on `cos_team_members` and `inbox_items` already restricts joined rows to the caller's own), but the hook should still filter `.eq('manager_id', userId)` defensively and for query-planning clarity.

### 5.2 New migration
- `supabase/migrations/<timestamp>_manager_signal_views.sql` — creates the two (or three, pending §3.3 decision) views above. No new tables, no RLS changes needed (see §6).

### 5.3 New hook: `useManagerSignals.ts`
- Location: `src/hooks/useManagerSignals.ts`, following the codebase convention that components never query Supabase directly.
- Shape (mirroring `useRelationshipTopics.ts`'s thin-view-consumer style, not `usePriorityAnalysis`'s client-side aggregation style):
  ```ts
  export function useManagerSignals(managerId: string | null, windowDays: 30 | 90 = 30) {
    // .from('cos_manager_signal_close_rate').select('*').eq('manager_id', managerId)
    // .from('cos_manager_signal_aging_items').select('*').eq('manager_id', managerId).order('days_stale', desc)
    // returns { closeRates, agingItems, loading, error, refetch }
  }
  ```
- Sub-hooks to consider, matching the `useRCDO.ts` pattern of many specialized small hooks rather than one giant hook: `useManagerCloseRates(managerId, windowDays)`, `useManagerAgingItems(managerId)`, composed by a top-level `useManagerSignals`.
- No realtime subscription needed for v1 (these are trailing/aggregate signals, not live collaborative state) — skip `useRealtimeSubscription`/`useRCDORealtime` integration; a manual refetch-on-tab-focus or refetch button is sufficient.

---

## 6. Privacy, scoping, and RLS verification

1. **Who should see this:** only the direct manager (the `cos_team_members.user_id` owner) — never the report themselves (they may not even be a TacticalSync user, and even if they are, seeing "your manager's notes about your close rate" is a different, separately-scoped feature not in scope here), never other managers, and **not necessarily admins** — reconsider the current `/insights` admin-only gate (§1); this feature should be manager-scoped, not admin-scoped, since an admin who is not the direct manager has no legitimate need to see another manager's private coaching notes about their reports.
2. **RLS today already prevents cross-manager leakage**, as a structural side effect of §2.2/§2.3: since all source rows (`cos_team_members`, `inbox_items`, `inbox_tags`) are owned by `auth.uid() = user_id` and the new views join only through those tables without `SECURITY DEFINER`, Postgres RLS will transparently restrict every view row to the querying manager's own data. **This should still be explicitly tested** (§8) rather than assumed, especially to catch a future regression if someone later marks the view `SECURITY DEFINER` for performance reasons without re-adding a manual scope filter.
3. **Privacy concern — aggregating employee behavior data:** re-affirm per §2.2 that no signal here touches data the report authored or can see; it is 100% the manager's own inbox content, reflected back to them. This should be stated in an internal privacy/data-handling note (not necessarily a public policy change) so that if this ever surfaces in a data subject access request or an internal audit, the answer is ready: "this is the manager's own notes, not employee-authored data."
4. **Misuse risk if scope expands later:** if a future phase adds real identity-linking (§2.1) so that a report's *own* inbox/task activity becomes visible to their manager, that is a materially different and higher-risk feature (real employee-authored data, real surveillance risk) and should require its own privacy review, explicit employee-facing disclosure, and likely legal/HR sign-off — flag this now so it isn't quietly smuggled in as a "v2 enhancement" without that review.
5. **Verify, don't assume:** run `get_advisors` (Supabase security advisor) against the new views once created, and do the manual two-account RLS test described in §8.

---

## 7. Incremental steps and effort estimate

Doc suggests 4–6 weeks once the funnel (idea #1) is live. Breakdown:

**Phase 0 — Pre-req check (not part of the 4-6 week estimate, gating condition):**
- Confirm idea #1 has shipped and person-tagged inbox item volume is non-trivial (define a concrete threshold, e.g. "median direct report has ≥10 person-tagged items in the last 30 days across a sample of active manager accounts") OR explicitly accept the low-volume fallback copy ("not enough data yet") as the launch state for accounts below threshold.
- Decide the admin-vs-manager access model for where this lives in `/insights` (§6.1) — this is a small product decision but blocks the UI work in Phase 2.

**Phase 1 — Data layer (est. 1 week):**
- Write and review the two SQL views (§5.1) as a new migration.
- Write `useManagerSignals.ts` and sub-hooks (§5.3).
- Unit tests for the hook against a seeded local Supabase instance (see §8).
- Run `npm run db:validate` and Supabase advisors on the new migration.

**Phase 2 — Core UI: close rate + aging items (est. 1.5–2 weeks):**
- New section/tab within the existing `/insights` surface (or a new sub-route if the access-model decision in Phase 0 requires separating from the admin-gated page — likely `/insights/coaching` or a new tab in `DashboardWithTabs`, gated on "has ≥1 `direct_report` in `cos_team_members`" rather than `isAdmin`).
- Per-report card UI following the existing card pattern (`rounded-xl border bg-white p-6 shadow-sm`) from `Insights.tsx`, but with the copy/framing guardrails from §4 baked in from the first draft, not retrofitted.
- Low-N empty/insufficient-data states (§3.1, §7 Phase 0 fallback).
- Copy/UX review pass (§4.8) — schedule this **during** Phase 2, not after, so copy issues don't require UI rework.

**Phase 3 — Aging items detail + polish (est. 0.5–1 week):**
- Expandable list of aging items per report, urgency-tier styling reusing the `cos_forgotten_commitments` visual language if it exists elsewhere in the UI, or defining a small new one consistently.
- Loading/error states, refetch affordance.

**Phase 4 — "Topics that never surface" (est. 1–1.5 weeks, stretch — can slip to a follow-up release):**
- Finalize the product definition from §3.3 (needs its own mini design pass — flag explicitly as not fully spec'd in this doc).
- View 3 + hook extension + UI.

**Phase 2.5 — Onboarding & user education (est. 3–4 days, folded into Phase 2, not additive to the top-line estimate):**
- Write and wire the first-run/empty-state copy, the inline disclaimer/tooltip, and the "what's new" changelog entry (see §8a for full copy drafts and touchpoints).
- This phase is sequenced *inside* Phase 2 (not after it) for the same reason the copy/UX review is: the disclaimer tooltip in particular is load-bearing for the "coaching aid, not surveillance" requirement and must exist before the signals UI is considered done, not bolted on afterward.

**Total: 4–6 weeks matches Phases 1–3 (core signals, inclusive of Phase 2.5's education work); Phase 4 is a candidate to cut from the initial release without breaking the feature's core value, given it's the least-specified signal.**

---

## 8. Files to change / create

**New files:**
- `supabase/migrations/<timestamp>_manager_signal_views.sql` — the two (or three) views from §5.1.
- `src/hooks/useManagerSignals.ts` — top-level hook.
- `src/hooks/useManagerCloseRates.ts` and `src/hooks/useManagerAgingItems.ts` (or kept as internal functions within `useManagerSignals.ts` if small enough — decide during implementation based on `useRCDO.ts`'s convention for when sub-hooks get their own file vs. staying colocated).
- New UI component(s), e.g. `src/components/insights/ManagerSignalsPanel.tsx`, `src/components/insights/ReportSignalCard.tsx`, `src/components/insights/AgingItemsList.tsx` (exact names/locations TBD at implementation time, but should live under a directory mirroring existing `src/components/<domain>/` conventions).
- Test files: `src/test/useManagerSignals.test.ts` (or colocated per existing test conventions — check `src/test/` structure at implementation time), `e2e/insights/manager-signals.spec.ts` for the RLS/access e2e check.

**Modified files:**
- `src/pages/DashboardWithTabs.tsx` — add/adjust tab gating logic if the access model changes from `isAdmin || isSuperAdmin` to a manager-scoped check (§6.1, §7 Phase 0 decision).
- `src/pages/Insights.tsx` — add the new section, or split into sub-routes if the product decision favors separating admin-priority-analysis from manager-coaching-signals (likely the right call given they're different audiences — flag as an open question for the Phase 0 product decision, not decided in this doc).
- Possibly `src/App.tsx` if a distinct route (e.g. `/insights/coaching`) is chosen over a tab-within-tab approach.
- `supabase/db_health` / `db:validate` config — none expected, but re-run validation after adding the migration.

---

## 8a. Onboarding & User Education

This feature carries the highest copy risk of any signal-surfacing work in this plan — §4 already established that a misread "employee scorecard" is a real product risk, not just a tone issue. Good in-product education is not decoration here; it is the mechanism that makes §4's guardrails actually work in practice, because a manager who never reads the framing correctly can misuse an accurately-labeled feature just as easily as a badly-labeled one. This section gives concrete, ship-ready copy drafts (still subject to the copy/UX review in §4.8) rather than leaving "add helpful copy" as a TODO.

**Effort estimate:** 3–4 days, folded into Phase 2 (§7, "Phase 2.5"), not additive to the 4–6 week total — this is UI/copy work that rides along with the core close-rate/aging-items UI build, not a separate workstream.

### 8a.1 First-run / empty-state copy (low-N guard)

Trigger condition: a given direct report has `total_count < 5` tagged items in the active window (§3.1), **or** the manager has zero direct reports tagged with any person-tag yet at all (a distinct, earlier empty state — the "haven't started tagging" case).

**State A — manager has direct reports in `cos_team_members` but hasn't tagged any inbox items to them yet:**
> **Nothing to show yet**
> Tag inbox items to a direct report's name to start building a coaching view here — open items, follow-ups, and things worth raising in your next 1:1.
> [Go to Inbox →]

**State B — a specific report has fewer than 5 tagged items in the current window (the per-card low-N guard from §3.1):**
> Not enough tagged items yet for [Name] this period (3 so far). Check back after a few more 1:1s or tag a few more notes to them.

Design notes:
- State B intentionally shows the raw count ("3 so far") rather than a percentage or a bare "insufficient data" — this keeps the copy concrete and non-judgmental, and reinforces §4.2 (no bare percentage below the N-guard).
- Neither state should use alarming language ("no data," "missing," "incomplete") — both are neutral, forward-looking, and give the manager an action to take (tag more, go to inbox), consistent with framing this as something the manager builds by using their own inbox, not something that's missing about the report.

### 8a.2 Inline tooltip / disclaimer — the single most important copy in this plan

This must appear directly adjacent to every rendered signal (close rate number, aging-item list, and any future topic-silence signal), not buried in a help doc or a one-time modal that can be dismissed and forgotten. Recommend a small info-icon (ⓘ) next to each report's card header, using the existing tooltip primitive already in the design system (check `src/components/ui/tooltip.tsx` / shadcn `Tooltip` usage elsewhere, e.g. in `Insights.tsx`'s pattern of small `text-muted-foreground` annotations, for visual consistency).

**Tooltip copy (draft, ~40 words — short enough to read in a hover, precise enough to prevent the exact misreading flagged in §2.2/§4):**
> This reflects **your own notes and tasks** about [Name] — not their work or performance. It's built from items you tagged to them in your inbox, so it's only as complete as your own tagging habits.

Alternate, slightly shorter version if the tooltip component has a tight character budget:
> Based on items **you've** tagged to [Name] in your inbox — this shows your own follow-through, not their performance.

Guardrail check against this copy: it (a) uses "your"/"you've" as the grammatical subject, never "[Name] has/hasn't," satisfying §4.4; (b) names the mechanism (tagging, inbox) so it's falsifiable/checkable by the manager rather than a vague disclaimer; (c) fits in a hover without needing a click-through, so it can't be missed the way a dismissible onboarding modal can.

Also apply the same subject-of-the-sentence rule to every dynamic string generated by the hook/UI layer — e.g. the empty states in §8a.1 and the aging-item copy in §4.3 already follow this pattern ("items you flagged," not "Jane hasn't moved"); this tooltip is the reference copy the rest of the UI's microcopy should be checked against during the §4.8 review.

### 8a.3 "What's new" callout / changelog entry

Draft copy for wherever this app surfaces release notes/changelog entries (check for an existing changelog UI — `CHANGELOG.md` exists at the repo root but appears to be a dev-facing file, not an in-product surface; if there is no in-product "what's new" mechanism yet, the fallback touchpoint is a one-time dismissible callout anchored to the new tab/section itself, shown on first visit and then not repeated):

> **New: Coaching prep for your direct reports**
> Before: no visibility into follow-through on things you'd noted for your reports.
> Now: a coaching-prep view of your own open items per person — what's still open, what's been waiting a while, all pulled from your own inbox notes. Nothing here is about their performance; it's a mirror on your own tracking, meant to prep for your next 1:1.
> [Try it →]

This copy deliberately models §4's framing rules inside the announcement itself (per the coordinator's explicit ask) — "Before/Now" contrasts the manager's own visibility gap, not the report's behavior, and "a mirror on your own tracking" restates the §2.2/§8a.2 distinction a third time (empty state, tooltip, changelog) because repetition across independent touchpoints is the actual mechanism that prevents misreading, not any single perfect sentence.

### 8a.4 Discovery: how a manager first finds this feature

Given the access-gate change recommended in §6.1/§7 Phase 0 (from `isAdmin || isSuperAdmin` to "has at least one `direct_report` row in `cos_team_members`"), discovery needs two parts:

1. **Structural visibility:** the tab/section should only appear once a manager has at least one `direct_report`-type row — so the natural discovery moment is *after* a manager has already used the CoS module (`src/pages/ChiefOfStaff.tsx`) to add a direct report. Recommend a contextual nudge inside `ChiefOfStaff.tsx` itself, near wherever a `direct_report` is added or listed (via `useTeamMembers.ts`), e.g. a small inline note the first time a manager has ≥1 direct report and ≥1 person-tagged inbox item: "Coaching signals for [Name] are now available in Insights" with a direct link — this closes the loop between "I just tagged something to my report" and "there's now a view for that," rather than relying on the manager to stumble into the Insights tab unprompted.
2. **Tab-level affordance:** once inside `/insights` (or wherever Phase 0's access-model decision lands it — see §8 open question on whether to split into a separate route), a first-visit-only callout per §8a.3 handles in-surface discovery for a manager who does browse there directly.
- Do **not** rely on a generic "new feature" badge/dot alone — given the misreading risk, the first click into this feature should always land on copy that establishes the framing (§8a.2/§8a.3) before or alongside the data, never data-first with framing as an afterthought.

### UI touchpoints / files (additive to §8)

- `src/pages/Insights.tsx` (or the new manager-signals component under `src/components/insights/`, per §8) — render the §8a.2 tooltip beside every signal, and the §8a.1 empty states.
- `src/components/insights/ManagerSignalsPanel.tsx` (per §8's proposed new file) — home for the first-visit callout (§8a.3) if no app-wide changelog surface exists.
- `src/pages/ChiefOfStaff.tsx` and/or `src/hooks/useTeamMembers.ts` — contextual nudge described in §8a.4, point 1 (exact insertion point TBD at implementation time; needs a check for where direct reports are added/listed in that page today).
- Copy strings should live in one place close to the components (no i18n/strings system evident elsewhere in the codebase to follow, so inline strings matching existing convention are fine) so the §4.8 copy review can review them as a single diff.

---

## 9. Risks (consolidated)

1. **Data-model gap is the primary risk, not sequencing** (§2). Even after idea #1 ships, the "direct report" concept in `cos_team_members` remains a manager-owned free-text row with no verified link to the report's real identity. This actually *simplifies* privacy/RLS (§6) but *narrows* what the feature can honestly claim to measure — it must be framed as "your own notes about this person," never "this person's behavior." If product intent is really "the report's own task completion," that requires a separate, much bigger identity-linking and consent project, explicitly out of scope here.
2. **Sparse/misleading data pre-idea-#1.** Confirmed zero scaffolding for Unified Funnel exists yet (§2.4). Do not launch signals against accounts with near-zero person-tagged items — the low-N guard (§3.1) and the Phase 0 volume threshold are required, not optional polish.
3. **Framing/perception risk** (§4) — the single highest-severity non-engineering risk. A misread "employee scorecard" perception could cause real harm (trust, morale, potential HR/legal exposure) even though the underlying data is technically just the manager's own notes. Requires a dedicated copy/UX review, not just an engineering sign-off.
4. **Access-model drift.** If this ships inside the currently admin-gated `/insights` page without changing the gate, admins who are not the direct manager would see coaching notes about reports that aren't theirs — this is a concrete near-term privacy bug risk if Phase 0's access-model decision isn't made explicitly and tested (§8 RLS test).
5. **`updated_at` proxy imprecision for aging** (§3.2) — could produce false "this has been blocked for 20 days" readings when the real cause was an unrelated text edit. Low severity but worth a known-issues note at launch.
6. **"Topics that never surface" is under-specified** (§3.3) — highest risk of producing a confusing or wrong signal (e.g., flagging a legitimately-completed workstream as "gone silent"). Recommend deferring to Phase 4 / a follow-up release rather than blocking the core launch.

---

## 10. Test coverage

**Unit tests (Vitest):**
- `useManagerSignals` / sub-hooks: correct close-rate math (done/total, window boundaries, archived-exclusion, divide-by-zero → low-N state) against a mocked Supabase client or seeded local instance.
- Aging-items sort order and urgency-tier thresholds (boundary tests at exactly 7 and 14 days).
- Empty-state rendering when a report has zero tagged items.
- Copy/label snapshot tests for the framing guardrails in §4 (e.g. assert the UI never renders a bare percentage without the minimum-N guard, assert no leaderboard/sort-by-score code path exists).

**Integration/DB tests:**
- Seed two manager accounts (`managerA`, `managerB`), each with their own `cos_team_members` direct reports and `inbox_items`/`inbox_tags`/`inbox_item_tags`. Query the new views as `managerA` and assert zero rows belonging to `managerB`'s reports are returned — this is the core RLS check.
- **Explicit RLS test requested by the task:** authenticate as `managerA`, query `cos_manager_signal_close_rate` and `cos_manager_signal_aging_items` filtered/unfiltered by `manager_id`, and assert the result set never includes `managerB`'s `member_id`s even if `managerA` guesses/supplies `managerB`'s `member_id` or `manager_id` directly in the query (i.e. test that RLS enforces this at the database level, not just that the hook happens to filter correctly client-side). Implement as a Playwright e2e test using two seeded test users and direct Supabase client calls (bypassing the UI) to attempt the cross-manager read, expecting an empty result, not an error (RLS silently filters rather than erroring, per Postgres RLS semantics) — assert on emptiness explicitly rather than assuming.
- Test that a report's own account (if they are a TacticalSync user) cannot query these views for themselves and get their manager's notes about them (should return empty, since `inbox_items.user_id` is the manager's ID, not theirs).
- `npm run db:validate` after adding the migration; `db:health` check.

**E2E (Playwright):**
- `e2e/insights/manager-signals.spec.ts`: log in as a manager with seeded direct reports and person-tagged inbox items; verify the signals panel renders expected close-rate and aging-item data; verify low-N empty state for a report with too few items; verify no leaderboard/ranking UI exists (assert absence, not just presence of correct elements).
- Access-control e2e: log in as a non-manager admin (if the admin gate is retained anywhere) and verify they cannot see another manager's report signals; log in as a manager and verify they see only their own reports.
- Visual/copy review checklist (manual, tied to §4): confirm no cross-report comparison view, confirm question-framed copy, confirm no export/print affordance in v1.

**Manual/product review (not automated):**
- Copy/UX review sign-off (§4.8) before launch — track as a checklist item in the release, not a test suite entry.
- Privacy/data-handling note reviewed internally (§6.3) before launch.
