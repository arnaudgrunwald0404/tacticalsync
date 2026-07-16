# Team Tactical Sync — Specification

**Status:** Living document. This is the canonical as-built + roadmap reference for the product. Update it as part of any change that adds a table, a route, a subsystem, or retires one — treat stale sections as bugs.

**Last compiled:** 2026-07-13, from a full-codebase audit (223 migrations, ~30 hooks, ~30 pages, 5 edge-function families, `slack-bot/`). Where this document conflicts with `CLAUDE.md` or older root-level docs (`PRD.md`, `RC-DO-SI-PRD.md`, etc.), **this document reflects the current code** and the older docs should be treated as historical/superseded (see [§9 Superseded Documents](#9-superseded-documents)).

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Product History & Stages](#2-product-history--stages)
3. [Architecture](#3-architecture)
4. [Platform Layer: Auth, Teams, Roles & Permissions](#4-platform-layer-auth-teams-roles--permissions)
5. [Module: RCDO (Strategy Planning)](#5-module-rcdo-strategy-planning)
6. [Module: Team Meetings (retired)](#6-module-team-meetings-retired)
7. [Module: Chief of Staff, Inbox, Delegation & Agent Automation](#7-module-chief-of-staff-inbox-delegation--agent-automation)
8. [Integrations & User Experiences](#8-integrations--user-experiences)
9. [Superseded Documents](#9-superseded-documents)
10. [Design System](#10-design-system)
11. [Testing Strategy](#11-testing-strategy)
12. [Build, Deploy & Dev Tooling](#12-build-deploy--dev-tooling)
13. [Known Issues & Drift (found during this audit)](#13-known-issues--drift-found-during-this-audit)
14. [Roadmap](#14-roadmap)
15. [Appendix: Table Index](#15-appendix-table-index)

---

## 1. Product Overview

Team Tactical Sync is a React/TypeScript SaaS that started as a **recurring team meeting tool** and has grown into a company-wide **strategic planning system (RCDO)** plus an **AI-assisted personal productivity layer** (Chief of Staff, unified Inbox, Slack/Zoom/Gmail integration, autonomous nudge agent).

Core stated vision (`PRD.md`): *"Empower teams to run efficient, structured meetings that drive accountability and measurable outcomes,"* via reduced meeting overhead, tracked accountability, real-time remote collaboration, and scale from small teams to 200+ member orgs.

The product today is really **three co-existing systems** built at three different times, with different scoping models and different levels of AI involvement:

| Layer | Scope | Core entity | AI involvement |
|---|---|---|---|
| **RCDO** (§5) | Company-wide (not team-scoped) | Cycle → Rallying Cry → Defining Objective → Strategic Initiative → Task | None shipped (extensive AI plan exists, unbuilt) |
| **Team Meetings** (§6) | Per-team | Meeting Series → Instance → Agenda/Priorities/Topics/Action Items | None; **retired**, routes commented out |
| **Chief of Staff / Inbox** (§7) | Per-user | 1:1s, group meetings, `inbox_items`, delegations | Heavy — Claude-driven extraction, nudging, delegation, relationship memory |

A user's default landing page today is `/check-ins` (the Chief of Staff / Inbox workspace), not the original meetings product.

---

## 2. Product History & Stages

Document metadata (not git history, which only goes back to 2026-06-23) indicates the following stages:

- **Stage 1 — Meetings tool** (originated ~Oct 2024, formalized in `PRD.md` v1.0, Nov 2025). Teams, invitations, RBAC, recurring meeting series/instances, agenda templates, priorities/topics/action items, Supabase Realtime collaboration. Backed by a 114-test Playwright suite at the time (`PHASE2_COMPLETE.md`, `PHASE3_COMPLETE.md`).
- **Stage 2 — RCDO strategic-alignment module** (Nov 11–15, 2025). Bolted a Rallying Cry → Defining Objectives → Strategic Initiatives hierarchy onto the product, explicitly designed as "a lightweight strategy operating system with a 6-month cadence," not a digitization of the prior Excel-based planning process. Real company OKR-style content (`h1-2026-rcdo.md`) was imported as seed data via a markdown parser in Strategy Canvas.
- **Stage 3 — Chief of Staff / integrations layer** (ongoing, dominant activity through mid-2026). Zoom, Slack, Google Calendar, Gmail, StackOne, and a first-party "ClearGo" feed into `cos_*` tables powering 1:1 prep, daily briefs, relationship memory, and a cron-driven nudge/escalation agent (`agent-tick`). Documented in `INTEGRATIONS.md` as explicitly separate from the RCDO module.
- **Stage 4 — Inbox unification / agentic follow-through** (in-flight as of this audit). A newer `inbox_items` system, described in its own migration comments as *"a parallel experiment alongside /chief-of-staff,"* unifies meeting action items, 1:1 commitments, and CoS nudges into one queue, adds AI-agent delegation and person-to-person delegation, and layers manager "health signal" views on top. Recent commits show this stage **actively displacing Stage 1** — meeting-series/meeting-instance routes were disabled in the same window.

**Explicit non-goals stated in the source PRDs** (still true today): no DO/SI weighting or scoring system, no Gantt/dependency engine, no automated Jira/Aha!/Salesforce integration, AI features are assistive-only ("no silent writes," "human owners make final calls"), no vector/embedding index for relationship memory (a "big-context prompt" approach was deliberately chosen instead), no tracking/analytics, data export is manual.

---

## 3. Architecture

### Stack
- **Frontend:** React 18.3 + Vite (`@vitejs/plugin-react-swc`), React Router v6.30 (lazy-loaded routes via a custom `lazyWithRetry()` that force-reloads once on stale-chunk errors)
- **Styling:** Tailwind CSS 3.4 + shadcn/ui (Radix UI primitives), ~55 components in `src/components/ui/`
- **Server state:** TanStack React Query 5.83 — no Redux/Zustand
- **Backend:** Supabase (PostgreSQL + RLS + Realtime + Edge Functions), 223 migrations in `supabase/migrations/`
- **Forms:** React Hook Form 7.61 + Zod 3.25
- **Rich text:** TipTap 3.6 (plain, no collaboration extension in the shared editor)
- **Realtime collaboration:** Yjs + `y-websocket` — used **only** in the Strategy Canvas (`StrategyCanvas.tsx`); everywhere else, "real-time" means Supabase Postgres-changes broadcast + full refetch (last-write-wins, no CRDT)
- **Other notable deps:** `reactflow` (Strategy Canvas), `recharts` (Insights), `xlsx` (import/export), `@dnd-kit` + `@hello-pangea/dnd` (two separate drag-and-drop libraries, used in different modules), `@stackone/hub` (third-party integrations), Anthropic SDK (Claude Haiku 4.5 used server-side for extraction/summarization in edge functions)
- **Origin note:** `lovable-tagger`'s `componentTagger()` Vite plugin is active in dev mode — the project originated on / is synced with the Lovable.dev platform.

### Data Flow Pattern
Custom hooks in `src/hooks/` encapsulate all data fetching; components never query Supabase directly. `useRCDO.ts` is the primary RCDO data layer (many sub-hooks). Realtime subscriptions live in `useRealtimeSubscription.ts`, `useMeetingRealtime.ts`, and `useRCDORealtime.ts` — all following the same pattern: subscribe to `postgres_changes`, call a refetch callback, no field-level merge.

### Route Map (`src/App.tsx`)

**Public:** `/` (landing), `/auth`, `/reset-password`, `/join/:inviteCode` (team invite), `/claim-team-member/:inviteCode` (Chief-of-Staff contact-linking invite).

**Authenticated (wrapped in `AppLayout`, session-gated):**

| Path | Component | Purpose |
|---|---|---|
| `/check-ins/*` | `DashboardWithTabs` | Chief-of-Staff / Inbox workspace — **default post-login landing** |
| `/dashboard` | `Dashboard` | Deprecated shim → redirects to `/commitments` |
| `/commitments` | `DashboardWithTabs` | Quarterly Commitments tab view |
| `/insights` | `DashboardWithTabs` | Insights tab view (RCDO priority analysis + Manager Signals) |
| `/dashboard/rcdo` | `DashboardWithTabs` | RCDO tab view |
| `/chief-of-staff/*` | `LegacyChiefOfStaffRedirect` | Back-compat → `/check-ins*` |
| `/inbox`, `/inbox/meetings/*`, `/inbox/person/:memberId` | `InboxPage` | Unified inbox |
| `/rcdo/detail/do/:doId` | `DODetail` | Defining Objective detail |
| `/rcdo/detail/si/:siId` | `SIDetail` | Strategic Initiative detail |
| `/rcdo/all-hands` | `RCDOAllHands` | Company-wide RCDO rollup |
| `/rcdo/canvas`, `/dashboard/rcdo/canvas` | `StrategyCanvas` | Strategy canvas (two aliases) |
| `/dashboard/rcdo/tasks-feed` | `TasksFeed` | RCDO task/check-in activity feed |
| `/create-team`, `/team/:teamId/invite` | `CreateTeam`, `TeamInvite` | Team creation & invitations |
| `/profile`, `/settings` | `Profile`, `Settings` | User profile / app settings (templates, permissions, integrations) |
| `/branding`, `/color-palette` | showcase pages | Internal design-system reference |
| `*` | `NotFound` | 404 |

**Retired but present as dead code** (routes commented out in `App.tsx`, page files still exist): `/my-meetings`, `/team/:teamId/meeting/:meetingId`, `/team/:teamId/setup-meeting`, `/team/:teamId/meeting/:meetingId/settings`, `/dashboard/main`. See [§6](#6-module-team-meetings-retired).

---

## 4. Platform Layer: Auth, Teams, Roles & Permissions

### Org/Team Model
- **`teams`**: `name`, `abbreviated_name`, `created_by`, `invite_code`.
- **`team_members`**: `team_id`, `user_id`, `role CHECK IN ('admin','member')`, unique per `(team_id, user_id)`.
- **`profiles`**: identity fields plus global flags `is_admin`, `is_super_admin`, `is_rcdo_admin`, `role_tags text[]` (`admin|elt|xlt|user|test_user`), `feature_announcements jsonb`.
- **`invitations`**: `team_id`, `email`, `role`, `status (pending/accepted/declined)`, `invite_code`, 7-day `expires_at`.
- **`feature_permissions`**: `feature_key` × `role_tag` → `is_enabled` — backs `useFeaturePermissions`.

**Four role systems coexist** (worth consolidating in a future cleanup):
1. Team-level `team_members.role` (`admin`/`member`, per team).
2. Global `profiles` booleans (`is_admin`, `is_super_admin`, `is_rcdo_admin`).
3. Tag-based `role_tags` gating nav sections via `feature_permissions` (checked by `useFeaturePermissions().canAccess(featureKey)` across 10 `FeatureKey`s: `view_chief_of_staff`, `view_my_lists`, `view_daily_checkin`, `view_my_team`, `view_rcdo`, `view_commitments`, `view_meetings`, `view_insights`, `view_settings`, `manage_permissions`).
4. A **hardcoded super-admin email fallback** in `useRoles.ts`: `agrunwald@clearcompany.com` or any `@gearcompany.com` address is treated as super admin regardless of the DB flag, and the hook best-effort persists that back to `profiles`.

There's also a client-side-only `RoleOverrideContext` (persisted to `localStorage`) that lets a user preview the app as a different role tier for QA/demo purposes — confirm this has no production-security implication before relying on role checks alone in new UI.

### Auth
- Supabase Auth, PKCE flow, Google OAuth primary (`supabase.auth.signInWithOAuth`), 1-hour JWT (`jwt_expiry = 3600`).
- A **QA-only password sign-in form** is gated on `window.location.hostname` being `localhost`/`127.0.0.1`.
- `useSessionManager.ts` is a **token-refresh keepalive**, not an idle-timeout: every 60s it refreshes the session if the JWT is within 5 minutes of expiring. **There is no idle-detection/auto-logout anywhere in the app** — `CLAUDE.md`'s "30-minute idle timeout" claim does not match the code and should be corrected or the feature should be built.
- Post-login routing threads `invite`/`cosInvite`/`returnTo` query params through the OAuth round-trip via `localStorage`.

### Invitation Flows (two independent systems)
1. **Org team invites**: `TeamInvite.tsx` (admin sends via email → `invitations` row + `send-invitation-email` edge function) or a copyable `invite_code` link → `JoinTeam.tsx` auto-joins the team on visit (no approval step).
2. **Chief-of-Staff contact linking**: `ClaimTeamMemberInvite.tsx` links a manager's `cos_team_members` roster row to the real person's account via `claim_cos_team_member_invite` RPC — a prerequisite for person-to-person delegation and manager signals (see §7).

### Row-Level Security Pattern
Two generations coexist:
- **Team-scoped** (still active for `teams`/`team_members`/`invitations`/legacy meeting tables): `EXISTS` subquery joining back through `team_members` on `auth.uid()`.
- **Company-wide** (RCDO, since `20251112100000_make_rcdo_company_wide.sql`): any authenticated user can read; only `profiles.is_admin`/`is_super_admin` (or record ownership) gates writes. **New RCDO-adjacent work should assume company-wide visibility, not team isolation.**
- A `SECURITY DEFINER` helper-function pattern (e.g. `check_manage_permissions()`) is used where a policy needs to query the same table it protects, to avoid RLS self-recursion.

---

## 5. Module: RCDO (Strategy Planning)

### Hierarchy
`rc_cycles` → `rc_rallying_cries` (1:1 with cycle) → `rc_defining_objectives` → `rc_strategic_initiatives` (optionally → `rc_strategic_initiatives` sub-initiatives, one level deep) → `rc_tasks`. Metrics (`rc_do_metrics`) and check-ins (`rc_checkins`) attach to DOs/Initiatives/Tasks. `rc_links` cross-references DOs/Initiatives to execution artifacts (meeting priorities, action items, Jira, docs). `rc_canvas_states` persists the Strategy Canvas's ReactFlow graph as a JSON snapshot per cycle.

**Scope:** company-wide, not per-team (see §4 RLS). `rc_cycles.team_id` was dropped; a placeholder `company_id` exists unused, reserved for future multi-tenancy.

### Lifecycle (as-built, simpler than the PRD's original 8-stage design)
`rc_cycles.status`: `draft → active → archived` (`review` exists in the DB enum but no UI path ever sets it). Only one cycle is meant to be `active` at a time, enforced by **two sequential client-side UPDATEs** (archive-old, then activate-new) — **not a DB constraint**, so a concurrent-activation race is possible.

- **Draft**: RC/DO/SI/Metrics/Tasks are freely created and edited.
- **Lock**: `DODetail.tsx`/`SIDetail.tsx` require minimum content (hypothesis + ≥1 lagging metric for a DO; description + dates for an SI) before setting `locked_at`/`locked_by`. **Locking a DO cascades to lock all child SIs** via a DB trigger (`rcdo_cascade_lock_sis_on_do`); there is no RC→DO cascade.
- **Link execution**: `rc_links` connect DOs/SIs to meeting priorities via a `#`-hashtag selector — noted in the original implementation summary as only partially wired into the meeting-priority compose flow.
- **Check-ins**: free-text + sentiment (−2..2) + percent-to-goal (0–100), against a DO, Initiative, or Task. No automated reminder/digest exists yet.
- **Health**: computed **entirely client-side** (`calculateDOHealth()` in `src/lib/rcdoScoring.ts`) from leading-metric progress; the `rc_defining_objectives.health`/`last_health_calc_at` columns are never written by any trigger.
- **Archive**: reached only by activating a different cycle (force-archives the old one) or explicit deletion (cascades through the full hierarchy).
- **Not implemented**: mid-cycle review UI, end-cycle retrospective UI, exports (PDF/CSV/JSON), any of the AI capabilities described in the original PRD (Rallying Cry Drafter, Metric Designer, Status Synthesizer, weekly digest, etc.) — none have corresponding code.

### Sub-Strategic-Initiatives
An SI can be flagged `accepts_sub_sis` and gain child SIs one level deep (`parent_si_id`, `no_nested_sub_sis` CHECK prevents further nesting). Converting an existing SI (with tasks) into this mode is atomic via the `rcdo_convert_si_to_sub_si_mode()` SQL function, which auto-creates a default sub-initiative and reparents existing tasks onto it.

### Key Pages
- **Strategy Canvas** (`/rcdo/canvas?cycle=<id>`) — ReactFlow graph (RC → DO nodes → embedded SI pills with progress/staleness indicators), real-time multiplayer via Yjs/`y-websocket`, debounced snapshot persistence to `rc_canvas_states`, DB-rebuild fallback, markdown import (bulk-creates an RC/DO/SI tree from pasted text — this is how `h1-2026-rcdo.md` seed content was loaded), "View As" ownership filter.
- **DO Detail** (`/rcdo/detail/do/:doId`) — Tracking tab (child SI table with computed progress) + Check-ins tab.
- **SI Detail** (`/rcdo/detail/si/:siId`) — Task table (drag-reorderable) or nested sub-initiative tree if `accepts_sub_sis`; Check-ins tab; Gantt/Table view toggle.
- **RCDO All-Hands** (`/rcdo/all-hands`) — read-only, DO-grouped rollup of every top-level SI with latest check-in and month-over-month trend.
- **Cycle Planner / Strategy Home** — near-duplicate cycle-list pages with Activate/Delete controls.
- **Checkins / "My Workspace"** (`/my-meetings`-adjacent) — personal view of owned DOs/SIs plus a **localStorage-only** (not persisted) scratch to-do list.

### Permissions
`useRCDOPermissions()` mirrors (does not replace) DB RLS: owners can edit their own unlocked records; admins/super-admins/RCDO-admins (`profiles.is_rcdo_admin`) can always edit; only super-admins can create/delete cycles or lock rallying cries.

### Realtime
`useRCDORealtime()` wires up to 8 filtered `postgres_changes` channels per detail page (cycle/RC/DOs-under-RC/metrics-initiatives-links-checkins-under-DO/tasks-checkins-subSIs-under-SI); `useStrategyHomeRealtime()` covers the company-wide cycles list. All are full-refetch-on-any-change, no diffing.

---

## 6. Module: Team Meetings (retired)

The original Stage 1 product: `meeting_series` (recurring definition, `frequency: daily|weekly|bi-weekly|monthly`) → `meeting_instances` (periodic occurrence) → series-level `meeting_series_agenda` and `meeting_series_action_items`, instance-level `meeting_instance_priorities` and `meeting_instance_topics`. Real-time collaboration was Supabase-broadcast-and-refetch (not CRDT), with presence tracked via a `presence:meeting:{meetingId}` channel.

**As of this audit, its routes are commented out in `App.tsx`** (`/my-meetings`, `/team/:teamId/meeting/:meetingId`, `/team/:teamId/setup-meeting`, `/team/:teamId/meeting/:meetingId/settings`) — the pages (`TeamMeeting.tsx`, `TeamMeetingSetup.tsx`, `MeetingSettings.tsx`) still exist in `src/pages/` but are unreachable from the app. `meeting_series_action_items` still receives writes indirectly through the newer Unified Funnel sync (§7.6) even though the meeting UI itself is off — **do not delete these tables without checking that sync path first.**

`useMeetingTimer.ts` is dead code (unused outside its own test). This module should be considered a candidate for either full removal or a documented relaunch decision — leaving unreachable routes and unused hooks in the tree is a maintenance liability.

---

## 7. Module: Chief of Staff, Inbox, Delegation & Agent Automation

This is the most actively-developed and most complex part of the codebase. Two data models exist side by side by design:

- **`cos_*` tables** — the original "Chief of Staff" feature (a human manager's own productivity tool, not an AI persona): tracked direct reports/collaborators, 1:1 and group-meeting prep, daily/weekly priority tracking.
- **`inbox_*` tables** — a newer unified inbox, explicitly documented in its own migration as *"a parallel experiment alongside /chief-of-staff."*

An autonomous **agent** (`supabase/functions/agent-tick`, `pg_cron` every 30 min) bridges both models: Slack-DM nudges, 1:1 prep pre-staging, escalation detection, daily digests. Its audit trail is `cos_agent_log`; its per-user config/kill-switch is `cos_settings.agent_config`.

### 7.1 Chief of Staff (`/chief-of-staff` → `/check-ins`)
`cos_team_members` (a manager's roster: `relationship_type: direct_report|collaborator`), `cos_priorities`, `cos_dci_logs` (daily/weekly check-in matrix), `cos_person_accountabilities`, `cos_person_topics`, `cos_one_on_one_prep`, `cos_settings`. `cos_one_on_one_prep` is **polymorphic** (`team_member_id` XOR `group_meeting_id`) to also cover recurring multi-attendee "group meetings" (`cos_group_meetings`) without a parallel table.

### 7.2 Meeting Prep, Zoom & Calendar Integration
- Per-user Zoom OAuth (`user_zoom_credentials`), synced recordings/transcripts (`cos_zoom_recordings`, `cos_zoom_transcripts`) via `zoom-recordings-sync` edge function, matching participants to `cos_team_members`.
- Post-call AI analysis (`generate-meeting-suggestions` edge function): strips transcript markup, calls Claude to extract action items, dedupes against existing items (Jaccard similarity), writes `dci_suggested_tasks`.
- `cos_group_meetings` + `cos_group_meeting_sources` + `cos_group_meeting_participants`: user-curated recurring group meetings (opt-in, unlike 1:1s which auto-include), with title-driven context-source suggestions (Slack channel / Zoom topic matching).
- `cos_prep_schedule` is the single source of truth for two scheduled products per user: "Recurring Meeting Prep" and "My Daily Brief" (DCI).

### 7.3 The Inbox
Unifies four input types into one per-user stream (`inbox_items`): manual tasks/notes, synced meeting/1:1 action items (§7.6), AI-extracted Slack/Gmail candidates awaiting one-tap approval (§7.7), and Zoom-transcript "insight" quotes (§7.5).

`inbox_items` key fields: `type (task|note|agent_nudge|agent_question|meeting_insight|brief_item)`, `status (open|done|archived|snoozed)`, `bucket (now|next|later)`, `workflow_status (Not started|Work in progress|Waiting on someone|Blocked|Do Now)`, `owed_by (me|them)`, `priority_due_at`/`priority_fixed`, `source_ref jsonb` (the dedupe/provenance key for every synced-in item), `active_delegation_id`, `snooze_until_member_id` (snooze until next 1:1 with a specific person).

Supporting: `inbox_tags` (project/person/urgency/folder/context/workstream, nestable via `parent_id`), `inbox_views` (saved filter/sort views), keyboard shortcuts (j/k/e/d/Enter/?/Escape), quick search.

### 7.4 Delegation (two distinct systems)
- **AI-agent delegation** (`inbox_delegations`) — hands an item to an autonomous Claude sub-agent (`delegate-inbox-task` edge function) with a state machine (`ramping_up → clarifying? → planning → getting_it_done → seeking_approval → done|cancelled`). "v2" replaced an opaque approval-summary with structured, idempotent, per-step `plan_steps` (typed tool calls: `create_meeting_topic`, `draft_email`, `post_slack_update`, `schedule_checkin`), each independently approvable/retryable, with a durable append-only audit log (`inbox_delegation_audit_log`).
- **Person-to-person delegation** (`inbox_item_delegations`) — delegates a real item to a linked colleague, prerequisite on `cos_team_members.linked_user_id` (an email-verified invite/claim flow, §4). Enforced by both RLS and a DB trigger (defense in depth). Bidirectional status sync between the delegator's and delegatee's copies.

### 7.5 Meeting Insights
Zoom-transcript-derived standout quotes (`extract-zoom-quotes` edge function) are written both to a 1:1 hero-card table and, since a later change, as `inbox_items(type='meeting_insight')` rows so a notable meeting moment becomes an actionable inbox item (deduped via a dedicated index).

### 7.6 The Unified Funnel
Bidirectional sync triggers (`sync_cos_meeting_action_to_inbox`, `sync_inbox_item_status_to_source`) pipe `cos_meeting_actions` (owner=`me`) and `meeting_series_action_items` into `inbox_items`, and mirror completion status back. `owner='them'` rows are never mirrored (no app user to sync into). **RCDO `rc_tasks` and the Commitments quarterly system are not part of this funnel** — three separate "task" concepts persist in the product (RCDO tasks, Commitments, CoS/inbox action items); this is a known architectural seam.

### 7.7 Slack & Gmail Extraction, and the Agent
The Slack pipeline is OAuth-based edge functions: `exchange-slack-token` (per-user OAuth) → `slack-messages-sync` (pulls DMs + allowlisted channels) → `extract-inbox-action-items` (runs 4×/day via cron, delta-scans new Slack + Gmail messages, calls Claude Haiku 4.5 for structured extraction, writes `inbox_items(type='agent_question')` — **never auto-created as a real task**, requires explicit user approval). A legacy Socket Mode Bolt app (`slack-bot/index.js`) previously existed alongside this as dev-only tooling with an overlapping `/checkin` command; confirmed with the repo owner that no such app is deployed anywhere, so it was removed (§13.15).
- **`agent-tick`** (every 30 min): Slack-DM nudges on overdue action items, 1:1-prep pre-staging, opt-in-gated inbox nudging (cooldown-based re-prompt), escalation detection, meeting-format recommendations, daily digest, post-meeting transcript check. Quiet-hours aware; every action logged to `cos_agent_log`.

See [§8](#8-integrations--user-experiences) for a full touchpoint-by-touchpoint breakdown of what a user actually sees and can do at each step of the Slack (and other integration) experience.

### 7.8 Manager Signals
`/insights` surfaces two per-direct-report signals to any manager with tagged direct reports (not admin-gated): **close-rate** (30d/90d done vs. total on the manager's own tagged inbox items, `MIN_ITEMS_FOR_RATE=5` floor) and **aging items** (items stuck `Waiting on someone`/`Blocked`, bucketed by staleness). **Important framing constraint, enforced in both schema comments and the hook**: these reflect *the manager's own follow-through on items they tagged with a name* — not verified activity by the report, who has no linked visibility into these numbers. Any UI copy here must avoid implying employee surveillance.

### 7.9 Relationship Memory & Person Pages
Per-person AI-assisted memory built on `cos_team_members`: `cos_relationship_topics` (categorized, sentiment-tagged, full-text searchable), `cos_forgotten_commitments` (overdue/stale promises, tiered staleness), and a consolidated running narrative doc per person (`consolidate-relationship-doc` edge function) using a deliberate "big-context prompt" approach instead of embeddings (revisit only past ~150 items or ~30K tokens per person). Gated behind a one-time consent modal (`cos_settings.person_memory_consent_seen_at`) — **shown only to the manager**; there is currently no mechanism for the direct report (whose Slack/meeting content is being summarized) to know about or opt out of this — flagged as an open privacy gap, not yet addressed.

### 7.10 Feature Ship Status (PLAN_ideaN.md vs. reality)
All PLAN doc "Status:" headers understate progress — every idea except the numbering gap (#5, never existed) has actually shipped at least a v1:

| Idea | Goal | Doc says | Actually |
|---|---|---|---|
| #1 Unified Funnel | Sync meeting/1:1 actions into one inbox | Plan only | **Shipped** |
| #2 Dormant 20% | Finish snooze/views/search/shortcuts | Proposal only | **Shipped** |
| #3 Meeting Insights | Zoom quotes → inbox items | Draft | **Shipped** |
| #4 Agentic Follow-Through | Extend agent-tick to nudge inbox items | Planning only | **Shipped** |
| #6 Delegation v2 | Structured per-step AI delegation | Draft | **Shipped** |
| #7 Relationship Memory | Per-person AI memory + consent | — | **Implemented** (doc updated) |
| #8 People Delegation | Delegate to a linked colleague | Not buildable as scoped | **Shipped**, prerequisite included |
| #9 Manager Signals | Close-rate/aging dashboard | Blocked | **Shipped** |

Treat the PLAN_idea*.md files' status headers as stale; verify against migrations/hooks before assuming something is unbuilt.

---

## 8. Integrations & User Experiences

Five external systems are integrated, all per-user (none are team- or org-wide connections): **Slack**, **Zoom**, **Google Calendar**, **Gmail**, **StackOne**, plus a first-party **ClearGo** API. All are managed from **Settings → Integrations/Agent/Notifications** (`src/components/cos/*Panel.tsx`), and all follow the same shape — a per-integration credentials table, a connect/disconnect button pair, a "Last synced" status line, and (for Slack/Zoom/Calendar) a manual "Sync now" action alongside the scheduled background job. Slack gets by far the most user-facing surface area because it's also the agent's outbound notification channel, not just a data source — the subsections below enumerate every distinct way a user experiences it.

### 8.1 Slack — connect, disconnect, and configuration

**Connecting**: Settings → Slack sync (`CosSlackSyncPanel.tsx`). Not-connected state shows: *"Connect Slack to include recent DMs and channel messages in your 1:1 prep, and share prep notes via Slack DM."* → **Connect Slack** button → Slack OAuth (`chat:write, commands, users:read, users:read.email, channels:read, channels:history, groups:read, groups:history, im:read, im:history, im:write`) → on return, the panel shows *"Connecting Slack…"*, calls `exchange-slack-token` then an immediate `slack-messages-sync`, and resolves to either *"Slack connected — N messages synced"* or *"Slack connection failed"*.

**Disconnecting**: same panel, **Disconnect** button next to the connected team/email badge and last-synced timestamp. `disconnect-slack` edge function best-effort revokes the token (swallows failure) and deletes the `user_slack_credentials` row. Toast: *"Slack disconnected"*.

**Channel allowlist — a real gap found in this audit**: the visible "Slack channels to include" picker lives in **Settings → Briefs & Schedule → Tools** (`CosPrepSchedulePanel.tsx`), but it writes to `cos_prep_schedule.slack_channels` — a **different column** from the one the background cron jobs actually read (`user_slack_credentials.sync_channels`, added by `20260707000000_slack_sync_channels.sql`). The manual "Sync now" button bridges the two at call time (merges both columns server-side), but **nothing in the codebase ever writes to `sync_channels` directly** — so a user's channel selection only reliably takes effect through manual syncs, not the automatic background scan. This should be fixed (either the cron path should read `cos_prep_schedule.slack_channels`, or the UI should write to `sync_channels`) before relying on "select channels in Settings" as a trustworthy promise to users. See [§13.11](#13-known-issues--drift-found-during-this-audit).

**No-Slack-connected experience**: there is no external nudge (no email) — the signal is entirely in-app: an amber banner in Settings → Agent (*"Slack delivery — Required — The Agent reaches you over Slack. Connect it so nudges and alerts can be delivered."*) and an identical banner in Settings → Notifications, with every notification toggle disabled until connected. Server-side, `agent-tick`'s `sendSlackDM()` just silently returns `false` if no credentials exist — no error surfaces from the backend.

### 8.2 Slack — the user experiences, one by one

| # | Scenario | Trigger | What the user sees / can do |
|---|---|---|---|
| 1 | **Connect** | User visits Settings → Slack sync | See §8.1 |
| 2 | **Disconnect** | User clicks Disconnect | See §8.1 |
| 3 | **Configure channel scan** | User adds a channel in Settings → Briefs & Schedule → Tools | Chip-list add/remove UI; see the gap noted in §8.1 |
| 4 | **Daily digest DM** (bundles overdue-action nudges) | `agent-tick`, at most once/calendar day, outside quiet hours | Header *"📋 Your to-do list — N items need attention"*; per-item **⋯ overflow menu** with ✅ Mark done, 🕒 Snooze 2 days, 🕓 Snooze 7 days; plus inbox sections ("Do Now" / "Due now" / "Needs your input" / "You're blocking these") each with their own overflow actions; footer buttons 👍 Helpful / 🕐 Too early / 👎 Not helpful |
| 5 | **Escalation-flagged DM** | `agent-tick` detects chronic-overdue / missing-meetings / commitment-drift / stalled-topics pattern, `notifPrefs.escalation_alerts` on | Plain-text section, e.g. *"🚨 Chronic Overdue — {member}\n\n{details}"* — **no interactive button today** (a `dismiss_escalation:` action ID exists in the handler code but no current message attaches that button — dead code, not a live user affordance) |
| 6 | **Meeting-format recommendation DM** | `agent-tick`, only when the computed score is at a notable extreme (0 or >8) | Plain text, e.g. *"⏱️ Suggested format for {member}: Quick sync (15 min)\n\n• reason\n• reason"* — no button, gated by `notifPrefs.format_suggestions` |
| 7 | **First-ever inbox-nudge DM** | The very first nudge after opting in | Prefixed one-time explainer: *"✨ This is a new kind of message from your agent — a heads-up about inbox items tied to people or dates, sent automatically before they become a problem. (You can turn this off anytime: Settings → Agent → Inbox item nudges. This explainer only shows once.)"* |
| 8 | **Web-Inbox opt-in prompt** (not a Slack message — appears in the app) | Once there's something worth nudging about and the user hasn't opted in | An `agent_question` inbox item: *"Want me to flag open items before your 1:1s and as due dates approach?"* with a rationale paragraph and a **"Turn on nudges"** CTA. Clicking sets `agent_config.nudge_inbox_items = true`; archiving/dismissing without clicking is treated as a decline and starts a **14-day cooldown** before the prompt can reappear |
| 9 | **Giving feedback on a nudge** | Clicking 👍/🕐/👎 on a digest | Writes to `cos_agent_feedback`; `agent-tick` looks back 30 days and adapts `nudge_timing_hours` per user (≥3 "too early" → push timing later, max 48h; ≥3 "too late" → pull earlier, min 6h) — this is genuinely adaptive, not cosmetic. Note: the handler code also supports `too_late`/`wrong_format` feedback values, but **no shipped message currently renders those two buttons** |
| 10 | **`/checkin` slash command** (legacy bot only) | User types `/checkin` in Slack | Opens a modal mirroring the web check-in form (target picker grouped by DO/SI/Task, date, comment, required mood select, optional "share to channel" checkbox) → inserts into `rc_checkins` → *"✅ Check-in saved. It will appear in Tactical Sync."* If the Slack email doesn't match any profile: *"I could not map your Slack user to a Tactical Sync profile. Make sure your Slack email matches your Tactical Sync email, then try again."* |
| 11 | **`/ask` slash command** (legacy bot only) | User types `/ask <text>` | Ephemeral stub reply: *`Got it: "{text}". I'll ask the agent and reply here.`* — **not implemented**, no follow-up ever comes |
| 12 | **`/add-to-my-lists`, `/add-to-1on1` slash commands** (OAuth pipeline, via `slack-add-suggestion`) | User types either command | Both are handled **identically** today (split text on `;`, insert into `dci_suggested_tasks`) — Settings → Agent copy advertises that `/add-to-1on1 @name topic` routes the topic into that specific person's 1:1 prep brief, but no code parses an `@name` mention or distinguishes the two commands; this promised behavior does not appear to be implemented |
| 13 | **Quiet hours** | User sets start/end hour in Settings → Agent (default 6 PM–9 AM, configurable timezone) | Suppresses every notification-heavy path for that tick (nudges, escalations, format recs, inbox nudges, digest) — logged as `skipped_reason: 'quiet_hours'`. The post-meeting transcript check (Zoom sync + extraction) still runs silently during quiet hours; it just won't message about it |
| 14 | **Nudge ceiling** | An item has been nudged `nudge_max_count` times (default 5) with no resolution | Item is silently "parked" (logged `nudge_capped`) — stops appearing in future digests but remains resolvable via its normal overflow actions |

### 8.3 Slack — architecture notes and open questions

A legacy Socket Mode bot (`slack-bot/index.js`) previously shared an action-ID naming convention (`mark_done:`, `snooze:`) with the live OAuth pipeline's `agent-slack-action/index.ts` (documented in its own comment as *"the Slack Interactivity Request URL"*) but was **not the same code path** — it only recognized `mark_done:`/`snooze:` and never handled `inbox_mark_done:`/`inbox_due_snooze:`, which `agent-tick` actually sends. Confirmed with the repo owner that no Slack app with Socket Mode enabled was deployed anywhere; the legacy bot was dev-only tooling and has been removed (§13.15). `agent-slack-action/index.ts` is the sole interactivity handler.

### 8.4 Zoom

- **Connect**: Settings → Zoom sync (`CosZoomSyncPanel.tsx`) — *"Connect Zoom to include recent meeting recordings and transcripts in your 1:1 prep."* → OAuth.
- **Reconnect state**: a failed token refresh (401) sets `last_sync_status = 'error: reauth_required'`; the button swaps to **"Reconnect Zoom"**.
- **Disconnect**: same panel; local row always deleted regardless of remote revoke success.
- **What syncs**: hosted recordings, VTT transcripts, AI Companion summaries, feeding 1:1 prep, featured-quote extraction (§7.5), and meeting-format suggestions (§8.2 #6).
- **Status/errors**: "Last synced {time}" + inline error suffix when sync status isn't `ok`. No dedicated Slack notification beyond the prep-ready/format-suggestion messages already covered above.

### 8.5 Google Calendar & Gmail

- **Connect**: Settings → Calendar sync (`CosCalendarSyncPanel.tsx`), via Supabase's Google OAuth, requesting `calendar.events.readonly` **and** `gmail.readonly` in the same consent screen. (This corrects `INTEGRATIONS.md`, which states Gmail scope is never requested — the live flow does request it; users who connected before this scope was added see a *"Reconnect needed"* toast prompting disconnect/reconnect.)
- **Disconnect**: `disconnect-google-calendar` edge function.
- **What syncs**: upcoming events → 1:1/group-meeting detection ("Sync now" reports *"{created} added · {updated} updated · {cancelled} removed"*); a separate **"Sync meeting emails"** action calls `gmail-meeting-assets-sync` (also undocumented in `INTEGRATIONS.md`) — parses Zoom's "meeting assets ready" emails as a fallback for recordings the Zoom API sync misses, reporting *"Gmail sync complete — N meeting email(s) found · N new summary/ies added"*.
- **Status/errors**: last-synced timestamp + inline status; optional twice-daily scheduled auto-sync at two configurable UTC hours.

### 8.6 StackOne

- **Connect**: Settings → StackOne (`StackOnePanel.tsx`) — paste an API key (validated against `GET /accounts`), then link individual connectors (HRIS/Ticketing/CRM) via StackOne's embedded Connect Hub widget.
- **Disconnect**: clears the stored key client-side; nothing is revoked on StackOne's side.
- **What syncs**: nothing persisted — live, per-prep-call enrichment (HRIS role/manager/time-off, open tickets, CRM deal activity), scoped by the prepped person's email.
- **Status/errors**: a "Connected" badge + "Active Connections" list; per `INTEGRATIONS.md`, failures of any kind (bad key, outage, rate limit, not-found) are indistinguishable from the outside — the prep brief simply omits that section, with no surfaced error.

### 8.7 ClearGo

- **Connect**: Settings → Integrations → ClearGo (`McpIntegrationPanel.tsx`) — Base URL + `X-ClearGo-Key`, **"Connect & test"** pings `{base_url}/api/v1/team-members`.
- **Disconnect**: **Disconnect** button; the only other action is **"Test again"** — there is no way to rotate the key without disconnecting first.
- **What syncs**: live per-prep-call blockers/epics for direct reports, plus a team-wide rollup in the Daily Check-In brief; nothing persisted to a table.
- **Status/errors**: same silent-failure pattern as StackOne, except DCI-brief failures are collected into a reported `errors[]` array specific to that brief.

---

## 9. Superseded Documents

The repo root carries ~40 historical markdown docs from earlier stages. Treat the following as **historical snapshots, not current truth** — this specification supersedes them for architecture/status questions:

- `PRD.md`, `RC-DO-SI-PRD.md`, `tactical_sync_prd_rcdo_module_added.md` — original product/module PRDs; vision and personas are still broadly accurate (§1–2 above draw from them), but their feature-status claims are outdated.
- `RCDO_IMPLEMENTATION_SUMMARY.md`, `RCDO_DEPLOYMENT_LOG.md`, `HASHTAG_SELECTOR_INTEGRATION_COMPLETE.md` — Nov 2025 snapshots of RCDO's initial build.
- `PHASE2_COMPLETE.md`, `PHASE3_COMPLETE.md`, `TEST_*.md`, `TESTING_*.md` — describe the Oct/Nov 2025 testing-infrastructure buildout; actual suite size has grown well past what they describe (see §11).
- `h1-2026-rcdo.md` — not a spec; this is the real company RC/DO/SI content used as Strategy Canvas seed data.
- `PLAN_idea1..9_*.md` — feature design docs; see §7.10 for corrected ship status.
- `DESIGN_SYSTEM_2.md` — describes an unrelated project ("AIPulse", Material UI); appears to be a stray file, **do not reference**.
- `INTEGRATIONS.md`, `TODO.md` — largely live/accurate as of this audit, and the primary sources for §8's integration write-up; see §14 for remaining roadmap items pulled from them.

---

## 10. Design System

Canonical source: `src/design-system/tokens.ts` (root `DESIGN_SYSTEM.md` has drifted — some hex values no longer match the token file; prefer the code).

- **Naming**: metallurgical palette — Copper, Titanium, Platinum, Bronze, Verdigris, Steel, Pewter, Brass, Cast Iron. Semantic colors: success (sage green), warning (brass), error (terracotta), info (steel).
- **Typography**: heading `Atkinson Hyperlegible`, body `Public Sans`, mono `Fira Code`.
- **Layout patterns** (`src/design-system/LAYOUT_PATTERNS.md`): sticky three-part header; left nav sidebar (256px); resizable hierarchical detail-page nav (default 308px, 200–600px range, persisted to `localStorage`); right contextual sidebar (360px, fixed). Mobile collapses sidebars into `Sheet`/`Drawer`.
- **Shared detail-page components**: `DetailPageHeader` (`src/components/rcdo/DetailPageHeader.tsx`, handles both DO and SI via a `type` prop) and `DetailPageNavigation` (resizable hierarchical tree, 5-min module-level cache).
- **shadcn/ui**: ~55 primitives in `src/components/ui/`, plus bespoke composites (`fancy-avatar`, `owner-combobox`, `multi-select-participants`, `rich-text-editor`/`-lazy`, `app-navbar`, `mobile-bottom-nav`, several loading-skeleton variants paired with `Suspense` boundaries).

---

## 11. Testing Strategy

- **Unit/integration (Vitest)**: 58 test files under `src/test/` (`components/`, `hooks/`, `lib/`, `migrations/` — DB migration behavior is unit-tested, `pages/`, `regression/`, `utils/`, `calendar/`, `types/`). Coverage thresholds in `vitest.config.ts` are deliberately low (`lines:3, functions:20, branches:50, statements:3`) — a regression ratchet, not a real target.
- **E2E (Playwright)**: 41 spec files under `e2e/`, organized by domain (`auth/`, `teams/`, `invitations/`, legacy `series/meeting/instances/agenda/`, `critical/` broad flows, `security/`, `rcdo/`, `inbox/` — dormant20, meeting-insights-triage, person-delegation, personMemoryPrivacy, unified-funnel-sync — `api/`). 3-browser matrix (chromium/firefox/webkit), `fullyParallel: true`, `baseURL: http://localhost:8080`. Dev server must be started manually (webServer auto-start is commented out in config).
- **CI**: Husky pre-commit (lint) + pre-push (unit tests) hooks; GitHub Actions presumably runs the full matrix (`.github/workflows/tests.yml`, not independently verified in this audit).
- Both suites have grown substantially past what the historical `PHASE2/3_COMPLETE.md` docs describe — trust file counts over those docs.

---

## 12. Build, Deploy & Dev Tooling

- **Commands**: `npm run dev` (Vite, port 8080, `predev` runs a DB health check), `npm run build`, `npm run lint`, `npm run test` / `test:coverage` (Vitest), `npm run test:e2e` (Playwright), `npm run db:validate` / `db:health` / `db:reset` (destructive).
- **Deploy**: Netlify (`netlify.toml`) — `/assets/*` explicitly 404s on miss (avoids silently masking missing hashed assets behind the SPA fallback), catch-all SPA redirect, security headers (`X-Frame-Options: DENY`, `nosniff`, restrictive `Permissions-Policy`) on all routes, 1-year immutable cache on `/assets/*`.
- **Env**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` required; e2e also needs `SUPABASE_SERVICE_ROLE_KEY`, `PLAYWRIGHT_BASE_URL`; Strategy Canvas collaboration needs `VITE_COLLAB_WS_URL` (defaults to `ws://localhost:1234`).

---

## 13. Known Issues & Drift (found during this audit)

Flagging these here so they're tracked centrally rather than rediscovered. None were introduced by this audit — all predate it.

1. ~~**`status: 'final'` used to lock DOs/SIs is not a valid enum value.**~~ **RESOLVED in [PR #151](https://github.com/arnaudgrunwald0404/tacticalsync/pull/151).** DO lock sites now write `'locked'` (the actual valid enum value); SI lock/unlock sites stop touching `status` entirely, matching the schema's design where SI status is progress-only. Also caught two real, previously-undocumented bugs of the same root cause while fixing this: `StrategyCanvas.tsx`'s node-hydration always rendered locked DOs as "draft" on load, and `SIDetail.tsx`'s unlock handler wrote an invalid `status: 'draft'` for SIs.
2. ~~**`InitiativeStatus` TS type drift**~~ **RESOLVED in [PR #151](https://github.com/arnaudgrunwald0404/tacticalsync/pull/151).** `InitiativeStatus` now matches the DB CHECK constraint exactly (`not_started|on_track|at_risk|off_track|completed`); every dependent site (`SIPanelContent.tsx`, `SubSIPanelContent.tsx`, `DODetail.tsx`, `DetailPageHeader.tsx`, `importRCDOToDatabase.ts`) updated to match. Also found and fixed two live INSERT-time bugs of the same cause: `useRCDO.ts`'s `createInitiative` and `InitiativeDialog.tsx` both inserted new SIs with `status: 'draft'`, which would fail the DB CHECK constraint on every SI creation.
3. ~~**`useActiveInitiatives.ts` filters on a stale status vocabulary**~~ **RESOLVED in [PR #151](https://github.com/arnaudgrunwald0404/tacticalsync/pull/151).** Filter now uses the current "still in play" set (`not_started|on_track|at_risk|off_track`).
4. ~~**No DB-level "one active cycle" constraint**~~ **RESOLVED in [PR #150](https://github.com/arnaudgrunwald0404/tacticalsync/pull/150).** Added a partial unique index (`rc_cycles_single_active_idx`) plus an atomic `rcdo_activate_cycle()` RPC replacing the two sequential client-side UPDATEs; verified under real concurrent-transaction testing that a race between two activations now always leaves exactly one active cycle.
5. ~~**`rc_tasks` RLS was effectively broken for most cycles**~~ **VERIFIED RESOLVED (no code change needed).** Re-audited the full migration chain: `20260521000000_fix_rc_tasks_rls_admin_bypass.sql` is confirmed to be the final word on all four `rc_tasks` policies, each now correctly OR'ing in owner/creator/admin bypasses independent of `team_id`. Also checked `rc_checkins`/`rc_links`/`rc_do_metrics` for the same latent pattern — none carry it; they were made company-wide by an earlier migration that predates `rc_tasks`'s creation.
6. ~~**Manager Signals / Person Delegation both had the same root blocker**~~ **VERIFIED RESOLVED (no code change needed).** Re-confirmed `cos_team_members.linked_user_id` + the claim-invite RPC flow (`20260727000000`) work correctly end-to-end, and that person-delegation's validation trigger correctly enforces the link. Manager Signals views deliberately don't reference the link at all (by design, for privacy — they're computed from the manager's own tagged items, never the report's activity), which is documented in both the view's migration comment and `useManagerSignals.ts`.
7. **Retired Team Meetings module left as dead code** — routes commented out but pages, `useMeetingTimer.ts`, and `meeting_series_action_items` writes (via Unified Funnel sync) all still exist. Needs an explicit decision: fully remove, or document as intentionally dormant. **Not addressed** — this is a product decision, not a code fix.
8. ~~**No retry/backoff on any external integration** (Zoom/Slack/Gmail/Calendar)~~ **RESOLVED in [PR #153](https://github.com/arnaudgrunwald0404/tacticalsync/pull/153).** Added a shared `supabase/functions/_shared/retryWithBackoff.ts` helper (3 attempts, exponential backoff + full jitter, honors `Retry-After` on 429, retries network errors/5xx/429 but not other 4xx) and applied it to every outbound Zoom/Slack/Gmail/Google Calendar API call site across the edge functions (16 files).
9. **Relationship-memory consent is one-sided** — only the manager consents; the direct report whose communications feed the system has no visibility or opt-out today (§7.9). **Not addressed** — this is a product/privacy policy decision, not a code fix.
10. ~~**`CLAUDE.md` accuracy**~~ **RESOLVED.** Updated `CLAUDE.md` directly: corrected the session-timeout description (there is no idle timeout — `useSessionManager.ts` just silently refreshes the token within 5 minutes of expiry), the migration count (220+, not 80+), and RCDO's scoping (company-wide since `20251112100000`, not team-scoped via `team_id`).
11. ~~**Slack channel-allowlist UI writes to the wrong column.**~~ **RESOLVED in [PR #147](https://github.com/arnaudgrunwald0404/tacticalsync/pull/147).** `slack-messages-sync` and `extract-inbox-action-items` now look up `cos_prep_schedule.slack_channels` directly (the actual source of truth) rather than relying solely on the never-populated `user_slack_credentials.sync_channels`, so cron/service-role invocations honor a user's Settings selection automatically, not just the manual "Sync now" path.
12. ~~**Slack escalation-dismiss button is dead code**~~ **RESOLVED in [PR #149](https://github.com/arnaudgrunwald0404/tacticalsync/pull/149).** Escalation DMs now attach a "Dismiss" button (`dismiss_escalation:<log_id>`) wired to the already-implemented handler.
13. ~~**Two Slack feedback types are unreachable**~~ **RESOLVED in [PR #149](https://github.com/arnaudgrunwald0404/tacticalsync/pull/149).** Added a "Too late" button to the daily digest's footer, and a new "Helpful / Wrong format / Not helpful" feedback row to the meeting-format-recommendation DM (which previously had no feedback buttons at all).
14. ~~**`/add-to-1on1` doesn't do what its own Settings copy promises**~~ **RESOLVED in [PR #148](https://github.com/arnaudgrunwald0404/tacticalsync/pull/148).** Implemented the real routing: `/add-to-1on1` now requires and resolves an `@name` mention against the user's tracked colleagues (reusing the existing Zoom/Gmail meeting-ingestion name-matching helper) and routes the topic into that person's 1:1 prep brief (`member_id` + `source_type = 'one_on_one'` on the inserted row); `/add-to-my-lists` is unchanged. Malformed/unresolvable mentions now get a clear ephemeral error instead of silently falling back to a generic add.
15. ~~**Unclear whether the legacy Socket Mode Slack bot (`slack-bot/`) is still deployed in production**~~ **RESOLVED.** Confirmed with the repo owner: no Slack app with Socket Mode enabled is deployed anywhere. This matched the code-level evidence (no `Procfile`/`Dockerfile`/deploy config or CI job for it anywhere in the repo, `SLACK_APP_TOKEN` referenced nowhere outside its own directory, root `README.md` and its own README describing it as optional local dev tooling not hardened for production). Removed the `slack-bot/` directory entirely and its mention in the root `README.md`'s reinstall checklist.
16. ~~**`daily_digest_sent` was never added to `cos_agent_log`'s `event_type` CHECK constraint**~~ **RESOLVED.** `agent-tick/index.ts`'s `sendDailyDigest()` has inserted a `daily_digest_sent` log row (and queried for it, to avoid re-sending the same day's digest) since the feature shipped, but that value was missing from every version of the constraint, so the insert silently failed every time (swallowed by the caller's try/catch). Found incidentally while adding `rcdo_stale_nudge_sent` in PR #160; fixed via a new migration extending the same reconciled event-type union.

---

## 14. Roadmap

### Near-term, explicitly planned (pulled from current docs)
- **RCDO**: mid-cycle review UI, end-cycle retrospective UI, cycle/metric exports (PDF/CSV/JSON), metric-source integrations (ClearInsights/Jira/Sheets webhooks) beyond manual entry. ~~Automated stale-metric alerts and weekly check-in reminders~~ — done, see [PR #160](https://github.com/arnaudgrunwald0404/tacticalsync/pull/160) (21-day staleness threshold, Slack DM + in-app badge, 7-day cooldown). ~~Full hashtag-selector integration into meeting priorities~~ — done, see [PR #158](https://github.com/arnaudgrunwald0404/tacticalsync/pull/158) (added the missing action-item-side linking, and made links visible from the DO/SI detail page via a new "Linked from meetings" tab).
- **RCDO AI (phased, all unbuilt)**: Phase 0 assistive tools (Rallying Cry Drafter, DO Shaper, Metric Designer, Commit Readiness Check, Link Suggestions, Hygiene Flags) → Phase 1 synthesis (Status Synthesizer, Change Scribe) → Phase 2 messaging (weekly digest, owner-alignment nudges). All explicitly assistive-only by design principle, not authoritative.
- ~~**1:1 Prep Sheet redesign** (`TODO.md`)~~ — done, see [PR #159](https://github.com/arnaudgrunwald0404/tacticalsync/pull/159). Notably, 3 of `TODO.md`'s 7 items (full-screen drawer, structured markdown presentation, carry-forward of uncompleted actions) turned out to already be shipped from a prior session that never updated `TODO.md`; the PR verified each against live code before touching anything. Resolved the doc's open question ("where does my personal to-do list live?") as `inbox_items`, via an existing `cos_meeting_actions` → `inbox_items` sync trigger — not `cos_priorities` as originally guessed. Shipped the critical cross-1:1 "My To-Dos" aggregation view. `TODO.md` has been cleared accordingly.
- **Realtime collaboration upgrades** (currently broadcast-and-refetch, not applied outside Strategy Canvas): optimistic updates, typing indicators, collaborative cursors, conflict-resolution UI, activity feed, offline support.
- **Platform-wide**: calendar integration/auto-scheduling, cross-meeting/full-text search, notifications (in-app + email digest), file attachments/comments/@mentions on priorities and action items, org-wide multi-team hierarchies, SSO/SAML, audit logs, consent management, native mobile apps (stated as low-priority, "web-first strategy" through 2027).

### Structural cleanup candidates
- **Consolidate the four coexisting role/permission systems (§4) into one model.** Scoped via a design review (not yet implemented): the four are `team_members.role`, `profiles` booleans (`is_admin`/`is_super_admin`/`is_rcdo_admin`, the workhorse — 22 RLS policies), `role_tags`/`feature_permissions` (nav/section visibility only), and a hardcoded super-admin email fallback backed by a `super_admins` shadow table. Real collisions found: `Settings.tsx` re-checks the same two `profiles` columns three separate times plus the feature-permissions layer on one page; a `test_user` role_tag is assignable in the UI but excluded from `feature_permissions`'s CHECK constraint, so a `test_user`-tagged account loses access to every feature. Recommendation: unify the frontend permission-check API first (one `usePermissions()` hook, ~3-5 days, purely additive), then use that pass to also canonicalize the underlying `profiles` flags and fold `role_tags`/`team_members.role` into them (~1-2 weeks total, additive/backward-compatible). A from-scratch capability table was considered but judged premature — this app doesn't yet have the multi-team/SSO complexity that would justify it; revisit once those land.
- Resolve the three-way "task" split (RCDO `rc_tasks`, Commitments `quarterly_priorities`/`monthly_commitments`, CoS/inbox action items) — currently only two of three sync into the Unified Funnel.
- Decide the fate of the retired Team Meetings module (§6, §13.7).
- ~~Fix the RCDO status-enum drift and the `'final'` lock bug (§13.1–3)~~ — done, see PR #151.
- Extend the account-linking pattern (built for Manager Signals/People Delegation) to any future "track a colleague" feature rather than reinventing free-text CRM rows.
- ~~Fix the Slack channel-allowlist column mismatch (§13.11)~~ — done, see PR #147. ~~Decide whether the legacy Socket Mode bot (§13.15) should be archived~~ — done, confirmed undeployed and removed.

### How to extend this document
When you ship a new subsystem or materially change an existing one:
1. Add or update the relevant module section (§5–7 pattern: hierarchy/schema → lifecycle → key pages → permissions/realtime → open items), or the relevant integration subsection in §8 if it's a new external system or a new Slack-touchpoint.
2. Move anything you just shipped out of §14 and, if it changes ship status for a previously-tracked idea, update §7.10-style tables.
3. Log any new inconsistency you find in §13 rather than silently fixing it in the doc only — link the migration/issue that will resolve it.
4. If a root-level doc becomes stale because of your change, add it to §9.

---

## 15. Appendix: Table Index

| Area | Tables |
|---|---|
| Org/Auth | `teams`, `team_members`, `profiles`, `invitations`, `feature_permissions` |
| RCDO | `rc_cycles`, `rc_rallying_cries`, `rc_defining_objectives`, `rc_do_metrics`, `rc_strategic_initiatives`, `rc_tasks`, `rc_checkins`, `rc_links`, `rc_canvas_states` |
| Meetings (retired) | `meeting_series`, `meeting_instances`, `meeting_series_agenda`, `meeting_instance_priorities`, `meeting_instance_topics`, `meeting_series_action_items`, `agenda_templates`, `agenda_template_items`, `comments` |
| Chief of Staff | `cos_team_members`, `cos_priorities`, `cos_dci_logs`, `cos_person_accountabilities`, `cos_person_topics`, `cos_one_on_one_prep`, `cos_one_on_one_events`, `cos_group_meetings`, `cos_group_meeting_participants`, `cos_group_meeting_sources`, `cos_meeting_actions`, `cos_prep_schedule`, `cos_settings`, `cos_agent_log`, `cos_agent_feedback` |
| Zoom | `user_zoom_credentials` (+ public view), `cos_zoom_recordings`, `cos_zoom_transcripts` |
| Slack/Gmail | `user_slack_credentials`, `cos_slack_messages`, `cos_action_item_scan_state` |
| Inbox | `inbox_items`, `inbox_tags`, `inbox_item_tags`, `inbox_views`, `dci_suggested_tasks` |
| Delegation | `inbox_delegations`, `inbox_delegation_step_executions`, `inbox_delegation_audit_log`, `inbox_item_delegations`, `cos_team_member_invites` |
| Relationship Memory | `cos_relationship_topics`, `cos_prep_topic_mentions`, `cos_forgotten_commitments` (view) |
| Manager Signals | `cos_manager_signal_close_rate` (view), `cos_manager_signal_aging_items` (view) |
| Commitments | `quarterly_priorities`, `monthly_commitments`, `commitment_quarters` |

For column-level detail on any table, see the corresponding module section above or the migration named alongside it — this appendix is an index, not a schema dump.
