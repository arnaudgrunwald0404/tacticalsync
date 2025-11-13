# Product Requirements Document (PRD)
## TacticalSync - Team Meeting & Alignment Platform

**Version:** 1.2  
**Last Updated:** November 11, 2025  
**Status:** Production-Ready  
**Author:** Arnaud Grunwald  

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Product Vision & Goals](#product-vision--goals)
3. [Target Users & Personas](#target-users--personas)
4. [Core Features](#core-features)
5. [User Stories](#user-stories)
6. [Technical Architecture](#technical-architecture)
7. [Security & Compliance](#security--compliance)
8. [Success Metrics](#success-metrics)
9. [Future Roadmap](#future-roadmap)
10. [RCDO Module — Rallying Cry & Defining Objectives](#rcdo-module--rallying-cry--defining-objectives)
11. [Version History](#version-history)

---

## Executive Summary

**TacticalSync** is a real-time team meeting collaboration platform designed to streamline recurring team meetings (tactical, strategic, and ad-hoc). The platform enables teams to manage structured agendas, track priorities and action items across meeting cycles, and collaborate in real-time with presence awareness.

### Key Value Propositions
- **Structured Meeting Framework**: Pre-built agenda templates and customizable meeting structures
- **Real-Time Collaboration**: Multiple team members can collaborate simultaneously with instant sync
- **Cross-Period Tracking**: Priorities and action items persist across meeting instances
- **Role-Based Access**: Granular permissions for members, admins, and super admins
- **Zero Setup Friction**: Quick team creation, invitation system, and OAuth authentication

### Current State
- ✅ **Production-ready** with 114 automated E2E tests
- ✅ **Real-time sync** via Supabase Realtime
- ✅ **Responsive design** optimized for desktop, tablet, and mobile
- ✅ **Comprehensive security** with Row Level Security (RLS) policies

---

## Product Vision & Goals

### Vision Statement
*"Empower teams to run efficient, structured meetings that drive accountability and measurable outcomes."*

### Strategic Goals
1. **Reduce Meeting Overhead**: Cut meeting prep time by 50% with pre-structured agendas
2. **Increase Accountability**: Track action items and priorities across meeting cycles
3. **Enable Remote Collaboration**: Support distributed teams with real-time sync
4. **Scale Team Efficiency**: Support teams from 2 to 200+ members

### Success Criteria
- Teams run weekly meetings in < 30 minutes (vs. 60+ min industry average)
- 90%+ action item completion rate
- 100% meeting attendance visibility
- < 5 second sync latency for real-time updates

---

## Target Users & Personas

### Primary Persona: Team Leader (Admin)
**Name**: Sarah Martinez  
**Role**: Engineering Manager  
**Age**: 35-45  
**Tech Savvy**: High  

**Goals**:
- Run efficient weekly tactical meetings
- Track team priorities across sprints
- Ensure action items don't fall through cracks
- Maintain meeting structure and consistency

**Pain Points**:
- Meetings go off-topic and run long
- Action items get lost in Slack threads
- Hard to see what's blocking team progress
- No visibility into previous week's outcomes

**How TacticalSync Helps**:
- Structured agenda keeps meetings on track
- Priority tracking shows week-over-week progress
- Action items persist across meetings
- Historical view of previous periods

---

### Secondary Persona: Team Member
**Name**: Alex Johnson  
**Role**: Software Engineer  
**Age**: 25-35  
**Tech Savvy**: High  

**Goals**:
- Know exactly what's expected each week
- Update priorities without interrupting flow
- See team priorities and blockers
- Access meetings on mobile

**Pain Points**:
- Unclear what to prepare for meetings
- Forget to update status before meetings
- Don't know what teammates are working on
- Can't access meeting notes on mobile

**How TacticalSync Helps**:
- Clear priority structure with outcomes/activities
- Real-time updates (no "forgot to update" excuse)
- Transparent visibility into team work
- Fully responsive mobile interface

---

### Tertiary Persona: Super Admin
**Name**: Jordan Kim  
**Role**: VP of Operations  
**Age**: 40-50  
**Tech Savvy**: Medium-High  

**Goals**:
- Roll out meeting structure across organization
- Create standardized meeting templates
- Monitor meeting health across teams
- Maintain consistent practices

**Pain Points**:
- Each team does meetings differently
- No standardization across departments
- Can't see organizational patterns
- Limited oversight capabilities

**How TacticalSync Helps**:
- System-wide agenda templates
- Super admin role for oversight
- Cross-team visibility
- Standardized meeting frameworks

---

## Core Features

### 1. Authentication & User Management

#### 1.1 Multi-Provider Authentication
**Status**: ✅ Complete

**Capabilities**:
- Email/password signup and signin
- Google OAuth integration
- Email verification with magic links
- Password reset flow
- Session management with automatic refresh

**User Experience**:
- Branded login page with gradient design
- Clear navigation between signup/signin
- Visual feedback for all auth states
- Verification email with console output for development

**Technical Implementation**:
- Supabase Auth with PKCE flow
- Automatic profile creation on signup
- Real-time auth state changes
- Hash fragment cleanup after OAuth

---

#### 1.2 Profile Management
**Status**: ✅ Complete

**Capabilities**:
- User profiles with first name, last name, email
- Avatar support (URL or generated avatars)
- Profile completion prompts
- Birthday and insights fields

**User Experience**:
- Profile completion modal on first login
- Fancy avatar generation with colorful designs
- Hover tooltips showing full names

---

### 2. Team Management

#### 2.1 Team Creation & Setup
**Status**: ✅ Complete

**Capabilities**:
- Create teams with full name and abbreviated name
- Automatic team membership for creator
- Creator becomes admin by default
- Team-specific settings and configuration

**User Experience**:
- Clean team creation form with validation
- Auto-generated abbreviated names
- Immediate navigation to team dashboard

**Technical Details**:
- UUID-based team IDs
- Cascade delete protections
- RLS policies for data isolation

---

#### 2.2 Team Invitation System
**Status**: ✅ Complete

**Two Invitation Methods**:

**A. Email Invitations**
- Admin sends email invite to specific address
- Email sent via Resend API (Edge Function)
- Branded invitation emails
- 7-day expiration period
- Real-time notification on dashboard

**B. Invite Links**
- Generate shareable invite codes
- Public links that don't require email
- Same role assignment capabilities
- Instant team joining

**Invitation Workflow**:
1. Admin sends invitation (email or link)
2. Recipient receives invitation
3. Recipient accepts/declines
4. Team membership created on acceptance
5. Real-time dashboard updates

**Technical Implementation**:
- `invitations` table with status tracking
- Real-time Postgres subscriptions
- RLS policies for invitation access
- Edge Function for email sending

---

#### 2.3 Role-Based Access Control
**Status**: ✅ Complete

**Three Role Levels**:

**Member** (Default)
- View all team meetings and content
- Add/edit own priorities, topics, action items
- Participate in real-time collaboration
- View agenda items

**Admin** (Team-Level)
- All member permissions
- Create/edit/delete meeting series
- Edit meeting agendas
- Invite new team members
- Manage team settings
- View all team members' work

**Super Admin** (Platform-Level)
- All admin permissions across ALL teams
- Create system-wide agenda templates
- Override team-level restrictions
- Platform configuration access

**Technical Implementation**:
- `role` column in `team_members` table
- `is_super_admin` column in `profiles` table
- `useRoles()` hook for permission checks
- Comprehensive RLS policies enforcing roles

---

### 3. Meeting Series Management

#### 3.1 Recurring Meeting Series
**Status**: ✅ Complete

**Meeting Frequencies**:
- **Daily**
- **Weekly**
- **Bi-weekly**
- **Monthly**

**Meeting Types**:
- **Tactical**
- **Strategic**
- **Ad Hoc**

**Meeting Setup Flow**:
1. Admin selects "Create Meeting" from team dashboard
2. Choose frequency and type
3. Auto-generated name (e.g., "Team Weekly Tactical")
4. Customize meeting name (optional)
5. First meeting instance auto-created

**Naming Convention**:
- Format: `[Team Abbrev] [Frequency] [Type]`
- Example: "Eng Weekly Tactical"
- Manual override supported

**Technical Implementation**:
- `meeting_series` table (recurring definition)
- `meeting_instances` table (occurrences)
- Automatic instance creation

---

#### 3.2 Meeting Instances
**Status**: ✅ Complete

**Instance Management**:
- Automatic creation for current period
- Navigate between past/future instances
- Each instance has unique start date
- Data isolated per instance (priorities, topics)

**Period Labels**:
- **Daily**: "Monday, Nov 25 2025"
- **Weekly**: "Week 45 (11/4 - 11/10)"
- **Bi-weekly**: "Bi-week 45 (11/4 - 11/17)"
- **Monthly**: "Nov 2025 (11/1 - 11/30)"

**Navigation**:
- Dropdown selector for instances
- Prev/Next buttons
- Visual indicator for current vs. past

**Data Persistence**:
- Agenda items persist across ALL instances (series-level)
- Priorities are instance-specific
- Topics are instance-specific
- Action items persist across ALL instances (series-level)

---

### 4. Meeting Agenda System

#### 4.1 Standing Agenda Items
**Status**: ✅ Complete

- Series-level, ordered, DnD
- Fields: Title, Assigned To, Duration, Notes (rich text per instance), Completion (per instance)
- Parking Lot notes area (local + server)

**Tech**: TipTap rich text, @hello-pangea/dnd, optimistic save

---

#### 4.2 Agenda Templates
**Status**: ✅ Complete

- **System Templates (Super Admin)** and **User Templates**
- Collapsible selection UX
- One-click adoption into a series

**Tables**: `agenda_templates`, `agenda_template_items` (flag `is_system`)

---

### 5. Meeting Content Management

#### 5.1 Priorities System — per instance
**Status**: ✅ Complete

- Fields: Title, Outcome, Activities, Assignee, Status(`pending|in_progress|completed|at_risk`)
- Grid by user, inline editing, filters, history peek

**Table**: `meeting_instance_priorities`

---

#### 5.2 Topics System — per instance
**Status**: ✅ Complete

- Fields: Title, Notes, Assigned To, Time, Order
- DnD ordering, live edits

**Table**: `meeting_instance_topics`

---

#### 5.3 Action Items — series-level
**Status**: ✅ Complete

- Fields: Title, Notes, Assignee, Due, Status(`pending|in_progress|completed|cancelled`)
- Filters, overdue, notifications

**Table**: `meeting_series_action_items`

---

### 6. Real-Time Collaboration

- Supabase Realtime subscriptions for meetings, priorities, topics, action items, agenda
- Presence: online users, tooltips, counts
- Connection status indicator, auto-retry

---

### 7. UI/UX, Accessibility, Performance

- shadcn/ui + Tailwind + Framer Motion
- WCAG 2.1 AA
- Code-splitting, debounced autosave, virtual lists

---

### 8. Navigation & IA

- Public: `/`, `/auth`, `/reset-password`
- Auth: `/dashboard`, `/profile`, `/settings`
- Team: `/team/:teamId/...`
- Meeting: `/team/:teamId/meeting/:meetingId`

---

### 9. Data, Security, Compliance

- Supabase Postgres with RLS across all tables
- Migration discipline, indexes, triggers
- Auth: PKCE, JWT refresh, email verify
- Encryption at rest and in transit

---

## Success Metrics

**Engagement**: DAU/WAU/MAU, team creation, meetings/week, return rate  
**Usage**: priorities completion, action items completion, template adoption  
**Business**: MRR (future), churn, CLTV  
**Technical**: TTI, P95 API, realtime latency, uptime

---

## Future Roadmap

**Q1 2026**: Calendar integration, exports, advanced search, notifications  
**Q2 2026**: Comments, attachments, recordings & transcription, template marketplace  
**Q3 2026**: Analytics dashboards, insights, reporting, AI suggestions  
**Q4 2026**: Org mgmt, granular permissions, integrations (Jira/Linear, Teams, Zoom)  
**2027**: Native mobile apps

---

## RCDO Module — Rallying Cry & Defining Objectives

> **Purpose**: Add an alignment layer above weekly meetings so every team knows *what’s most important right now* (Rallying Cry), how we’ll win (Defining Objectives), and what strategic initiatives and metrics will prove progress — all on a 1× cadence (quarterly, semiannual, or annual). The module is tightly integrated with Meetings (bottom-up execution) and will later feed a **Decisions** module (governance & rationale).

### 1) Principles & Guardrails
- **Single Rallying Cry per active cycle** — prevents split focus.
- **Time-boxed cycles** — **Six‑month cadence only** (Jan–Jun, Jul–Dec); only one active per org.
- **4–6 Defining Objectives (DOs)** — crisp, temporary, outcome-focused.
- **Ownership is singular** — **every DO and every Strategic Initiative must have exactly one owner** (no co‑owners) before activation.
- **Metrics required** — at least one leading and one lagging per DO; **manual entry only** at launch (no integrations).
- **Strategic Initiatives** drive the DOs — explicit owners and dates.
- **Weekly check-ins** — owners update metrics and status; auto-rollups within the UI. *(Future: optional weekly digest via Slack/Email — see Roadmap note.)*

### 2) Data Model (new tables)

```
rc_cycles
  id (uuid), org_id, type (quarter|half|year), start_date, end_date,
  status (draft|active|review|archived), created_at, created_by

rc_rallying_cries
  id, cycle_id, title, narrative, owner_user_id,
  status (draft|committed|in_progress|done), locked_at, locked_by,
  created_at, updated_at

rc_defining_objectives
  id, rallying_cry_id, title, hypothesis, owner_user_id (NOT NULL FK → users.id),
  start_date, end_date,
  status (draft|active|locked|done),
  health (on_track|at_risk|off_track|done), confidence_pct (0–100),
  locked_at, locked_by,
  last_health_calc_at

rc_do_metrics
  id, defining_objective_id, name, type (leading|lagging), unit,
  target_numeric, direction (up|down), current_numeric,
  last_updated_at, source (manual|api|sheet|jira|clearinsights)

rc_strategic_initiatives
  id, defining_objective_id, title, description, owner_user_id (NOT NULL FK → users.id),
  start_date, end_date, status (draft|not_started|active|blocked|done),
  locked_at, locked_by

rc_checkins
  id, parent_type (do|initiative), parent_id, date,
  summary, blockers, next_steps, sentiment (-2..+2), created_by

rc_links
  id, parent_type (do|initiative), parent_id,
  kind (meeting_priority|action_item|topic|decision|jira|doc), ref_id
```

**Notes**
- Keep naming under a dedicated `rc_*` namespace for RLS clarity.
- `rc_links` stitches execution artifacts (priorities, action items) to strategy.
- `source` on metrics enables future integrations (ClearInsights, Jira, Sheets, webhooks).

### 3) Permissions & RLS
- **Viewers (all team members)**: read-only across active cycles.
- **Cycle Owners**: create/edit Rallying Cry, DOs, close/open cycles; may **lock/unlock** items.
- **DO Owners**: edit their DO, metrics, initiatives, and check-ins **until locked**.
- **Admins/Super Admins**: override + audit log visibility; can always unlock.

**Locking rules**
- When an item is locked (`locked_at` set), only Admins/Cycle Owners can edit; others switch to **Suggestions** mode (propose edits recorded in comments/change_log).
- Parent lock cascades to children by default (locking a Rallying Cry implicitly locks its DOs and Initiatives unless explicitly overridden).

**Ownership rules**
- `owner_user_id` is **required** (NOT NULL) on DOs and SIs; creation or activation fails without a single owner.
- Ownership transfer is a single-select reassignment (no multi-select); transfers are logged to the audit trail.

RLS patterns:
- `org_id` or team membership check for read access.
- Ownership checks on write; super-admin bypass.
- Row-level guards prevent non-admin edits when `locked_at IS NOT NULL`.

### 4) Scoring Logic
- **Metric status** = compare `current` vs `target` with `direction`.
- **DO health** = weighted average of leading metric statuses (>=80% on-track → `on_track`; 50–79% → `at_risk`; <50% → `off_track`).
- **Confidence %** is owner-set; display both machine health and owner confidence.
- **Cycle score** = Σ(DO weight × DO health score) normalized.
- **Freeze on Done**: when a DO completes, last score is retained.

### 5) Cadences & Lifecycle
- **Cycle lifecycle**: Draft → Active → Review → Archived (immutable).
- **Check-in rhythm**: Weekly reminders; stale metric alerts (>7 days).
- **Mid-cycle review**: One-click snapshot + doc export.
- **End-cycle retrospective**: wins, misses, cause/effect, decision log.

### 6) Core Workflows
1. **Create Cycle** (admin): six‑month cadence auto‑suggests Jan–Jun or Jul–Dec; status `draft`.
2. **Draft Strategy**: create Rallying Cry/DOs/Initiatives in `draft` status; iterate freely.
3. **Review & Commit**: admin switches Rallying Cry to `committed`, DOs to `active` **only if each DO has exactly one owner and ≥1 leading + ≥1 lagging metric**.
4. **Lock**: admin sets `locked_at`/`locked_by` on Rallying Cry, DOs, and/or Initiatives to freeze scope. (Child items inherit lock by default.)
5. **Link Execution**: associate meeting priorities/action items to DOs via `rc_links`.
6. **Weekly Check-ins**: owners update metrics + short note; system recalculates health. *(Future: optional weekly digest to leaders.)*
7. **Mid-cycle Review**: snapshot metrics, initiative status, risk callouts; admins may temporarily unlock to adjust scope.
8. **End-cycle Retro**: auto-generated report; archive, then allow next cycle creation.

### 7) Views (UI)
- **Strategy Home (Exec Snapshot)**
  - Current Rallying Cry banner (title, narrative, owner, dates, **status badge: Draft/Committed/In‑Progress/Done**, **lock icon when locked**)
  - DO tiles (health, confidence, owner, next milestone, status, lock state, linked initiatives count)
  - *(SOO rail removed previously.)*

- **DO Detail**
  - Header: title, hypothesis, owner, status, health badge, confidence slider, **Lock/Unlock** button (admins only)
  - Metrics table (inline edit, manual source badge, last updated)
  - Initiatives board (kanban: Draft → Not Started → Active → Blocked → Done)
  - Check-ins timeline (weekly cards)
  - Links panel: meeting priorities/action items/decisions

- **Cycle Planner**
  - Create/edit cycles, guardrail: one active per org
  - Capacity view: owner load across DOs/initiatives

- **Reviews**
  - Mid-cycle and End-cycle printable reports (PDF/Slides)

### 8) Integrations
- **Meetings module**: 
  - Link a meeting priority to a DO (selector in priority card) → shows up in DO Links.
  - Action items can be spawned from initiatives and inherit the link back to DO.
- **Metrics**: **manual entry only at launch**. *(Future: ClearInsights/Jira/Sheets bindings via webhooks.)*
- **Notifications**: *Future* optional weekly digest and stale metric nudges via Slack/Email.

### 8a) AI Capabilities (phased)
**Principles**: assistive-first, no silent writes, schema-constrained outputs, RBAC- and lock-aware.

**Phase 0 – Assistive (now)**
1. **Rallying Cry Drafter** → proposes 3–5 draft RCs with narratives and trade‑offs.
2. **Defining Objective Shaper** → suggests 4–6 DOs per RC with hypotheses, owners (single), metrics, and initial initiatives.
3. **Metric Designer** → suggests ≥1 leading and ≥1 lagging metric per DO, with target, unit, direction, and "how to measure" notes for manual updates.
4. **Commit Readiness Check** → validates guardrails (single owner, metrics present, ≤6 DOs, initiatives dated) before Commit/Lock.
5. **Link Suggestions** → maps meeting priorities/action items to DOs with confidence scores; owners accept/decline.
6. **Hygiene Flags** → detects stale metrics, idle initiatives, missing check-ins (in‑app banners only).

**Phase 1 – Synthesis**
7. **Status Synthesizer** → converts metric deltas + check-ins into exec-ready summaries on the Strategy Home.
8. **Change Scribe** → drafts audit one-liners when admins change or lock/unlock items.

**Phase 2 – Messaging** (optional)
9. **Digest** → weekly summary to Slack/Email (feature-flagged).
10. **Owner–Priority Alignment Messaging** → gentle nudges when a DO owner’s meeting priorities don’t align with their DOs (details below).

**Function Schemas (examples)**
- `ai.propose_rallying_cry({sources[]}) → {rc_drafts[]}`
- `ai.propose_defining_objectives({rc_id}) → {do_drafts[]}`
- `ai.propose_metrics({do_id}) → {metrics[]}`
- `ai.commit_readiness_check({cycle_id}) → {pass:boolean, issues[]}`
- `ai.suggest_links({artifact_id}) → {do_id, confidence, rationale}`
- `ai.summarize_status({cycle_id}) → {do_summaries[]}`
- `ai.audit_scribe({entity, action, before, after}) → {note}`
- `ai.owner_alignment_message({owner_user_id, window}) → {message, evidence{unlinked_count, misaligned_examples[]}}`

### 8b) Signals & Messaging (Owner–Priority Alignment)
**Goal**: Encourage (not enforce) that DO owners set the right meeting priorities.

**Signal logic** (weekly scan):
- For each DO owner, compute:
  - `% of their meeting priorities linked to any DO` (target ≥80%).
  - `% linked specifically to their own DO(s)`.
  - Count of high‑effort priorities with no DO link.
- If thresholds not met, surface **non-blocking** message on owner’s Meeting view and DO Detail:
  - _“Heads‑up: 3 of your 5 priorities this week aren’t mapped to a Defining Objective. Want to link them or adjust the DO?”_
- Provide one‑click actions: **Link to DO**, **Propose new Initiative**, **Dismiss**.
- No auto-changes; messages disappear once alignment improves or user dismisses.

### 9) Exports & Reporting
- **Cycle Snapshot PDF** (brandable)
- **CSV export** of metrics and initiatives
- **JSON export** of full RCDO state for APIs/integrations

### 10) API (REST-ish via PostgREST)
- `GET /rc/cycles?org_id=...&status=active`
- `POST /rc/rallying_cries` (cycle owner) — **status=draft** by default
- `POST /rc/defining_objectives` (cycle owner) — **requires `owner_user_id`**
- `PATCH /rc/defining_objectives/:id` (DO owner)
- `POST /rc/do_metrics` (DO owner)
- `POST /rc/strategic_initiatives` (DO owner) — **requires `owner_user_id`**
- `POST /rc/checkins` (DO owner)
- `POST /rc/links` (any member mapping their meeting artifact → DO)
- `PATCH /rc/rallying_cries/:id/lock` (admin/cycle owner) → sets `locked_at`, `locked_by`
- `PATCH /rc/defining_objectives/:id/lock` (admin/cycle owner)
- `PATCH /rc/strategic_initiatives/:id/lock` (admin/cycle owner)
- `PATCH .../unlock` variants clear lock fields

**AI endpoints (internal services; create suggestions only)**
- `POST /ai/propose_rallying_cry`
- `POST /ai/propose_defining_objectives`
- `POST /ai/propose_metrics`
- `POST /ai/commit_readiness_check`
- `POST /ai/suggest_links`
- `POST /ai/summarize_status`
- `POST /ai/audit_scribe`
- `POST /ai/owner_alignment_message`

### 11) Seed Examples (JSON)
```json
{
  "cycle": {"type": "quarter", "start_date": "2026-01-01", "end_date": "2026-03-31"},
  "rallyingCry": {
    "title": "Win the upper mid-market with enterprise readiness",
    "narrative": "Harden permissions, notifications, analytics; close 10 lighthouse deals.",
    "owner_user_id": 12
  },
  "definingObjectives": [
    {
      "title": "Permissions v2 GA",
      "owner_user_id": 34,
      "weight_pct": 30,
      "metrics": [
        {"name": "Entitlement test pass %", "type": "leading", "target_numeric": 99.0, "unit": "%", "direction": "up"},
        {"name": "P1 permission bugs/week", "type": "lagging", "target_numeric": 0, "unit": "count", "direction": "down"}
      ],
      "initiatives": [
        {"title": "Role model refactor", "owner_user_id": 47},
        {"title": "Tenant policy editor UX", "owner_user_id": 61}
      ]
    },
    {
      "title": "Notifications 2.0 live for top 50 accounts",
      "owner_user_id": 35,
      "weight_pct": 25,
      "metrics": [
        {"name": "Delivery success rate", "type": "leading", "target_numeric": 99.5, "unit": "%", "direction": "up"},
        {"name": "CSAT on alerts", "type": "lagging", "target_numeric": 4.5, "unit": "avg", "direction": "up"}
      ]
    }
  ],
  "soos": [
    {"area": "Support SLA", "kpi_name": "P1 MTTR", "target_numeric": 4, "unit": "hours"},
    {"area": "Uptime", "kpi_name": "Availability", "target_numeric": 99.95, "unit": "%"}
  ]
}
```

### 12) Analytics & Success Metrics (RCDO-specific)
- **Coverage**: % of teams mapped to at least one DO
- **Update Hygiene**: % DOs with weekly metric updates
- **Drift**: DOs with no active initiative activity in last 14 days
- **Rallying Cry Awareness**: % of users who viewed Strategy Home this week
- **Outcome Hit Rate**: % DOs that reach targets within the cycle
- **Owner Alignment**: % of owner priorities linked to DOs; % of nudges accepted
- **Suggestion Quality**: acceptance rate of AI link suggestions; false-link rate

*(Future: Weekly digest adoption & open-rate once enabled.)*

### 13) Migration Plan
- SQL migrations to create `rc_*` tables, indexes, RLS policies
- Backfill org IDs and seed first cycle template
- Feature-flag in UI; gradual rollout by team

### 14) Risks & Mitigations
- **Bloat risk** → enforce 4–6 DO cap & one active Rallying Cry
- **Stale data** → weekly nudges + stale metric banners
- **Ownership gaps** → require DO owner before activation
- **Gaming metrics** → show both health calc and owner confidence; audit trail on edits

### 15) UX Components (shadcn/ui)
- `RcBanner`, `DoTile`, `MetricRow`, `InitiativeCard`, `CheckinCard`, `CyclePlanner`, `ReviewReport`
- Charts: Recharts mini spark-lines for metrics and SOOs

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Nov 10, 2025 | Arnaud Grunwald | Initial PRD creation |
| 1.1 | Nov 12, 2025 | Arnaud Grunwald | UI improvements, template selection, parking lot, invitation acceptance fix |
| 1.2 | Nov 11, 2025 | Arnaud Grunwald | **Added RCDO module** (data model, workflows, UI, scoring, integrations, API, metrics) and updated ToC |

---

**End of Document**

