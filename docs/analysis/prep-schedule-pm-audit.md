# Settings › Prep schedule — Product Analysis & Target State

**Author:** Product analysis (Claude)
**Date:** 2026-06-19
**Scope:** `Settings › Prep schedule` panel only (`src/components/cos/CosPrepSchedulePanel.tsx`)
**Status:** Analysis + agreed target-state direction. No code changes.

---

## 1. Why this analysis exists

The Prep schedule panel was built organically as features were added one at a
time. It now reads as "messy." This document audits what's actually there, names
the root problems, and lays out the target state we aligned on: splitting the
screen into **two parallel, sibling products** and extending the prep product
with richer meeting-inclusion and data-source models.

---

## 2. What this surface actually is today

The page is titled **"Prep schedule"** and described in `Settings.tsx:2723-2726`
as *"Automatically generate 1:1 prep briefs each morning."* But the single panel
contains **two distinct products** sharing one screen and one database row
(`cos_prep_schedule`):

| | **Product A (named)** | **Product B (hidden)** |
|---|---|---|
| What | 1:1 prep briefs | Daily Check-In (DCI) — action-item discovery |
| When | Each morning | Throughout day / end-of-day |
| Delivery | In-app brief | Slack DM |
| Enable flag | `enabled` | `dci_enabled` |
| Status fields | `last_run_*` (shown) | `dci_last_run_*` (**never shown**) |

The page title, description, and four of the five cards describe only Product A.
Product B is collapsed behind one toggle in card 4 (`CosPrepSchedulePanel.tsx:430-525`).

---

## 3. Feature inventory (as built)

Five cards plus a shared action bar:

1. **Auto-generate schedule** — enable toggle, run-time picker, last-run line (`:254-301`)
2. **Meeting inclusion rules** — "always include" name list; max-other-attendees 0–5 (`:303-360`)
3. **Pre-sync integrations** — Zoom sync, Slack sync, StackOne enrich, Slack channels (`:362-428`)
4. **Daily Check-In (DCI)** — enable; then data-source pills, focus instructions, IANA timezone, Slack-DM toggle, Slack member ID (`:430-525`)
5. **Run history** — last 20 `cos_prep_batch_log` rows (`:539-620`)
6. **Action bar** — "Save schedule" + "Run now" (`:527-536`)

---

## 4. Problems (the core of the audit)

**a) Two products in one box (root cause).** Independent features — different
jobs, schedules, and delivery channels — are presented as one "schedule." This is
the source of most of the confusion below.

**b) The action bar lies about scope.** "Run now" (`:186-217`) only invokes
`daily-prep-batch` — it does **not** run DCI (`generate-dci-brief`). Enable DCI,
click "Run now," and you get prep briefs, not a check-in, with no explanation.

**c) DCI status is invisible.** The panel shows `last_run_*` for prep but never
loads or displays DCI's own `dci_last_run_at` / `dci_last_run_status` columns.
Users can't tell whether DCI ran or failed.

**d) Broken, inconsistent time model.** Prep stores `run_hour_utc` (a fixed UTC
hour, no timezone) but labels it "Run at (local time)" — so the scheduled time
silently drifts an hour at DST boundaries and the label is dishonest. DCI, by
contrast, has a correct IANA `timezone` field. Two abstractions for "when," one
broken.

**e) Opaque inclusion logic.** "Max other attendees (after removing above)" with
a 0–5 numeric input is hard to reason about. Users can't see *which* meetings
will actually qualify.

**f) Config duplicated across three screens.** The same settings are editable in
the panel, the onboarding wizard (`PrepSetupWizard.tsx`), and the dashboard
banner (`DciBriefSetupBanner.tsx`), each with its own copy of the read/save and
time-conversion logic. They drift and behave inconsistently — a direct
contributor to the "messy" feel.

**g) Terminology drift.** "Prep briefs" vs DCI "brief" (both "brief"); "Pre-sync
integrations" (coarse on/off) vs DCI "Data sources" (granular pills) for
overlapping concepts (Zoom/Slack).

**h) Technical debt with product impact.** Repeated `(supabase as any)` casts
(`:99-152`) because the tables aren't typed; no validation of the free-text IANA
timezone or Slack channel/member inputs; UI + persistence + job orchestration all
mixed in one component.

---

## 5. Target state (agreed direction)

Split the panel into **two parallel products** with mirrored design and layout,
so knowledge transfers between them and neither is buried inside the other.

### Product A — Recurring Meeting Prep *(rename of "1:1 Prep briefs")*

Meeting inclusion becomes explicit and transparent rather than a numeric threshold:

- **Recurring 1:1s** — auto-included; shown as a **preview** list (transparency, no action needed).
- **One-off 1:1s** — included by default and flagged **high-value**: often the
  meetings that deserve the most prep (new person, most context to gather).
- **Recurring meetings with >2 attendees** — presented as an **opt-in list**; the
  user picks which to include. Replaces today's opaque `max_others_after_exclude`.

**Two-tier data sources (new capability):**
- **Global default toolset** applied to every meeting — e.g. Zoom, Gmail, Slack.
- **Per-meeting tool overrides** — e.g. Salesforce only on the Head-of-Sales 1:1.

> **Open design question (for you):** how should a per-meeting tool be assigned?
> - **(a) Per-row control** — a "tools" picker on each meeting in the inclusion list. Direct and visual; tedious at scale.
> - **(b) Rule-based** — "if attendee/title matches X, attach tool Y." Scales well; less obvious.
> A hybrid (sensible default rules + per-meeting override) is likely best, but this is your call.

### Product B — My Daily Brief *(rename of "Daily Check-In / DCI")*

- Built **in parallel** with Product A — mirrored card layout and controls so the
  two read as siblings.
- **Own "Run now"** and **own "Last run"/history**, surfacing the existing
  `dci_last_run_*` columns that are invisible today.

### Cross-cutting (both products)

- **Truthful actions & status per feature** — each product owns its own trigger
  and history; no shared button that secretly runs only one.
- **Unified time model** — both use a real IANA `timezone` (reuse DCI's field);
  retire the fixed `run_hour_utc` so schedules are DST-correct and labels honest.
- **Terminology + validation pass** — consistent "brief" naming, align
  "sources"/"pre-sync," validate timezone & Slack inputs, type the tables.
- **(P1, maintainability) one source of truth for config** — extract the
  read/save/convert logic into a shared hook (e.g. `usePrepScheduleConfig()`)
  that the panel, wizard, and banner all call. Fix once, consistent everywhere.
  Not user-facing, but it's what stops the mess from returning.

---

## 6. Priority & effort

| # | Change | Impact | Effort | Priority |
|---|--------|--------|--------|----------|
| 1 | Split into two sibling products (A & B) | High | Med | **P0** |
| 2 | Truthful per-feature Run now + history (surface `dci_last_run_*`) | High | Low–Med | **P0** |
| 3 | New inclusion model (recurring preview, one-off high-value, >2-attendee opt-in) | High | Med–High | **P1** |
| 4 | Two-tier data sources (global + per-meeting) | High | High | **P1** |
| 5 | Unified IANA timezone, retire `run_hour_utc` | Med | Low | **P1** |
| 6 | Terminology + input validation | Med | Low | **P2** |
| 7 | Shared config hook (de-duplicate 3 screens) | Med (internal) | Med | **P1** |

---

## 7. Target information architecture (sketch)

```
Settings › Chief of Staff
├── Recurring Meeting Prep            ← Product A
│   ├── Meetings to prep
│   │   ├── Recurring 1:1s            (auto, preview list)
│   │   ├── One-off 1:1s              (auto, "high-value" flag)
│   │   └── Group meetings (>2)       (opt-in list)
│   ├── Data sources
│   │   ├── Default tools             (Zoom, Gmail, Slack…)
│   │   └── Per-meeting overrides     (e.g. Salesforce → Head of Sales)
│   ├── Schedule                      (time + IANA timezone)
│   └── Run now · Last run / history
│
└── My Daily Brief                    ← Product B (mirrored layout)
    ├── What to scan                  (data sources)
    ├── Focus instructions
    ├── Delivery                      (Slack DM)
    ├── Schedule                      (time + IANA timezone)
    └── Run now · Last run / history
```

---

## 8. Evidence / file references

- `src/components/cos/CosPrepSchedulePanel.tsx` — the panel analyzed (line refs throughout).
- `src/pages/Settings.tsx:2720-2729` — title/description + mount point (title/scope mismatch).
- `src/components/ui/settings-navbar.tsx:18-20` — nav entry, "Chief of Staff" group.
- `src/components/cos/PrepSetupWizard.tsx`, `DciBriefSetupBanner.tsx` — duplicate config surfaces (problem **f**).
- `supabase/migrations/20260612200000`, `…200100`, `20260614000000`, `20260626000000`, `20260702000000` — the organic schema accretion behind one row.
