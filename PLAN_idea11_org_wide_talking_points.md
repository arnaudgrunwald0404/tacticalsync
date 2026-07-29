# Plan: Idea #11 — Org-Wide (or Team-Wide) Recurring Talking Points

Status: **PLANNING ONLY — no feature code written.** This document is for review/approval before implementation begins.

## 0. TL;DR

TacticalSync's 1:1 prep (`cos_one_on_one_prep`, assembled by `supabase/functions/generate-1on1-prep/index.ts`, rendered by `src/components/cos/OneOnOnePrepDrawer.tsx`) is entirely per-user, per-relationship content today — there is no mechanism for an admin/HR/leadership persona to inject a standing talking point into every manager's 1:1 agenda for a period (Lattice's "ask about the engagement survey this month" pattern). This plan proposes a small, new, deliberately narrow-scope addition:

- **Two new tables** (`cos_org_talking_points`, `cos_org_talking_point_dismissals`) — not a piggyback on the existing per-user `cos_prep_schedule` singleton, for reasons in §2.1.
- **A dual merge strategy** in `generate-1on1-prep`: fed into the Claude prompt as a new highest-priority context tier (so the AI can weave it into the narrative brief) **and** rendered deterministically in the frontend from the raw table (so the exact, unparaphrased leadership text is guaranteed to appear, independent of what the LLM does with it) — reasoning in §2.2.
- **`profiles.is_admin` (or `is_super_admin`) as the gate**, reusing the exact RLS pattern already established for RCDO going company-wide (`20251112100000_make_rcdo_company_wide.sql`) — explicitly **not** a fifth permission system (§2.3).
- **A new admin-only section in the existing Settings page** (`src/pages/Settings.tsx` / `src/components/ui/settings-navbar.tsx`), not a new page (§2.4).
- **Company-wide only for v1** — no team-targeting — because `cos_*`/1:1 prep has zero team-scoping anywhere today, confirmed by exhaustive search (§1.6, §2.5).
- **Per-(manager, direct-report) dismissal**, mirroring the existing `cos_meeting_actions` status-flip / `agent_overrides.excluded_talking_points` dismiss pattern already in `OneOnOnePrepDrawer.tsx` (§2.6).

The riskiest open call in this plan is §2.2 (how deep into the AI prompt vs. how much stays a deterministic UI element) — flagged explicitly for review, not silently decided.

---

## 1. Grounding: what exists today

### 1.1 The prep data model and its assembly

`cos_one_on_one_prep` (`supabase/migrations/20260423000000_create_cos_one_on_one_prep.sql:4-13`) is a per-user, per-team-member row:
```sql
CREATE TABLE IF NOT EXISTS cos_one_on_one_prep (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL UNIQUE REFERENCES cos_team_members(id) ON DELETE CASCADE,
  content text NOT NULL,
  source text NOT NULL CHECK (source IN ('cleargo', 'static')),
  ...
);
```
(Later migrations extend it with `prep_date`, `status`, `data_sources_used`, `event_id` — visible in the upsert at `generate-1on1-prep/index.ts:878-894` — but the RLS shape stays owner-only per `20260423000000`'s `"Users can manage own cos_one_on_one_prep"` policy, `auth.uid() = user_id`.)

The content itself is generated, not stored raw input: `supabase/functions/generate-1on1-prep/index.ts` gathers roughly a dozen internal signals in parallel (`cos_priorities`, `cos_meeting_actions`, `cos_person_accountabilities`, `cos_person_topics`, `cos_relationship_topics`, `cos_forgotten_commitments`, Zoom/Slack/Gmail history, quarterly priorities, open person-delegations — lines 137–264), assembles them into a `contextParts: string[]` array with a **three-tier source-discipline system prompt** (Tier 1 = direct comms, Tier 2 = team work context, Tier 3 = background-only manager priorities — lines 824–835), calls Claude Sonnet (`generate-1on1-prep/index.ts:861-866`), and stores the resulting Markdown in `cos_one_on_one_prep.content`.

**This is the key insight for merge-point design**: the assembled brief is free-text Markdown produced by an LLM under an instruction not to invent content it has no evidence for (`"DO NOT invent talking points"`, line 811). An org-wide talking point injected only as prompt context would be subject to the same paraphrase/compression/omission risk as everything else the model sees — it is not guaranteed to appear verbatim, or at all, in the output. See §2.2 for how this shapes the recommendation.

### 1.2 `OneOnOnePrepDrawer.tsx` — "Topics of the day"

`src/components/cos/OneOnOnePrepDrawer.tsx` renders the stored Markdown through a small parser, `parsePrepMarkdown()` (lines 103–144), which turns `##`/`###` headings + following bullets/paragraphs into `TopicSection[]`. `filteredTopics` (lines 511–529) strips noise sections (empty-result boilerplate, metadata headings). `rankedPoints` (lines 623–648) then re-sorts those sections by a **regex-based urgency tier** — P1 (`overdue|at-risk|blocker|...`), P2 (`decision|deadline|launch|...`), P3 (everything else) — purely by scanning the heading/body text, **not** by any structured field. The "Topics of the day" card itself (lines 1024–1134, heading at line 1026) renders `rankedPoints` with a `rankLabel`/`rankCls` badge (`P1`/`P2`/`P3`) and a static `"From prep brief"` chip (line 1072), followed by manager-added `customPoints` with a `"You"` / `"Custom topic"` chip (lines 1083–1094).

This is exactly the existing precedent for how a second, non-AI-derived content source already coexists in this same list: `customPoints` are **not** parsed from the AI markdown at all — they're a separate, client-only array (`useState`, not even persisted to a table today) rendered inline with their own visual badge. An org-wide talking point should follow this same shape: a third, deterministic source alongside `rankedPoints` (AI-derived) and `customPoints` (manager-added), with its own `"From leadership"` badge — not a text-matched subset of the parsed Markdown.

Dismissal precedent already exists too: `togglePoint()` (lines 650–668) excludes an AI-derived point by adding its synthetic key (`tp-{i}`, unstable across regenerations) to `cos_team_members.agent_overrides.excluded_talking_points` (jsonb array, column added in `20260627000000_phase5_feedback_health_overrides.sql:42`). The "N dismissed" collapsible section (lines 1095–1124) shows both dismissed AI points and dismissed custom points side by side with a line-through style. This is the UI chrome an org-wide talking point's dismiss state should plug into (§2.6, §5).

Separately, `cos_meeting_actions` (`supabase/migrations/20260424000000_add_cos_prep_inputs.sql:2-9`) shows the pattern for a **persisted**, per-(user, member) status flip: `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled'))`, toggled via `toggleAction()` (`OneOnOnePrepDrawer.tsx:556-564`). This is a better model to copy for org-wide dismissal than the ephemeral jsonb array, because a dismissal here needs to survive prep regeneration and be queryable by an admin later (§2.6, §3).

### 1.3 `cos_prep_schedule` — why it's not a fit

`supabase/migrations/20260612200000_prep_schedule.sql:4-26` is a **singleton per user** (`user_id uuid PRIMARY KEY`) holding *when* and *how* a user's own preps auto-generate (`run_hour_utc`, `always_include`, `sync_zoom_before`, `slack_channels`, etc.) — it is configuration, not content, and there is exactly one row per user by design (`PRIMARY KEY (user_id)`). A nullable-`user_id`-means-"applies to everyone" convention doesn't fit here at all: there is nowhere to attach the actual talking-point content (title/body/date range), and overloading a per-user settings singleton with org-wide broadcast content would be a confusing, undocumented dual purpose for one table. See §2.1 for the full reasoning on why a dedicated table is the right call instead.

### 1.4 Permission model landscape

Per `docs/SPECIFICATION.md` §4, four permission systems coexist:
1. `team_members.role` (`admin`/`member`, per-team) — irrelevant here; CoS/1:1 prep has no team scoping (§1.6).
2. `profiles` booleans: `is_admin`, `is_super_admin`, `is_rcdo_admin` (plus `is_executive`, added in `supabase/migrations/20251113233000_enforce_exec_do_owner.sql:5`, narrowly scoped to RCDO DO-ownership enforcement only — not a general admin flag, not a fit).
3. `role_tags`/`feature_permissions` — nav/section **visibility** gating only (`useFeaturePermissions().canAccess(featureKey)`), not row-level write authorization; also has a documented bug (`test_user` tag excluded from the `feature_permissions` CHECK constraint per `docs/SPECIFICATION.md` §14).
4. A hardcoded super-admin email fallback in `src/hooks/useRoles.ts:40-57` (`agrunwald@clearcompany.com` / `@gearcompany.com`) that best-effort persists `is_super_admin = true` back to `profiles` — a workaround, not something to build new capability on top of.

**The existing, already-shipped precedent for exactly this kind of decision** is RCDO's company-wide RLS (`supabase/migrations/20251112100000_make_rcdo_company_wide.sql`), e.g. the `rc_cycles` INSERT policy (lines 107–114):
```sql
CREATE POLICY "Admins and super admins can create cycles" ON rc_cycles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );
```
This same `(is_super_admin OR is_admin)` shape repeats 19 times across that one migration file for every RCDO write policy. It is the established "least-bad" gate for "an org-wide admin capability that isn't user/permission management itself" — see §2.3 for why this, not `is_rcdo_admin` or `feature_permissions`, is the recommendation here.

### 1.5 Where an admin would create these — the existing Settings surface

`src/components/ui/settings-navbar.tsx:5-41` defines the Settings page's nav model: a flat `NAV_ITEMS` array with a `group` field, filtered by two boolean props threaded from `src/pages/Settings.tsx`:
```tsx
interface SettingsNavbarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  userEmail?: string;
  showAdminManagement?: boolean;
  canManagePermissions?: boolean;
}
...
const visibleItems = NAV_ITEMS.filter(item => {
  if (item.group === "User Management" && !showAdminManagement) return false;
  if (item.id === "user-management-permissions" && !canManagePermissions) return false;
  ...
});
```
`Settings.tsx:2109-2115` passes `showAdminManagement={dbVerifiedSuperAdmin || isSuperAdmin}` — i.e., the entire "User Management" group (Users / Domains / Permissions) is gated to **super-admins only**, stricter than the `is_admin`-or-above gate recommended in §2.3/§1.4 for this feature. There is also a "RCDO" group (`strategy-cycles`, gated inside the page body on `isRCDOAdmin`/admin flags) and a "Check-Ins" group (`configure-my-lists`, `prep-schedule`, `meetings-prep`, `agent-settings`, `notifications`) that are all **per-user** CoS settings, not admin/org-wide config. **There is no existing "org-wide, admin-gated, non-super-admin" nav group** — this feature needs its own gate, not a reuse of `showAdminManagement`, or it will either over-restrict (fold into User Management, hidden from plain admins) or under-restrict (fold into Check-Ins, visible to everyone). See §2.4.

### 1.6 Team-scoping confirmation

Exhaustive search (`grep -rl "team_id" supabase/migrations | xargs grep -l "cos_"`) returns **zero matches** — no `cos_*` table has ever referenced `team_id`. `cos_team_members.relationship_type` (`20260606000000_extend_1on1_categories.sql:6-9`) supports `direct_report | collaborator | boss | peer | skip_level | stakeholder | external`, none of which are team identifiers — they describe the *relationship*, not an org unit. `teams`/`team_members` (RCDO's flat roster, `20251017000000_basic_tables.sql`) exist purely for the (mostly legacy) org-invite flow and RCDO's now-abandoned team scoping (RCDO itself went company-wide in `20251112100000`, per `CLAUDE.md`/`docs/SPECIFICATION.md` §5). **CoS/1:1 prep has never had a team concept, confirmed.** This directly informs the v1 scope recommendation in §2.5/§6.

### 1.7 Manager Signals (Idea #9) as a design precedent

Idea #9 shipped (`docs/SPECIFICATION.md` §7.8, §7.10; `supabase/migrations/20260721000003_manager_signal_views.sql`) and is the closest prior art for "surface something at the per-direct-report level without inventing new RLS": its views deliberately avoid `SECURITY DEFINER` and rely on the caller's own RLS through the underlying owner-scoped tables (`cos_manager_signal_views.sql:12-17`). This feature is different in one important way idea #9 was not: idea #9's data is 100% manager-owned (no cross-user read), whereas org-wide talking points are **admin-authored, all-managers-read** — the RLS shape needed here is the RCDO company-wide pattern (§1.4), not the Manager Signals owner-only pattern. Worth being explicit about this distinction so the new table doesn't accidentally get the wrong RLS template copied in.

---

## 2. Design decisions & blockers (each with an explicit recommendation)

### 2.1 New table(s), not a piggyback — recommend **new dedicated tables**

Two options considered:
- **(A) Piggyback**: add a nullable `user_id`/`team_member_id` to an existing table (e.g., `cos_person_topics`, `cos_priorities`) where null means "applies to everyone."
- **(B) New table(s)**: `cos_org_talking_points` (content) + `cos_org_talking_point_dismissals` (per-report dismissal state).

**Recommend (B).** Every existing `cos_*` content table (`cos_priorities`, `cos_person_topics`, `cos_meeting_actions`, `cos_one_on_one_prep`, etc.) has strictly owner-only RLS (`auth.uid() = user_id`, confirmed for each in its creating migration). Overloading one of them with a nullable-`user_id`-means-global convention would require special-casing the RLS policy on that one table only (`user_id = auth.uid() OR user_id IS NULL`), which is exactly the kind of implicit, undocumented dual-purpose column this codebase's own §14 "Structural cleanup candidates" section is trying to move *away* from, not toward. A dedicated table also needs a genuinely different RLS shape — all-authenticated-read / admin-only-write (§1.4, §1.7) — which is cleaner to reason about as its own table than as a conditional inside an owner-only table's existing policy. The content itself (title, body, a date range, `created_by`) also doesn't map onto any existing table's columns without adding several new nullable fields that only make sense for the org-wide case.

### 2.2 Merge point — the single riskiest call in this plan; recommend a **dual strategy**

The task frames this as "at what point in prep assembly would an org-wide talking point be merged in." Two candidate answers:

- **(A) Prompt-context only**: add the talking point as a new `contextParts` section in `generate-1on1-prep/index.ts` (analogous to the existing Tier 1/2/3 sections, lines 531–851) and let Claude weave it into the generated Markdown naturally.
- **(B) Deterministic frontend render only**: fetch active, non-dismissed org talking points directly in `OneOnOnePrepDrawer.tsx` (bypassing the AI entirely) and render them as fixed items in "Topics of the day," parallel to how `customPoints` already work (§1.2).

**Recommend both, not either alone:**
- (A) alone breaks the feature's core promise: an admin pushing "ask about the engagement survey" needs certainty it will actually appear in front of every manager, worded recognizably. The system prompt's own "DO NOT invent talking points" / strict source-discipline design (lines 807–851) is a rule specifically about *not* free-forming — an org-wide input is not something to free-form around either. An LLM call can drop, paraphrase past recognition, or deprioritize a talking point buried in a big prompt; that's an acceptable risk for the model's own synthesis of internal signals but not for a specific, admin-authored broadcast message.
- (B) alone loses the useful side effect of (A): letting the model consider the org-wide point when writing everything else (e.g., naturally framing "and given the engagement survey ask, here's how that connects to what she raised in Slack about morale last week").
- Doing both costs little: (A) is one more `contextParts.push(...)` block (new highest-priority tier, above Tier 1 — "Tier 0"), and (B) is one new small hook plus a new card-row branch in the existing "Topics of the day" render, following the `customPoints` precedent exactly (§1.2, §5).

Flagging explicitly: **this needs product sign-off**, not just engineering — if leadership wants the talking point to read as pre-written, verbatim leadership copy (like Lattice's original inspiration), doing only (B) is probably right and (A) is unnecessary/risky (the AI could accidentally alter the wording downstream if it's echoed back through the "Ask" chat feature, `sendAsk()`, lines 736–766, which is out of scope to specifically guard against in v1 — noting as an open item, not solving it here).

### 2.3 Permission gate — recommend **`profiles.is_admin` (or `is_super_admin`)**, explicitly not a fifth system

Per §1.4: `is_rcdo_admin` is domain-specific to RCDO objective/cycle finalization and has no conceptual connection to 1:1 prep content; `is_executive` is narrowly scoped to DO ownership enforcement; `role_tags`/`feature_permissions` gate nav visibility, not row-level write authority, and would require a **new** `FeatureKey` (there are already 10, per `docs/SPECIFICATION.md` §4) plus a fix-adjacent bug surface (the `test_user` CHECK-constraint gap, §14) that this feature doesn't need to inherit; the hardcoded email fallback in `useRoles.ts` is a stopgap, not a foundation. **Recommend the exact `(profiles.is_super_admin = true OR profiles.is_admin = true)` RLS predicate already used 19 times in `20251112100000_make_rcdo_company_wide.sql`** — same shape, same tables (`profiles`), same mental model as the most recent precedent for "org-wide admin write access," with zero new permission infrastructure. This is the same recommendation the task explicitly asked to make, stated here for the plan record: **do not build a fifth system.**

### 2.4 Where admin creates them — recommend **extending Settings, with a new gate prop**

Per §1.5, neither existing gate (`showAdminManagement`, super-admin-only; per-user "Check-Ins" group, everyone) fits an `is_admin`-or-above, org-wide-content capability. Recommend:
- A new `NAV_ITEMS` entry, e.g. `{ id: "org-talking-points", label: "Talking Points", group: "User Management" }` — reusing the existing "User Management" **group label** for discoverability (an admin looking for org-wide controls will look there first) but **not** reusing its visibility gate.
- A new prop on `SettingsNavbarProps`, e.g. `showOrgTalkingPoints?: boolean`, and a new filter line in `settings-navbar.tsx`'s `visibleItems` (`if (item.id === "org-talking-points" && !showOrgTalkingPoints) return false;`), passed from `Settings.tsx` as `showOrgTalkingPoints={isAdmin || isSuperAdmin}` (using the already-loaded `useRoles()` values at `Settings.tsx:78`, no new query).
- This keeps `showAdminManagement`'s stricter super-admin-only meaning intact (it also gates user/domain/permission management, a materially higher-stakes capability) while giving plain admins their own, correctly-scoped door into this specific feature — avoiding both the over- and under-restriction failure modes named in §1.5.

### 2.5 Team-scoping — recommend **company-wide only for v1**

Two options considered, matching the task's framing:
- **(A)** Always literally company-wide — every user with ≥1 `direct_report` sees every active talking point.
- **(B)** Optionally scoped to a specific team via `team_members`/`teams`.

**Recommend (A).** Per §1.6, CoS/1:1 prep has zero team-scoping anywhere in the schema today — there is no existing query pattern to join a `cos_team_members` row (the *report*) back to a `teams` row in any migration or hook, because the manager and report relationship in this module was never modeled against the RCDO-era `teams` table at all. Building team-targeting for v1 would mean inventing that join from scratch for a single feature, with no reuse elsewhere in the module, while RCDO — the one place `teams` used to matter — has already moved *away* from team scoping (`20251112100000_make_rcdo_company_wide.sql`, §1.6). Recommend a `target_scope text NOT NULL DEFAULT 'company' CHECK (target_scope IN ('company'))` column: present so a v2 "team" value can be added later without a schema migration for the column itself, but **CHECK-constrained to reject anything else today**, so the placeholder can't be silently misused before real team-targeting logic exists — the same pattern already used for `rc_cycles.company_id` ("reserved for future multi-tenancy," `docs/SPECIFICATION.md` §5).

### 2.6 Dismissal granularity — recommend **per (user_id, team_member_id, talking_point_id)**

The task asks specifically how a manager dismisses/acknowledges an org-wide point "once discussed." Recommend a dedicated table, `cos_org_talking_point_dismissals` (§3), with a unique constraint on `(talking_point_id, user_id, team_member_id)` — **scoped per direct report, not per manager globally.** Reasoning: the whole point of the feature is that a manager has this conversation separately with each report; dismissing it after discussing it with Report A should not hide it from Report B's still-upcoming 1:1. This mirrors `cos_meeting_actions`' existing per-`member_id` scoping exactly (§1.2) — every other piece of prep-adjacent state in this module (commitments, accountabilities, topics) is already scoped this way, so this isn't a new pattern, just applying the existing one to new content. Recommend a single boolean-style "dismissed" state for v1 (parity with how `togglePoint()` already treats AI-derived talking points — no distinction between "discussed" and "not relevant to this person" today either), but note the table's shape (a separate row with `dismissed_at`, rather than a status enum on the content table itself) would allow adding a `reason` column later without a breaking migration, if product wants that distinction in v2.

### 2.7 Relationship-type scope — recommend **`direct_report` only**

`cos_team_members.relationship_type` also includes `collaborator`, `boss`, `peer`, `skip_level`, `stakeholder`, `external` (§1.6). Recommend restricting org-wide talking points to `direct_report` rows only, matching the exact precedent already set by Manager Signals' views (`WHERE ct.relationship_type = 'direct_report'`, `20260721000003_manager_signal_views.sql:46,70`) — an HR/leadership talking point like "ask about the engagement survey" is a manager→report prompt by nature; injecting it into peer/stakeholder/external 1:1 preps would be a scope-creep the task didn't ask for and the existing precedent doesn't support.

---

## 3. Phase 1 — Schema

New migration (placeholder name/timestamp — not created in this PR): `supabase/migrations/<timestamp>_cos_org_talking_points.sql`.

```sql
-- Org-wide (or, in a future phase, team-wide) recurring talking points that
-- an admin/leadership persona injects into every direct-report 1:1's prep
-- for a bounded period. See PLAN_idea11_org_wide_talking_points.md.

CREATE TABLE cos_org_talking_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date NOT NULL,
  -- v1 is always company-wide; this column exists so a 'team' value can be
  -- added later (see plan §2.5) without a schema migration for the column
  -- itself. Do NOT allow any other value until team-targeting is built.
  target_scope text NOT NULL DEFAULT 'company' CHECK (target_scope IN ('company')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX idx_cos_org_talking_points_active_window
  ON cos_org_talking_points(active, starts_on, ends_on);

ALTER TABLE cos_org_talking_points ENABLE ROW LEVEL SECURITY;

-- Company-wide read (§1.7/§2.3) — every authenticated user can see active
-- talking points; the frontend/backend further filter to direct_report
-- 1:1s only (§2.7), which is a UI/query concern, not an RLS concern (an
-- admin-authored talking point is not sensitive the way a manager's own
-- notes are — see cos_manager_signal_* views' contrasting owner-only shape).
CREATE POLICY "All authenticated users can view org talking points"
  ON cos_org_talking_points FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and super admins can create org talking points"
  ON cos_org_talking_points FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Admins and super admins can update org talking points"
  ON cos_org_talking_points FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Admins and super admins can delete org talking points"
  ON cos_org_talking_points FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE TRIGGER cos_org_talking_points_updated_at
  BEFORE UPDATE ON cos_org_talking_points
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at(); -- reuse existing shared trigger fn

-- Per-(manager, direct report) dismissal (§2.6) — owner-only, same shape as
-- every other cos_* per-user table (e.g. cos_meeting_actions, §1.2).
CREATE TABLE cos_org_talking_point_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talking_point_id uuid NOT NULL REFERENCES cos_org_talking_points(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talking_point_id, user_id, team_member_id)
);

CREATE INDEX idx_cos_org_tp_dismissals_lookup
  ON cos_org_talking_point_dismissals(user_id, team_member_id);

ALTER TABLE cos_org_talking_point_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own org talking point dismissals"
  ON cos_org_talking_point_dismissals FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Notes:
- `cos_set_updated_at()` is assumed to already exist as a shared trigger function (used by `cos_one_on_one_prep_updated_at`, `cos_prep_schedule_updated_at` — confirmed present in both `20260423000000` and `20260612200000`); verify the exact function name at implementation time rather than assuming.
- No changes needed to any existing table or RLS policy — this is purely additive.
- Run `npm run db:validate` and Supabase advisors (`get_advisors`) against the new tables once created, per this repo's established habit for new RLS (see Manager Signals plan §6.5 precedent).

---

## 4. Phase 2 — Backend

### 4.1 `generate-1on1-prep/index.ts` — Tier 0 context injection (§2.2, option A)

Add one more parallel query to the `Promise.all` batch at lines 137–264:
```ts
supabase
  .from('cos_org_talking_points')
  .select('id, title, body')
  .eq('active', true)
  .lte('starts_on', todayDate)
  .gte('ends_on', todayDate)
  .not('id', 'in',
    `(select talking_point_id from cos_org_talking_point_dismissals
       where user_id = '${userId}' and team_member_id = '${team_member_id}')`
  ), // exact query-builder syntax TBD at implementation time — likely two
     // queries (fetch all active, then fetch this user+member's dismissed
     // ids, then filter client-side) rather than a raw subquery string, to
     // match this file's existing style (no raw SQL elsewhere in this
     // function) and avoid injection risk from string interpolation.
```
scoped to `member.relationship_type === 'direct_report'` only (§2.7) — skip the query entirely for `collaborator`/other types, mirroring the existing `isExternal` branch pattern (line 769).

Insert a new `contextParts` section **before** the Zoom section (i.e., ahead of Tier 1, making it effectively "Tier 0"):
```ts
if (orgTalkingPoints.length > 0 && member.relationship_type === 'direct_report') {
  contextParts.push(`\n=== TALKING POINT FROM LEADERSHIP (include as its own topic, do not paraphrase the substance away) ===`)
  orgTalkingPoints.forEach(tp => contextParts.push(`  - ${tp.title}: ${tp.body}`))
  dataSources.push('org_talking_points')
}
```
Add a short instruction to the system prompt's Tier discipline block (lines 824–851) establishing this as the highest-priority tier, above Tier 1 — exact wording is a copy/product decision, not decided here.

### 4.2 New hook: `useOrgTalkingPoints.ts` (§2.2, option B — the deterministic path)

Location: `src/hooks/useOrgTalkingPoints.ts`, following the `useRelationshipTopics.ts`/`useForgottenCommitments` thin-hook convention already used by `OneOnOnePrepDrawer.tsx` (lines 308–309).
```ts
export function useOrgTalkingPoints(teamMemberId: string | null) {
  // .from('cos_org_talking_points').select('*')
  //   .eq('active', true).eq('target_scope', 'company')
  //   .lte('starts_on', today).gte('ends_on', today)
  // .from('cos_org_talking_point_dismissals').select('talking_point_id')
  //   .eq('team_member_id', teamMemberId)
  // returns { points, dismiss(id), reload }
}
```
`dismiss(id)` upserts into `cos_org_talking_point_dismissals` with `(talking_point_id: id, user_id: currentUser, team_member_id: teamMemberId)`; an "undo" (un-dismiss) is a delete of that row, matching the toggle semantics of `togglePoint()` (§1.2) for UI consistency.

---

## 5. Phase 3 — Frontend

### 5.1 `OneOnOnePrepDrawer.tsx` — "From leadership" items in Topics of the day

In the "TOPICS OF THE DAY" card (lines 1024–1134):
- Call `useOrgTalkingPoints(member?.id ?? null)` alongside the existing `useRelationshipTopics`/`useForgottenCommitments` calls (lines 308–309).
- Render org talking points **above** `rankedPoints` (i.e., before P1), each with its own badge — recommend an indigo/violet chip reading `"From leadership"`, reusing the existing indigo palette already established for `colleagueSuggestions` (lines 927–969: `bg-indigo-50`/`text-indigo-700`/`bg-indigo-100`), so it reads as "another system surfaced this for you," visually distinct from both the neutral `"From prep brief"` chip (AI-derived, line 1072) and the blue `"You"` chip (manager-added, line 1088).
- Wire the checkbox-style row to `dismiss(id)` instead of `togglePoint()`/`toggleCustomPoint()` — same row shape and interaction model (click to toggle, `Check` icon when included), just a different backing mutation.
- Fold dismissed org talking points into the existing `"N dismissed"` collapsible section (lines 1095–1124) alongside `dismissedRanked`/`dismissedCustom`, so there's one unified "here's what I've hidden" affordance rather than three separate ones.
- `includedCount` (line 677–679) should add org talking points' included count to stay accurate as the "N on the agenda" badge (line 1029).

### 5.2 Admin creation UI

- `src/components/ui/settings-navbar.tsx`: add the `NAV_ITEMS` entry and `showOrgTalkingPoints` prop per §2.4.
- `src/pages/Settings.tsx`: add a new `activeSection === "org-talking-points"` branch (following the existing per-section `? (` chain, e.g. near `"strategy-cycles"` at line 2518) rendering a small admin panel:
  - A list of existing talking points (title, active window, active/inactive toggle) — reuse existing card/list styling from the "User Management" sections in the same file rather than inventing new patterns.
  - A create/edit form: title, body (plain textarea — no rich text needed, matching `cos_prep_settings.prep_instructions`'s plain-text precedent, `20260424000000_add_cos_prep_inputs.sql:25`), start date, end date.
  - Deactivate = set `active = false` (or `ends_on = today`), not a hard delete, so historical talking points remain auditable — matches the soft-lifecycle pattern already used elsewhere (e.g. `cos_relationship_topics.status`, `cos_meeting_actions.status`) rather than deletion.
  - Pass `isAdmin || isSuperAdmin` (already loaded via `useRoles()` at `Settings.tsx:78`) as the section's own render gate, in addition to the nav-level gate from §2.4 (defense in depth, matching this file's existing habit of re-checking role flags at both the nav and section level, e.g. lines 2154, 2372).

---

## 6. Recommendation on v1 scope

Recommend, explicitly:
- **Company-wide only** (§2.5) — no team-targeting; `target_scope` column present but CHECK-constrained to `'company'` only.
- **`direct_report` relationship type only** (§2.7) — not `collaborator`/`peer`/`boss`/etc.
- **Single dismissed/not-dismissed state** (§2.6) — no "discussed" vs. "not relevant to this person" distinction; that's a v2 refinement if product wants it, and the schema (a separate dismissals table, not a status enum) supports adding it later without a breaking change.
- **No target-audience preview, no per-talking-point engagement analytics** ("N of M managers have discussed this") in v1 — an admin creating a talking point sees the form and the list of existing ones, nothing more. This is the same "cut the least-specified/highest-effort part first" call PLAN_idea9 made with its "Topics that never surface" signal (deferred to a stretch phase) — analytics here would require aggregating across every manager's dismissal state, which is a bigger, separate feature (and arguably needs its own privacy consideration, since it's an admin looking at *managers'* behavior, similar in shape to the surveillance-risk framing already flagged for Manager Signals, `docs/SPECIFICATION.md` §7.8).
- **Both merge paths in §2.2** (prompt injection + deterministic render) rather than picking one, given the low incremental cost and the higher confidence in "leadership's message actually reached the manager verbatim" that the deterministic path buys.

This keeps the v1 surface area close to what idea #9 shipped (a single new content type in one card of the existing prep drawer, one new admin-gated Settings section, no new page, no new top-level route) rather than a new subsystem.

---

## 7. Risks (consolidated)

1. **§2.2 is a product decision as much as an engineering one** — whether an org-wide talking point should be woven into the AI narrative, held as a strictly verbatim UI element, or both. Flag for explicit sign-off before Phase 2 starts; do not default silently to "prompt injection only" because it's the smaller code change.
2. **Copy/framing risk, echoing §4 of `PLAN_idea9_manager_signals.md`**: an org-wide talking point that reads as a mandate/surveillance nudge ("Leadership wants you to ask about X") rather than a helpful prompt could land badly with managers already sensitive to feeling monitored (per the existing Manager Signals framing work). Recommend the same kind of lightweight copy review before launch, not a full re-litigation of §4 there, but an explicit checklist item.
3. **Dismissal-scope choice (§2.6)** — per-report dismissal means a talking point could show as "still pending" for N-1 reports after being discussed with 1; this is almost certainly correct (§2.6 reasoning), but worth confirming with whoever owns the product intent before building, since "per manager" (dismiss once, hide everywhere) is a plausible alternative reading of "push into every manager's 1:1 agenda."
4. **No admin audit/engagement view in v1 (§6)** — if leadership's actual ask is "tell me whether managers are covering this," v1 as scoped here does not answer that question; flag explicitly rather than silently underdeliver against an unstated requirement.
5. **Team-scoping deferral (§2.5)** could be wrong if the org later organizes talking-point campaigns per-team (e.g. "only Sales managers get this one") — the placeholder `target_scope` column mitigates the schema-migration cost of adding that later, but the query/RLS/UI work for team-targeting is still a real, undersized-here follow-up if it's ever needed.

---

## 8. Files to change / create

**New files:**
- `supabase/migrations/<timestamp>_cos_org_talking_points.sql` — both new tables + RLS (§3).
- `src/hooks/useOrgTalkingPoints.ts` (§4.2).
- Admin panel component(s) for the new Settings section, e.g. `src/components/settings/OrgTalkingPointsPanel.tsx` (exact name/location TBD at implementation time, matching this file's existing per-section component conventions in `Settings.tsx`).
- Test files: `src/test/useOrgTalkingPoints.test.ts`; `e2e/cos/org-talking-points.spec.ts` (admin create → manager sees it in prep → manager dismisses it → report B still sees it).

**Modified files:**
- `supabase/functions/generate-1on1-prep/index.ts` — new query + Tier 0 `contextParts` section (§4.1).
- `src/components/cos/OneOnOnePrepDrawer.tsx` — new "From leadership" rows in "Topics of the day," dismiss wiring, merged dismissed-section (§5.1).
- `src/components/ui/settings-navbar.tsx` — new nav item + `showOrgTalkingPoints` prop (§2.4, §5.2).
- `src/pages/Settings.tsx` — new `activeSection` branch + gate (§5.2).

---

## 9. Test coverage

**Unit (Vitest):**
- `useOrgTalkingPoints`: correct active-window filtering (`starts_on`/`ends_on` boundaries), correct exclusion of already-dismissed points for a given `(user, team_member)` pair, `direct_report`-only scoping.
- `OneOnOnePrepDrawer`: "From leadership" badge renders distinctly from `"From prep brief"`/`"You"` chips; dismiss removes the item from the visible list and adds it to the merged dismissed section; `includedCount` accounts for org points.

**Integration/DB:**
- RLS: authenticate as a non-admin user, attempt INSERT/UPDATE/DELETE on `cos_org_talking_points`, assert rejection; assert SELECT succeeds (company-wide read). Authenticate as `is_admin=true`, assert INSERT/UPDATE/DELETE succeed.
- Dismissal scoping: manager with two direct reports (A, B) dismisses a talking point for A; assert it still appears (non-dismissed) for B.
- `npm run db:validate` after adding the migration; `get_advisors` review.

**E2E (Playwright):**
- Admin creates a talking point in Settings → opens a direct report's prep drawer → sees it under "Topics of the day" with the "From leadership" badge → dismisses it → confirms it moves to the "N dismissed" section → confirms a *different* direct report's prep still shows it as active.
- Non-admin user confirms the new Settings nav item is not visible.
