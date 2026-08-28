---
title: Recurring Meeting Management — Phased Requirements
subtitle: One spine for 1:1s and recurring team meetings, at parity+ with the current ClearCompany 1:1 Workspace, with explicit stubs for the TacticalSync capability arc
status: draft
author: Arnaud Grunwald
date: 2026-08-13
target_module: chrysalis-product-requirements/modules/succeed/1-1-management/
supersedes_sections_of: modules/grow/1-1-management/spec.md ("Feature scope", "Differentiator analysis")
resolves_open_question: module rename — "1:1 Management" → "Recurring Meeting Management"
---

# Recurring Meeting Management — Phased Requirements

## 0. Why this document exists

The current module spec (`modules/grow/1-1-management/spec.md`) is written almost entirely at the
differentiation altitude: AI-generated prep, relationship memory, personality-aware coaching,
agentic follow-through. Every one of those is a good bet. None of them is a product on day one.

Two confirmed platform decisions force a floor underneath them:

- **D-06** — every module must be a complete product when purchased alone.
- **D-03** — a module may read a dimension, but must function when it is empty.

A module whose value proposition is "AI assembles your agenda from goals, recognition, engagement
pulse, and learning completions" fails both on the day a customer buys it and nothing else. There
are no goals to read, no recognition, no pulse. The differentiators are all *compounding* value;
the module currently declares no *standalone* value.

This document supplies the missing floor and sequences the rest. It defines:

1. **Phase 1** — a deliberately small recurring-meeting workspace that beats the current
   ClearCompany 1:1 Workspace on its own terms, with zero AI and zero cross-module dependency.
2. **A stub register** — the specific schema, enum, and interface decisions Phase 1 must make so
   that Phases 2–4 are additive rather than a rewrite.
3. **Phases 2–4** — the TacticalSync capability arc, sequenced and gated, with each requirement
   mapped to the running implementation that already proves it (§5).

The differentiating capabilities here are **not speculative**. They run today in TacticalSync — 253
migrations, 49 edge functions, AI prep with tiered source discipline, a topic graph,
natural-language relationship query, and a 30-minute autonomous agent with a 22-event audit trail.
The risk in Phases 2–4 is not feasibility. It is which parts survive contact with an enterprise HR
buyer, a works council, and a customer who has connected nothing. Phase 1 is the part that does not
exist anywhere yet — a meeting workspace a manager with no integrations and no other modules will
open twice.

### 0.1 Scope: all recurring meetings, not just 1:1s

This module covers **1:1s and recurring team meetings on one spine**. That matches the existing
spec's own scope note (2026-06-21), which states the module's full scope is all recurring manager
meetings — skip-levels, peer syncs, cross-functional stakeholder check-ins, external relationships —
because the jobs to be done (prepare, execute, follow through, remember) are identical regardless
of how many people are in the room.

Committing to that scope **resolves the spec's open question on the module rename**: with team
meetings in Phase 1, "1:1 Management" is no longer accurate. This document uses **Recurring Meeting
Management**. Adopting it requires a coordinated PR updating `platform/product-scope/module-map.md`,
`platform/product-scope/owner-matrix.md`, and `depended_by` references in downstream modules.

**Why one spine and not two products.** A 1:1 is not a different kind of object from a staff
meeting — it is a recurring meeting series with exactly two participants. Everything that makes the
product good (a standing agenda, carry-forward, action items with owners, history, cadence
tracking) is identical. The differences are narrow and enumerable, and they are handled in §3.4:
discovery policy, participant roles, concurrent editing, and what "shared" means.

The alternative — building 1:1s first and team meetings as a second subsystem later — is the exact
failure this codebase already has, twice: a retired Team Meetings module (§2.5) and a group-meetings
feature bolted onto a 1:1-shaped schema. §5.3 documents what that cost.

> **Status of claims.** §2.1–2.4 (ClearCompany parity baseline) is sourced from public marketing,
> not code — see §2.1 for what could and could not be verified, and §2.4 for how to settle it.
> §2.5 (retired Team Meetings module) and §5 (TacticalSync reference implementation) are verified
> from this codebase and its git history. Everything in §6–8 remains `Hypothesis — requires
> validation` as *product* requirements, notwithstanding that the engineering is proven.

---

## 1. Design principles

These are the constraints that make the module "simpler yet powerful." Each one kills a class of
feature.

**P1. The agenda is the artifact.**
Not the notes, not the meeting, not the summary. The agenda is the one object that persists across
the series. Everything else hangs off it. Tools that treat the agenda as a per-meeting disposable
lose the thread — which is precisely what makes ClearCompany's current workspace feel like a filing
cabinet rather than a working surface.

**P2. Unresolved items are inescapable.**
An action item or agenda topic that was not closed does not disappear when the meeting ends. It
appears on the next occurrence, with an age. This is the cheapest, highest-trust feature in the
category and it requires no intelligence whatsoever.

**P3. Zero organizer effort must still produce a useful screen.**
Adoption is the bottleneck for this module — and per the adoption-flywheel note in the current
spec, it is the bottleneck for Performance and Succession downstream. If opening a meeting requires
someone to first populate it, the module dies. Phase 1 achieves this with deterministic assembly
(standing agenda + carry-forward + calendar), not AI.

**P4. One screen.**
Agenda, notes, and action items are panes of one workspace, not destinations. The current
ClearCompany workspace separates them; the separation is the reason people fall back to a shared
doc.

**P5. Shared by default, private by exception.**
Every participant gets the same workspace and can add items. Everyone has a private lane. Anything
not explicitly private is shared with all participants, and the UI never lets you be unsure which
one you are typing into.

**P6. Every phase ships a complete product.**
No phase leaves a half-built surface behind a feature flag. Phase 1 with agents Off is a product a
customer would pay for.

**P7. Discover meetings, never ask people to re-create them.**
The meeting already exists on the calendar. A product that asks a user to declare a meeting series
inside the app — name it, set its frequency, invite its people — has asked them to maintain a
second copy of their calendar, and they will stop. **This principle is not a preference; it is the
recorded cause of death of the previous team-meeting product in this codebase (§2.5).**

---

## 2. Baselines

### 2.1 ClearCompany 1:1 Workspaces — what we could and could not verify

The 1:1 Workspaces feature **does ship**, but its implementation is not inspectable from this
machine, and its current standing inside the product is ambiguous. Both facts change how much
weight "parity" should carry.

**Confirmed shipping.** ClearCompany's Spring 2023 release announced **1:1 Workspaces** —
managers and employees "purposefully connect, share notes, and exchange regular feedback — and
keep track of those conversations" — and expanded it with **1:1 Consistency Tracking**, giving
managers "greater visibility into upcoming 1:1s, past meetings, and email scheduling reminders,"
plus reminder emails linking directly into the feature.

**Not inspectable.** The feature is not present in any locally checked-out repo:

- `web-clearcompany/Cc.WebBff/Api/Authorization/HrmPermissionTypes.cs` — mirrors the legacy
  monolith's permission list; contains `perf.management`, `alignment`, `performance.admin` and
  others, but **no 1:1-specific permission**. Most likely 1:1s are gated under `perf.management`
  rather than absent.
- No 1:1 route exists among the production nav codes in `clearco-webapp/src/`.
- The implementation lives in the legacy monolith / `HrmGateway`, which is not checked out here.

**De-emphasized in current positioning.** The live Performance Management product page no longer
names 1:1 Workspaces as a discrete feature. The capability now appears folded into "Check-ins and
touchpoints" — *"Facilitate regular one-on-one conversations focused on progress, challenges, and
support — not just formal reviews."* The **ClearGrow** package description in Salesforce
(`Customer_Hub/orchestrator/pricing-reconciliation-report.md`) lists "a learning management
system, 360 feedback, employee engagement surveys, and performance reviews" — **1:1s are not named
in any package description.**

> **The strategic read.** The parity target is a feature that shipped in 2023, was expanded once,
> and then quietly dropped out of both top-line positioning and package descriptions. That is the
> signature of a feature that was built and not adopted. It corroborates Barrett's middle-ground
> observation (`modules/succeed/performance-management/spec.md:44-53`) from the other direction.
>
> **Consequence:** parity is a *cheap* bar, not the goal. Hitting the baseline capabilities is
> necessary so no existing customer loses function on migration — it is not sufficient to make
> anyone adopt the module. The deltas in §3.5 and the adoption exit criteria in §3.8 are where the
> actual work is. **Do not let Phase 1 scope debate optimize for parity coverage.**

### 2.2 The baseline capability table

> ⚠️ Sourced from public marketing and release notes, not from code. Confidence is "as described by
> ClearCompany," not "as implemented." Verification path in §2.4.
>
> **Note the gap this document must fill:** ClearCompany's baseline is **1:1-only**. There is no
> team-meeting capability to reach parity with, so for team meetings the comparison set is Fellow,
> Lattice, and the shared doc that teams actually use today.

| # | Capability in the current workspace | Applies to | Source |
|---|---|---|---|
| B1 | Collaborative shared space between manager and employee | 1:1 | Spring 2023 release |
| B2 | Agenda topics, added by either party | 1:1 | Spring 2023 release |
| B3 | Updates and comments in the shared space | 1:1 | Spring 2023 release |
| B4 | Action items | 1:1 | Spring 2023 release |
| B5 | Private notes and shareable notes | 1:1 | Product marketing |
| B6 | Manager and employee set the schedule / cadence | 1:1 | Product marketing |
| B7 | Shared meeting archive — access to past notes, organized record | 1:1 | Product marketing |
| B8 | Email scheduling reminders, linking back into the feature | 1:1 | Consistency Tracking release |
| B9 | 1:1 Consistency Tracking — visibility into upcoming and past 1:1s, cadence metrics | 1:1 | Consistency Tracking release |
| B10 | Feedback exchange within the workspace | 1:1 | Spring 2023 release |
| B11 | Sits inside the Performance module alongside goals, check-ins, 360 reviews, recognition | 1:1 | Product page |
| — | *No recurring team-meeting capability* | — | Absence verified |

**"Parity"** = all eleven, so migration is lossless. B9 is easy to under-scope because managers
never ask for it — it is the HR-side buying reason.

**"Parity+"** = the seven deltas in §3.5, plus the entire team-meeting surface, which has no
incumbent to match.

### 2.3 Two adjacent baselines worth reading

Neither is the shipping ClearCompany product, but both encode real prior decisions.

**The hackathon prototype — the design that was shown to Jesse.**
`web-clearcompany/clearco-webapp/src/pages/me/dashboardPage.tsx` (~1,678 lines, hardcoded data, no
persistence; header comment: *"Mirrors the real ClearCompany Me > Dashboard surface with dummy data
for the hackathon POC"*). Contains a One-on-Ones tab grouping people into "Supervisor and Direct
Reports" and "Collaborators" with a pending-item count per person, opening a **1:1 Workspace drawer
with three tabs — Agenda ("TALKING POINTS — shared with {name}"), Actions, and Notes ("PRIVATE
NOTES — only visible to you")**.

Close to the Phase 1 target; validates delta +3 and principle P5. Two notes: the three tabs should
become three *panes* (P4), and its shared/private distinction is a cosmetic label, not an enforced
permission — R1.6 makes it real.

**The `clearco-one` module scaffold — an already-declared data model.**
`clearco-one/docs/modules/requirements-one-on-ones.md` §3 (owner `UNASSIGNED`, status `scaffold`)
names: `one_on_one_series` (participants, cadence), `one_on_one_meetings` (occurred_at),
`agenda_items` (author, visibility `shared | private_to_author`), `meeting_notes`, `action_items`,
`talking_point_suggestions`. `clearco-one/src/modules/one-on-ones/module.ts` declares four domain
events with empty `TODO(UNASSIGNED)` payloads; `data/` and `ui/` are empty.

**Reconciliation required:**

| Scaffold | This document | Resolution |
|---|---|---|
| `one_on_one_series` — 1:1-specific | `meeting_series` with a `type` — stub **S1** | Adopt S1. The scaffold's series is the right shape but the wrong name and scope; generalizing it now is free. |
| Shared vs private notes as **separate objects** | Single `note` entity with a `visibility` enum — stub **S7** | Adopt S7. Separate objects cannot extend to participant-scoped, `hr`, or `skip_level` visibility without a table per case. |
| Four declared domain events, payloads empty | Every state transition emits an event — stub **S9** | Fill the scaffold's payloads per S9; the event contract is a Phase 4 prerequisite. |

### 2.4 How to settle the ClearCompany baseline definitively

Two sources outside these repos would replace §2.2's marketing-sourced table with fact:

1. **`clearcompany/clearcompany` monolith** — `Common/Cc.Common.Permissions/PermissionType.cs` and
   the 1:1 tables in `HrmGateway`. Gives the real schema, visibility model, and reminder logic.
2. **Project Helix / ClearInsights module-usage data** (see
   `Customer_Hub/Customer-Hub-product-spec.md:446-464`) — the canonical source for which modules are
   actually enabled and used per account. **The more important of the two.** If 1:1 Workspaces usage
   is near zero, the §2.1 strategic read is confirmed and Phase 1 should be scoped for adoption,
   with parity treated purely as a migration obligation.

### 2.5 Prior art that failed — the retired Team Meetings module

**This is the most directly relevant evidence in this document, and it is a post-mortem.**

Recurring team meetings were **the original Stage 1 product of this codebase**, shipped and then
retired. The schema (`supabase/migrations/20251017001000_create_tables.sql`) was well-shaped:

| Table | Level | Columns |
|---|---|---|
| `meeting_series` | series | `team_id`, `name`, `frequency` (`daily`/`weekly`/`bi-weekly`/`monthly`), `created_by`, later `parking_lot` |
| `meeting_instances` | occurrence | `series_id`, `start_date` |
| `meeting_series_agenda` | series | `title`, `notes`, `assigned_to`, `time_minutes`, `order_index` |
| `meeting_series_action_items` | series | `title`, `notes`, `assigned_to`, `due_date`, `order_index` |
| `meeting_instance_priorities` | occurrence | `title`, `outcome`, `activities`, `assigned_to`, `order_index` |
| `meeting_instance_topics` | occurrence | `title`, `notes`, `assigned_to`, `time_minutes`, `order_index` |
| `agenda_templates` / `agenda_template_items` | — | reusable agendas, user-created or `is_system` |

Real-time collaboration was Supabase broadcast-and-refetch with presence on a
`presence:meeting:{meetingId}` channel.

**What killed it.** The retirement commit (`d9d2b93`, 2026-07-12) records only that the feature "is
no longer used." The rationale is not written down anywhere — but the surrounding commits make the
mechanism clear, and two of them state it directly:

- **It asked users to re-create their meetings in the app.** `meeting_series` has `name` and
  `frequency` columns and no calendar linkage at all. Every series was hand-declared. Its
  replacement (`6d9d7a7`, 2026-06-19, "group meetings foundation") explicitly *"replace[d] the
  `max_other_attendees` head-count cap and `exclude_emails` filter with a curated list of recurring
  multi-person meetings the user opts into,"* discovered by `google-calendar-sync` and keyed on
  the calendar's own `recurringEventId`. **This is the origin of principle P7.**
- **It was team-scoped.** `meeting_series.team_id NOT NULL REFERENCES teams(id)` required a `teams`
  construct to be populated and correct before anything worked. The same mistake was reversed in
  RCDO by `20251112100000_make_rcdo_company_wide.sql`, which dropped `rc_cycles.team_id`'s FK and
  NOT NULL constraint. **Team-scoping was abandoned twice in this codebase.**
- **It was absorbed rather than replaced.** `5f34e75` (2026-07-06): *"Meetings now live under the
  Inbox's own Meetings tab; the separate top-level nav item and mobile bottom-nav tab were stale."*

**What its death cost, and the stub lesson.** The final removal commit (`aeecfdd`, 2026-08-05)
records: *"This included the only UI that let users link a meeting priority or action item to a
DO/SI (`rc_links`), so that capability had already silently stopped working."* A cross-module
capability that lived in exactly one screen died silently with that screen, and nobody noticed for
weeks. **Cross-module links must be a property of the item, not of a UI** — this is why stub S3
(`origin_ref`) and stub S9 (events) are non-negotiable.

**What remains.** The tables are still live. `meeting_series_action_items` still receives writes
through the Unified Funnel sync into `inbox_items`, and `LinkedMeetingItems`/`useRCLinks` still
render links created before deprecation. The pages (`TeamMeeting.tsx`, `TeamMeetingSetup.tsx`,
`MeetingSettings.tsx`) were deleted; the tables were not. `docs/SPECIFICATION.md` §13.7 flags this
as an unresolved product decision.

**What to carry forward.** The schema's core insight is correct and should be adopted:
**series-level standing agenda + occurrence-level topics** is the right decomposition (§3.2), and
`parking_lot` and `agenda_templates` are real team-meeting requirements that a 1:1-only design
would never have surfaced.

---

## 3. Phase 1 — The floor

**Agent mode:** Off. No LLM call is made anywhere in Phase 1.
**Cross-module dependency:** none. Reads Identity, Work & Roles, and Relationships (manager edge)
only. Functions with all other dimensions empty.

**Standalone value proposition:** *Every recurring meeting — 1:1 or team — has one continuous,
shared agenda where nothing left unresolved gets lost, discovered automatically from the calendar
so nobody maintains it twice. Managers and HR can see which meetings are actually happening and
which have gone quiet.*

### 3.1 Rollout: 1a then 1b, one schema

Extending to team meetings materially increases Phase 1's surface. It does **not** justify two
schemas or two phases. Phase 1 ships in two rollout steps against one spine:

| Step | Scope | Why this order |
|---|---|---|
| **1a** | 1:1s — direct reports, auto-discovered | Migration parity for existing ClearCompany customers; the narrower visibility model; validates the spine with the simplest participant case |
| **1b** | Recurring team meetings — calendar-discovered, opt-in | Adds participant roles, concurrent editing, templates, decisions, and attendance on the same tables |

**Nothing in 1b changes 1a's schema.** If it does, the spine is wrong — stop and fix it before
shipping 1a. That test is the entire reason to design both now and ship them in sequence.

### 3.2 The spine

Six entities. A 1:1 is a series with two participants; a staff meeting is a series with eight.

| Entity | Notes |
|---|---|
| **`meeting_series`** | `type` (`one_on_one`, `team`, `skip_level`, `peer`, `stakeholder`, `external`), `title`, `cadence`, `discovery_source`, `external_recurrence_key`, `included`, `parking_lot`. **No `team_id`** — see §2.5. |
| **`series_participant`** | `series_id`, `person_id`, `role` (`organizer`, `participant`), `added_at`, `removed_at`. Membership is time-aware so history stays correct when people join or leave. |
| **`occurrence`** | `series_id`, `scheduled_at`, `state` (`scheduled`, `held`, `skipped`, `cancelled`), `external_event_id`. |
| **`agenda_item`** | `series_id`, **nullable** `occurrence_id`, `author_person_id`, `visibility`, `source`, `origin_ref`, `topic_id`, `order_index`, `time_minutes`, `outcome`. **A null `occurrence_id` means a standing item** that appears on every occurrence — the retired module's best idea (§2.5). |
| **`action_item`** | `series_id`, `occurrence_id`, **`assignee_person_id`**, `due_date`, `status`, `surface_count`, `last_surfaced_at`. |
| **`note`** | `occurrence_id`, `author_person_id`, `visibility`, body. |

Plus **`relationship`** — `(person_a, person_b, type)` — which a two-person series links to. It is
not the spine, but it must exist in Phase 1, because pair memory has to outlive any individual
series for delta +6 (history survives the manager change) to be possible.

> **The one correction this extension forces.** A 1:1-only design models action-item ownership as
> `owner: me | them` — which is what the TacticalSync reference implementation does
> (`cos_meeting_actions.owner`). **That does not generalize to a meeting with eight people**, and
> converting it later means migrating every historical row and every query. `assignee_person_id`
> costs nothing today. This is the single most valuable thing this scope extension surfaces, and
> the retired module already had it right (`assigned_to UUID`).

### 3.3 Parity requirements (Phase 1a)

| ID | Requirement | Maps to |
|---|---|---|
| R1.1 | A series exists for each manager–report pair, discovered from the reporting line and the calendar. It owns the continuous agenda and all history. | B1 |
| R1.2 | Occurrences belong to a series, with a scheduled datetime and a state. | B6 |
| R1.3 | Agenda items belong to a series and are either standing or assigned to an occurrence. Any participant can add, edit their own, reorder, and check off. | B2 |
| R1.4 | Comments thread under an agenda item. | B3 |
| R1.5 | Action items carry an **assignee (any participant)**, optional due date, and status (`open`/`done`/`cancelled`). | B4 |
| R1.6 | Notes have a visibility of `shared` or `private`. Private notes are visible only to their author, permanently — including to HR and including after offboarding. | B5 |
| R1.7 | Cadence is set per series (weekly, biweekly, monthly, custom), proposed from the calendar and confirmable. Occurrences generate forward. | B6 |
| R1.8 | Every past occurrence is readable with its agenda, notes, and action items, filtered by the reader's visibility. | B7 |
| R1.9 | Notification intents fire before an occurrence and after one is missed. Channel and timing belong to the platform notification service, not this module. | B8 |
| R1.10 | **Consistency tracking**: for a manager, a roll-up per series of cadence adherence, last-held date, and open-action count. For HRBP/admin, the same roll-up across a population — **counts and dates only, never content**. | B9 |
| R1.11 | Feedback exchange is an agenda item type, not a separate object. | B10 |
| R1.12 | When Goals, Recognition, or Engagement are entitled and populated, their items can be attached to an agenda item as a reference. When not, the affordance is absent — not empty, not disabled. | B11, D-03 |
| R1.13 | **Two-sided transparency.** Every participant can see that an agenda exists for their next occurrence, which shared items are on it, and what actions are assigned to them. Nothing in anyone's private lane is exposed. | §3.4 |

### 3.4 Why R1.13 is a Phase 1 requirement and not a Phase 3 refinement

The TacticalSync reference implementation carries an open, unresolved gap
(`docs/SPECIFICATION.md` §13.9): **relationship-memory consent is one-sided.** Only the manager
consents to the system building a memory of the relationship; the direct report has no visibility
and no opt-out. Tolerable in an internal single-user tool. Not tolerable in an HR product sold to
enterprises — it is the exact shape of finding that stops a works-council review or a DPIA, and by
Phase 3 the memory layer is already built on top of it.

The reference implementation's own notes identify the cheapest first step: notify the report when
their prep is ready. R1.13 generalizes that into a Phase 1 obligation, and it becomes *more*
important with team meetings in scope: a meeting with eight participants and one person who can see
the record is not a shared workspace.

### 3.5 The seven "+" deltas

What makes Phase 1 *better* than the incumbent rather than a re-implementation. Each is
deterministic, cheap, and independently shippable.

**+1. Automatic carry-forward.**
When an occurrence is marked held, every unchecked occurrence-scoped agenda item and every open
action item attaches to the next occurrence, tagged with how many occurrences it has survived. An
item carried three times renders with a visible age signal.
*Why it wins:* the single behavior that makes an agenda a thread instead of a form, and the
mechanism that makes P2 real.

**+2. Discovery, not declaration.**
Recurring meetings are found on the calendar and keyed on the calendar's own recurrence identifier.
**1:1s auto-include** (exactly one other attendee). **Team meetings are discovered but opt-in**,
presented as a curatable list — because a calendar holds many recurring meetings and most should
not become workspaces. Manual creation remains as the fallback when no calendar is connected (D-03).
*Why it wins:* this is P7, and it is the recorded difference between the retired module and its
replacement (§2.5).

**+3. One workspace, three panes.**
Agenda, shared notes, and action items render on a single screen against a single occurrence, with
the private lane as a persistent side rail. No navigation between them.

**+4. Standing agenda plus per-occurrence topics.**
A series carries standing items that appear every time ("Metrics", "Blockers", "Anything for me?"),
distinct from topics raised for one occurrence. Templates seed the standing set; a **parking lot**
holds items deferred without being lost.
*Why it wins:* this is how recurring team meetings actually run, and 1:1s benefit too. Both
concepts are lifted directly from the retired module's schema, which got this right.

**+5. Deterministic pre-meeting assembly.**
Before each occurrence the agenda is *already populated*: standing items, carried-forward items,
action items due or overdue since the last occurrence, and — only where entitled and populated —
goal progress deltas, recognition, and completed development actions. No LLM. Pure rules over data
the platform already holds.
*Why it wins:* the "prep-free prep" wild moment from `wow.md`, delivered without AI risk, and the
contract Phase 2's AI generator later implements.

**+6. History survives the manager change.**
Relationship history is owned by the *pair*, not the manager. Reassignment creates a new series
while preserving a readable handover view of the prior one — shared content only, private notes
never transfer. For team meetings the equivalent is organizer handover: the series and its history
survive a change of owner.
*Why it wins:* "THE THREAD THAT SURVIVED" from `wow.md`. A data-ownership decision, not a feature,
and nearly impossible to retrofit.

**+7. Symmetric participant surface.**
Every participant sees the same workspace with the same affordances, including their own private
lane and their own action items.
*Why it wins:* the category's tools are organizer-first, and participant adoption is what produces
the signal density Performance and Succession need downstream.

### 3.6 Team-meeting requirements (Phase 1b)

Everything in §3.3 applies unchanged. These are the additions that only arise above two people.

| ID | Requirement | Why it does not arise in a 1:1 |
|---|---|---|
| R1.14 | **Opt-in curation.** Discovered recurring team meetings land with `included = false` and are presented as a curatable list with roster and cadence. | A 1:1 is unambiguous; a calendar's recurring meetings are not. |
| R1.15 | **Participant roles.** `organizer` vs `participant`. Only an organizer edits the standing agenda, templates, and cadence; any participant adds topics, notes, and actions. | Two peers in a 1:1 need no role asymmetry. |
| R1.16 | **Time-aware membership.** Joining or leaving a series is recorded with a timestamp; a participant sees history from their join date forward by default, and never private content. | Membership is static in a 1:1. |
| R1.17 | **Concurrent editing.** Multiple participants edit the live agenda simultaneously, with presence indication and last-write-wins on a per-item basis. Item-level granularity (S6) is what makes this tractable without CRDTs. | Two people rarely collide. The retired module already solved this with broadcast-and-refetch plus a presence channel. |
| R1.18 | **Agenda templates.** Reusable named agendas, user-created or system-provided, applied to a series to seed its standing items. | Overkill for a 1:1; table stakes for a staff meeting. |
| R1.19 | **Decisions.** An agenda item can be marked with an outcome (`discussed`, `decided`, `deferred`, `parked`), and a `decided` item records decision text. Decisions are surfaced in history distinctly from discussion. | A 1:1 produces commitments; a team meeting produces decisions that absent people need to find. |
| R1.20 | **Attendance.** Who actually attended an occurrence is recorded. Feeds R1.10 consistency tracking and answers "who wasn't there when this was decided." | Attendance in a 1:1 is the occurrence state. |
| R1.21 | **Parking lot.** A series-level list of deferred items, promotable onto any future occurrence. | Emerges from group agendas that overrun. |

### 3.7 Explicit Phase 1 non-goals

- No transcription, recording, or meeting-bot presence.
- No LLM-generated content of any kind — including "suggested talking points."
- No sentiment, topic extraction, talk-time, or relationship health score.
- No messaging-platform interactivity beyond a notification link back into the product.
- No cross-series or cross-report pattern detection.
- No personality assessment.
- No CRDT-based collaborative rich text. R1.17 is item-level, deliberately.
- No external/guest participants — schema supports the type (S1), Phase 1 exposes only internal
  people, because guest access is an authentication and data-residency problem, not a meeting one.

### 3.8 Phase 1 exit criteria

For a customer with **only** this module entitled:

- ≥70% of manager–report pairs have held an occurrence in the trailing 30 days.
- ≥50% of held occurrences have ≥1 agenda item contributed by someone other than the organizer.
- ≥1 recurring team meeting opted in per manager, median, within 30 days of availability *(1b)*.
- Median organizer time-to-first-useful-screen under 15 seconds from login, with zero prior setup.
- Action item close rate instrumented and reported per series.
- The HR consistency roll-up returns correct counts with no access to any content.

---

## 4. The stub register

The core of this document. Each stub is a decision Phase 1 must make *because* of a later phase —
near-zero cost at design time, large as a retrofit.

| ID | Stub | Phase 1 behavior | Unlocks | Phase |
|---|---|---|---|---|
| **S1** | `meeting_series.type` enum covering `one_on_one`, `team`, `skip_level`, `peer`, `stakeholder`, `external`; `relationship` keyed on `(person_a, person_b, type)`, **not** `(manager_id, report_id)` | 1a writes `one_on_one`; 1b adds `team` | Skip-level, peer, stakeholder, external, mentor series with no migration | 1b, 3 |
| **S2** | `agenda_item.source` enum: `human`, `system`, `agent` | Only `human` and `system`; `system` covers standing items, carry-forward, and deterministic assembly | Phase 2 AI writes `agent` items to the same table; provenance chips already render | 2 |
| **S3** | `agenda_item.origin_ref` — polymorphic `(entity_type, entity_id)`, nullable | Populated for carry-forward and cross-module attachments | "Why is this here?" provenance works identically for AI items — **and prevents the §2.5 silent-link-death failure** | 2 |
| **S4** | `prep` record per occurrence, produced by a named **generator** behind an interface | Generator is `deterministic_v1` (rules only) | Phase 2 registers `ai_v1` against the same contract; A/B and per-tenant fallback are free | 2 |
| **S5** | `agenda_item.topic_id` nullable, no `topic` table yet | Always null | Phase 3 adds the topic table and backfills; no change to the agenda write path | 3 |
| **S6** | Agenda, note, and action item are separate entities sharing an `occurrence_id` — **not** one rich-text blob | Three panes of one screen | Every later phase depends on structured items; also what makes R1.17 concurrent editing tractable | all |
| **S7** | `note.visibility` and `agenda_item.visibility` enums: `private`, `shared` — with room for `hr`, `skip_level`. `shared` means *all current series participants*, resolved through `series_participant` | Only `private`, `shared` | Phase 3 skip-level and HR-visible summaries; correct behavior when membership changes | 1b, 3 |
| **S8** | `meeting_artifact` join table (occurrence → external artifact), shipped empty | No rows | Transcripts, recordings, message threads, email threads attach with no schema change | 2 |
| **S9** | Every state transition emits a **cross-module event** from day one | Emitted and logged; nothing consumes them | Act-mode agents legally require an audit trail that predates them; retrofitting leaves a gap | 4 |
| **S10** | `agent_mode` per-tenant, per-module setting present from day one | Present, defaults and locks to `off` | Four-mode governance (D-11/D-12/D-13) applies without a config migration | 2–4 |
| **S11** | History ownership is pair-scoped for 1:1s and series-scoped for team meetings, with an explicit handover view on reassignment | Implemented in Phase 1 (delta +6) | Cannot be retrofitted once history is manager-scoped | 1 |
| **S12** | Integration reads go through a **signal-source adapter** interface, not direct vendor SDK calls | One adapter: calendar | Conferencing, messaging, email adapters drop in; decouples the unresolved Kombo-vs-StackOne question from the module | 2 |
| **S13** | `action_item.surface_count` **and** `last_surfaced_at` | Both written by carry-forward | Phase 3 forgotten-commitments urgency reads fields with months of history | 3 |
| **S14** | **`action_item.assignee_person_id`** — never `owner: me \| them` | Assignee is any participant | Team meetings work at all; avoids migrating every historical row and query | 1b |
| **S15** | One action-item spine. Any other module needing to surface a commitment references it rather than copying it | Single table | Avoids the retrofitted trigger-bridge between parallel task concepts (§5.2) | all |
| **S16** | `agenda_item.occurrence_id` nullable, where null = standing item | Used by delta +4 | Templates, parking lot, and per-series structure without a second table | 1b |
| **S17** | `series_participant` carries `added_at` / `removed_at` | Written on join and leave | Correct history visibility as membership changes; correct attendance analytics | 1b |
| **S18** | `meeting_series` has **no `team_id`** and no dependency on a `teams` construct | Series are discovered and participant-scoped | Team-scoping was abandoned twice in this codebase — in the retired module and in RCDO (§2.5) | 1 |

> **S13 is the sleeper.** Phase 3's forgotten-commitments feature is only compelling if it can say
> "this has come up five times since March, most recently last Tuesday." Both the counter and the
> timestamp must have been running since Phase 1. Ship the fields, populate them, show nothing.

> **S14 is the one this scope extension bought.** It looks like a naming choice. It is the
> difference between team meetings being a schema addition and being a migration.

> **S15 is the expensive one to skip.** The reference implementation ended up with three separate
> task concepts, only two of which sync, bridged after the fact by triggers and a dedupe key — the
> single largest piece of accidental complexity in the system, originating in a reasonable-looking
> decision to let a second surface keep its own items.

---

## 5. The reference implementation

Phases 2–4 are not speculative. All of it runs in **TacticalSync** (`team-tactical-sync`): 253
migrations, 49 edge functions, ~18k LOC of functions. `docs/SPECIFICATION.md` §7–8 is authoritative;
the root-level `PLAN_idea*.md` files are stale planning docs whose *grounding* sections remain
useful.

The question for Phases 2–4 is not "can this be built" but "which parts survive productization."

### 5.1 Constraints inherited from the reference implementation

Not options. Each was paid for once already.

| # | Constraint | Why it matters |
|---|---|---|
| C1 | **Nothing AI-extracted is ever auto-created as a real item.** Everything lands as an `agent_question` awaiting one-tap approval. | The most important trust decision in the system. It is what makes Recommend mode safe and Act mode arguable. Encoded in R2.2 and R2.4. |
| C2 | **Anti-surveillance framing is enforced in three layers** — migration comments, hook headers, UI copy. Manager signals compute *only from the manager's own tagged items*, never the report's activity. Talk-time analysis forbids leaderboards and cross-person comparison. | In an HR product this moves from taste to compliance. Constrains R1.10 and R3.6 — and gets sharper with team meetings, where attendance data invites misuse. |
| C3 | **Relationship memory is deliberately non-embedding** — big-context prompt with caching (~150 items / ~30K tokens per person), not pgvector. | Simpler and debuggable. Revisit only at a stated scale threshold. Constrains R3.3. |
| C4 | **Talk-time is keyed by raw speaker-name string, not identity.** | A deliberate refusal to overclaim precision the fuzzy matcher cannot support. The principle — never resolve to an identity you cannot verify — applies broadly. |
| C5 | **Prep is polymorphic**: one prep table covering both 1:1s and group meetings, never a parallel table. | Confirms S1 and S4. This document goes further: one *series* spine, not just one prep table. |
| C6 | **Source discipline is tiered in the prompt itself** (Tier 0 leadership → Tier 1 direct comms → Tier 2 systems → Tier 3 org context, the last "reference ONLY if direct evidence connects this person"). | Prevents the brief confabulating relevance. Port the tier structure, not just the sources. |
| C7 | **A no-signal path is a first-class prompt**, generating open-ended questions with an explicit instruction not to invent talking points. | This *is* D-03 graceful degradation, already solved, and directly reusable for a customer with nothing connected. |
| C8 | **Leadership talking points use a dual merge strategy** — fed to the model as Tier 0 *and* rendered deterministically from the source table, so the unparaphrased text is guaranteed to appear. | The pattern for any content a model must not reword. |
| C9 | **Agent feedback is genuinely adaptive**: ≥3 "too early" pushes timing later (max 48h), ≥3 "too late" pulls earlier (min 6h), 30-day lookback. | Cheap, legible, and what makes nudges tolerable. |
| C10 | **Nudges have a hard ceiling** (max 5, then silently parked with a `nudge_capped` audit event) and are quiet-hours aware. | The difference between an assistant and a nag. Non-negotiable for R4.1. |

### 5.2 Anti-patterns not to inherit

- **Two parallel Gmail/Slack mining pipelines coexist** (Haiku → `agent_question` vs. Gemini →
  `dci_suggested_tasks`). Pick one at Phase 2 design time.
- **Three separate "task" concepts**, only two of which sync, bridged by retrofitted DB triggers.
  S6 plus S15 avoids this.
- **Four coexisting permission systems.** Phase 1 uses the platform permission model only.
- **Two coexisting data models** (`cos_*` owner-scoped and `inbox_*`) bridged by triggers — a
  consequence of the second being "a parallel experiment alongside" the first.
- **A retired module left as live dead code** (§2.5): pages deleted, tables still written by sync,
  no removal decision recorded. Whatever Phase 1 supersedes needs an explicit disposition.

### 5.3 What the reference implementation validates — and where it needs correcting

| Stub | Evidence |
|---|---|
| **S13** | `cos_meeting_actions` carries both `surface_count` and `last_surfaced_at`; `cos_forgotten_commitments` derives urgency from *days pending* as well as due date. A count alone loses recency. |
| **S4** | `cos_one_on_one_prep.source` is already an enum (`cleargo`/`static`/`ai_generated`) with `data_sources_used[]` alongside. The generator-swap contract is proven. |
| **S2 / S3** | `data_sources_used[]`, `prep_generation_log` (tokens, model, duration) and `cos_prep_topic_mentions` show provenance is used constantly in practice. |
| **S9** | `cos_agent_log` grew to **22 event types** across six constraint migrations. Ship the audit spine before the agent. |
| **S5** | `cos_relationship_topics` carries `category`, `sentiment`, `status`, `mention_count`, first/last mention and a GIN index — richer than S5's placeholder anticipated, all hanging off the agenda-item join. |
| **S1 / S14** | ⚠️ **Correction.** The reference grew a 1:1 spine (`cos_team_members`) and then bolted group meetings alongside it (`cos_group_meetings` + participants + sources), unifying only at the prep table. Its `cos_meeting_actions.owner` is `me \| them` — a 1:1-ism that cannot express "assigned to Dana in the staff meeting," and `owner='them'` rows are deliberately never mirrored into the funnel because there is no app user to sync into. **Do not port this.** S1 and S14 are the corrections. |
| **S18** | The retired module's `meeting_series.team_id NOT NULL` and RCDO's later removal of `rc_cycles.team_id` are two independent verdicts on team-scoping in this domain. |

---

## 6. Phase 2 — AI prep and capture

**Agent mode:** Recommend becomes available; Off remains supported and remains the default until
the customer opts in. **Gate:** Phase 1 exit criteria met.

| ID | Requirement | Stub | Reference |
|---|---|---|---|
| R2.1 | An AI generator produces the pre-meeting brief, registered against the same interface as `deterministic_v1`. On failure or timeout it falls back — the organizer always gets a populated screen. Port the **tiered source discipline** (C6) and the **no-signal prompt** (C7). | S4 | `generate-1on1-prep` (1,234 lines) |
| R2.2 | Suggested agenda items are written with `source = agent`, individually acceptable or dismissible, never silently inserted as shared content (C1). Dismissals persist per series. | S2, S3 | `OneOnOnePrepDrawer.tsx`; `agent_overrides.excluded_talking_points` |
| R2.3 | Signal sources expand beyond calendar via adapters: conferencing transcripts, messaging channels and DMs, email threads, prior briefs. Independently toggleable per customer **and per individual**, with per-series tier config. | S12, S8 | `cos_prep_schedule.prep_tools`/`tool_tiers`; `recommend-prep-tools` |
| R2.4 | Post-meeting summary: decisions, action items with assignees, topics — proposed for confirmation, deduped against existing items. Nothing enters shared content without a human accept (C1). | S8, S2 | `generate-meeting-suggestions` (Jaccard dedupe) |
| R2.5 | Generation is scheduled (batch, ahead of the occurrence, in local timezone) and on-demand, with caching, rate limits, and per-run telemetry. | S4 | `daily-prep-batch`, `cos_prep_batch_log` |
| R2.6 | Every generated item is attributable: which sources, when, what model, what token cost. | S3, S9 | `data_sources_used[]`, `prep_generation_log` |
| R2.7 | **Leadership talking points**: an admin injects a standing item into every 1:1 (or every series of a given type) for a bounded period, with per-organizer-per-series dismissal. Dual merge strategy (C8) so the text is never paraphrased. | S3, S16 | `cos_org_talking_points` |
| R2.8 | **Team-meeting briefs** use the series as the subject, drawing on the shared channels and artifacts attached to that series rather than a person's communications. | S1, S8 | `generate-group-brief` (465 lines); `cos_group_meeting_sources` |

**Non-goals:** no autonomous action, no between-meeting outreach, no writes to other modules.

**Open risk:** R2.3 is the module's largest privacy surface — reading a person's messages and email
to prepare a meeting. The Section 8 legal review must land *before* Phase 2 build, not before
launch. Team meetings soften this slightly (shared channels are less sensitive than DMs) and worsen
it in one respect: a brief assembled for eight people can expose to all of them something only one
had access to. Source-scoping must be per-participant.

---

## 7. Phase 3 — Relationship and series memory

**Agent mode:** Recommend. **Gate:** Phase 2 accept-rate on suggested items above a threshold to be
set — if organizers dismiss most AI items, memory built on the same extraction is not worth
building.

| ID | Requirement | Stub | Reference |
|---|---|---|---|
| R3.1 | Topic tracker per series **and** per relationship: `category`, `sentiment`, lifecycle `status` (`active`/`recurring`/`resolved`/`stale`), `mention_count`, first/last mention. Full-text indexed. | S5 | `cos_relationship_topics`, `cos_prep_topic_mentions` |
| R3.2 | Forgotten commitments: open action items surfaced with urgency from due date, days pending, and surface count. | S13 | `cos_forgotten_commitments` |
| R3.3 | Natural-language query over a series' or relationship's own history, answering only from content the querying user may already read. Big-context prompt with caching, not embeddings (C3). | S7, S5 | `query-relationship-history` |
| R3.4 | Recurring-pattern detection and escalations: chronic overdue, stalled topics, missed cadence, commitment drift. Dismissible with suppression. | S5, S13 | `agent-escalation` |
| R3.5 | Remaining series types become available: skip-level, peer, stakeholder, external — each with its own expected cadence. | S1 | `cos_team_members.relationship_type` |
| R3.6 | Health signal per series and per relationship (reference: 0–10 from cadence, topic resolution, forgotten items, sentiment). **Definition and ownership unresolved**, and C2 is the harder constraint. | S9 | `relationship_health_score` |
| R3.7 | A rolling narrative summary per relationship and per series, maintained incrementally. The substrate for the delta +6 handover view. | S11 | `cos_relationship_documents` |

**Non-goals:** no cross-relationship pattern detection ("three ICs are all raising X") — a
population-level analytics capability with a materially different privacy posture, belonging to
Employee Engagement or a platform analytics service.

---

## 8. Phase 4 — Agentic follow-through

**Agent mode:** Act. **Gate:** legal review complete and signed off; per-tenant opt-in; never a
default (D-12).

| ID | Requirement | Stub | Reference |
|---|---|---|---|
| R4.1 | The agent monitors open action items approaching due dates and nudges the **assignee** on their preferred channel. Hard ceiling and quiet hours are part of the requirement (C10); timing adapts from feedback (C9). | S9, S12, S14 | `agent-tick` (2,151 lines, 30-min cron) |
| R4.2 | Briefs are pre-staged automatically ahead of calendar events without anyone opening the app. | S4 | `agent-tick.prestagePreps` |
| R4.3 | Messaging-platform interactivity: respond to a nudge, close an item, add an agenda item without opening the product. Route through **one** interactivity handler. | S12 | `agent-slack-action`; `/add-to-1on1` |
| R4.4 | Full activity feed and audit trail of every agent action — including actions *not* taken (rate-limit parks) — with human override on all of it. | S9 | `cos_agent_log`, `AgentActivityFeed.tsx` |
| R4.5 | Every Act-mode step declares a HITL trigger per Section 6. Per-capability toggles plus a single kill-switch. | S10 | `agent_config` |
| R4.6 | Act mode is entered through an explicit in-product opt-in prompt, not a settings page nobody visits. Declining sets a cooldown rather than re-asking. | S10 | `agent-tick` opt-in state machine, 14-day cooldown |

**The hard constraint:** R4.1 means the platform messages an employee about a commitment someone
else recorded — materially different from anything in Phases 1–3, and where reputational risk
concentrates. It should ship behind an explicit per-series opt-in, not just a tenant setting. **With
team meetings in scope this sharpens:** nudging one direct report is a management interaction;
nudging eight people about commitments captured in a staff meeting is a workflow system, and the
volume ceiling (C10) must be per-recipient, not per-series.

---

## 9. What this document changes in the existing spec

| Existing spec content | Disposition |
|---|---|
| "Feature scope" section | Superseded by §3, §6, §7, §8 — same content, sequenced and gated |
| "Differentiator analysis" | Retained as-is; still accurate and still `Hypothesis` |
| Scope note: "all recurring manager meetings" | **Now implemented rather than deferred.** Team meetings are Phase 1b, not a later phase |
| Open question: module rename | **Resolved** — "Recurring Meeting Management." Requires the coordinated PR named in §0.1 |
| `[Phase 5]` tag on agentic follow-through | **Inconsistent** — cites `composability-agent-governance.md`, which defines four *modes* and no numbered phases. Should read `[Act mode]` |
| Missing Section 3 standalone value proposition | Supplied in §3 |
| "Integration breadth via Stack One" | **Conflicts** with D-06's consequences, which name Kombo. Resolve before Phase 2; S12 makes the module indifferent meanwhile |
| "Integration layer" scope | **Tension with D-96**, which classifies 1-on-1s as *"Chrysalis-native (no integration surface)"*. Both can hold — D-96 is about not syncing meeting *records* with a competing tool, while this module reads *signals*. But delta +2 makes calendar a **Phase 1** read, which D-96 as written does not anticipate. State it explicitly so the decisions are not read as contradictory |

---

## 10. Open questions

- [ ] **Parity baseline verification** — §2.2 is compiled from public marketing. Verify against the
      monolith and correct. *Blocks Phase 1 scope sign-off.*
- [ ] **Manager note privacy** — R1.6 asserts private notes are permanently private, including from
      HR and post-offboarding. Confirm against legal and eDiscovery. *Blocks Phase 1.*
- [ ] **Two-sided consent (R1.13)** — the reference implementation's §13.9 gap. Confirm the
      participant-visibility model with Legal and a works-council reviewer before Phase 1 build.
      *Blocks Phase 1.*
- [ ] **Consistency tracking and works councils** — R1.10 is cadence surveillance of managers by HR;
      R1.20 adds attendance. Confirm posture in co-determination jurisdictions. *Blocks Phase 1 in EU.*
- [ ] **Series reassignment** — does the handover view (S11) require participant consent or
      notification? *Blocks Phase 1.*
- [ ] **Team-meeting history on join** — R1.16 defaults a new participant to history from their join
      date. Is that right, or should organizers grant full history? *Blocks Phase 1b.*
- [ ] **Retired-module disposition** — the Team Meetings tables still receive funnel writes with no
      removal decision recorded (§2.5, `SPECIFICATION.md` §13.7). If Phase 1b supersedes them,
      decide migrate-or-drop explicitly. *Blocks Phase 1b.*
- [ ] **D-96 reconciliation** — does "no integration surface" preclude the Phase 1 calendar read in
      delta +2? See §9. *Blocks Phase 1 if read strictly.*
- [ ] **Integration layer** — Kombo or StackOne? *Blocks Phase 2.*
- [ ] **Communication-history reading** — GDPR posture for R2.3, including the per-participant
      source-scoping problem for team briefs. *Blocks Phase 2 build.*
- [ ] **Which mining pipeline** — the reference runs two parallel extraction pipelines on different
      models writing to different tables. Choose one. *Blocks Phase 2.*
- [ ] **Do action items write to Trajectories?** Unresolved in the existing spec. *Blocks Phase 3.*
- [ ] **Health score** — inputs, weighting, and whether it is owned here or by Employee Engagement.
      *Blocks R3.6 only.*
- [ ] **NL query surface** — module-owned or a cross-module search service? *Blocks Phase 3.*
- [ ] **Talk-time and sentiment** — shipped in the reference with self-reflective-only framing
      (C2, C4). Not placed in any phase here. Recommend deferring past Phase 3 with its own legal
      review; highest-risk/lowest-necessity capability in the inventory, and multi-participant
      meetings make it considerably worse.
- [ ] **Personality assessment** — framework, vendor, IP, storage in the 360° record. Recommend
      deferring until Phase 3 validates that the memory layer is used at all.
- [ ] **Act-mode legal review** — required before Phase 4 build. *Blocks Phase 4.*

---

## 11. Recommended next actions

1. **Pull Project Helix / ClearInsights usage data for 1:1 Workspaces** (§2.4). Cheapest action with
   the largest effect on scope: it decides whether parity is a real requirement or a migration
   formality.
2. **Verify the §2.2 baseline table** against the legacy monolith and correct it.
3. **Circulate §1 (principles), §2.5 (the post-mortem), and §4 (stub register) for engineering
   review before any spec sections are written.** The stub register is the part with a deadline —
   its value is zero once Phase 1 schema is frozen. S14 and S18 in particular are free today.
4. **Resolve the four Phase-1-blocking open questions** — R1.13 consent, private-note permanence,
   consistency-tracking posture in co-determination jurisdictions, and series reassignment.
5. **Open the module-rename PR** (§0.1), since Phase 1b settles the question.
6. Only then fill in Sections 1–11 of the module spec, with §3 as Section 3's standalone value
   proposition and §6–8 as the Section 6 workflow phasing.
