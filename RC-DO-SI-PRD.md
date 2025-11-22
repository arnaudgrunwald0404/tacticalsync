# Product Requirements Document  
## Rallying Cry – Defining Objectives – Strategic Initiatives (RC–DO–SI)

**Version:** 0.9 (Draft)  
**Owner:** Arnaud / Product  
**Date:** H1 2026 cycle  
**Status:** Draft – to be iterated then locked by ELT

---

## 1. Executive Summary

Today, the leadership team runs the H1 2026 Rallying Cry and Defining Objectives in an Excel workbook that:

- Defines 3–5 **Defining Objectives (DOs)** (e.g., H1 2026: *Improve Customer Retention*, *Strengthen ICP Bookings Performance*, *Improve Product for Predictable Delivery and Scalability*, *Improve Operational Efficiency & Discipline*).  
- Breaks each DO into **Strategic Initiatives (SIs)** with success criteria, owners, and estimated completion dates.  
- Tracks **tasks** week by week, with statuses, owners, and a simple “pace vs. plan” check (On Track / At Risk / Off Track).

This works, but it’s brittle, opaque for the broader org, and disconnected from weekly execution (TacticalSync, priorities, etc.).

**Goal of this product:**  
Turn the RC–DO–SI framework into a **first-class module** that lives alongside (and connected to) the meeting/priority tooling, so that:

- Strategy is **explicit, visible, and owned**.
- Execution is **planned and tracked** at the SI level with clear metrics.
- Weekly work and priorities are **aligned with the Rallying Cry**.
- Leadership can see **progress and risk early**, not in hindsight.

We are not just digitizing the workbook. We’re creating a **lightweight strategy operating system** with a 6-month cadence.

---

## 2. Problem & Jobs To Be Done

### 2.1 Problems with the current spreadsheet approach

- Only a handful of people understand the structure; it’s easy to break formulas.
- No single source of truth for “what matters this half-year” across the org.
- Hard to see alignment (or misalignment) between **weekly priorities** and the Rallying Cry.
- Status updates are manual, late, and inconsistent.
- No workflow or permissions: anyone can break the file; ownership is implicit.

### 2.2 Core Jobs To Be Done

**JTBD 1 – Set a clear Rallying Cry for a period**  
When we start a half-year, the CEO/ELT needs to define a **single Rallying Cry** and 3–5 Defining Objectives so that everyone in the company understands what we’re optimizing for in H1/H2.

**JTBD 2 – Translate strategy into owned initiatives**  
When we align on the DOs, each ELT member needs to define **Strategic Initiatives** with success metrics, owners, and deadlines so that we know **who is doing what to move which outcome**.

**JTBD 3 – Cascade into planning and weekly priorities**  
When XLT/project owners plan their work, they need to break SIs into **tasks/milestones** and align their weekly priorities with the DO/SI so that execution is not random “busy work” but clearly tied to strategy.

**JTBD 4 – Monitor progress, pace, and risk**  
When we meet weekly/monthly at ELT/XLT, we need a clean view of **DO → SI → progress** with pace vs plan and flags (On Track / At Risk / Off Track) so we can intervene early, unblock, and reallocate.

**JTBD 5 – Communicate and socialize focus**  
When managers talk to their teams, they need a simple way to show “Here’s the Rallying Cry, here are the 3–4 things we’re pushing on this half-year, and here’s how our team contributes.”

---

## 3. Scope & Non-Goals

### In Scope (v1)

- Support a **6-month cycle** (H1, H2) with a single Rallying Cry per cycle.
- Create and manage **Defining Objectives** for the cycle.
- Create and manage **Strategic Initiatives** under each DO.
- Capture **success metrics** and **benchmarks** at DO and SI level.
- Assign **single owners**:
  - One ELT Executive Sponsor per DO.
  - One XLT Project Owner per SI.
- Track **status, pace, and completion** at DO and SI level.
- Provide a **dashboard view** equivalent to the current “Dashboard” sheet:
  - DO names, definitions, sponsor, % completion, pace indicator, SI list with owners and status.
- Provide a **detail view** equivalent to current DO sheets:
  - For each DO: list SIs, their metrics, owners, and milestones/tasks.
- Provide **draft / locked** states:
  - RC/DO/SI can be iterated on.
  - An admin “locks” the cycle when final.
- Basic **notifications** to SI owners to refresh status before recurring leadership meetings.
- **Integration point** to Meeting/TacticalSync module:
  - Ability to link weekly priorities to DO/SI.
  - Simple signal when a leader’s priorities are consistently misaligned with the DO/SI they own.

### Out of Scope (for v1)

- Weighting / scoring DOs or SIs (explicitly not needed).
- Complex project management (no Gantt, dependencies engine, etc).
- Automated integration to Aha!, Jira, etc. (can be future integration).
- Automated performance review tie-in (future).

---

## 4. Key Concepts & Data Model (Conceptual)

### 4.1 Rallying Cry (RC)

- **Definition:** A single, time-bound focus statement for the half-year (e.g., “H1 2026: Lower churn and strengthen ICP performance while preparing the platform to scale.”).
- **Fields (v1):**
  - Title
  - Cycle (e.g., H1 2026)
  - Description / narrative
  - Status: Draft, Locked, Archived

### 4.2 Defining Objective (DO)

- **Definition:** A major outcome that supports the Rallying Cry.  
  Examples from H1 2026 workbook:
  - DO1: Improve Customer Retention
  - DO2: Strengthen ICP Bookings Performance
  - DO3: Improve Product for Predictable Delivery & Scalability
  - DO4: Improve Operational Efficiency & Discipline Across the Company
- **Fields:**
  - Title
  - Description / success metric (e.g., “Reduce net revenue churn from 20% → 18% by 6/30/2026”)
  - Executive Sponsor (single ELT member)
  - Target completion date (end of cycle by default; can be earlier)
  - Rate of completion (% of underlying SI work completed)
  - Pace indicator (On Track / At Risk / Off Track; derived from SI status and time remaining)
  - Status notes (short free text)

### 4.3 Strategic Initiative (SI)

- **Definition:** A concrete, cross-functional initiative that materially moves a DO.
- **Fields:**
  - Title
  - Description
  - DO (parent)
  - SI Success Metric / Criteria
  - Benchmark / baseline (if applicable)
  - XLT Project Owner (single named leader)
  - Estimated completion date
  - Status: Not Started / On Track / At Risk / Off Track / Completed
  - % completion (manual or from tasks)
  - Notes / risks / decisions

### 4.4 Tasks / Milestones (Optional depth for v1)

- **Definition:** Key sub-units of an SI used to support status and pace.
- **Fields:**
  - Title
  - Owner
  - Due date (weekly granularity is fine)
  - Status (Not Started / In Progress / Completed / Blocked)
  - Completion criteria

> v1 requirement: We do NOT need 30 columns of dates like the spreadsheet. We need simple tasks/milestones with due dates so SI owners have enough structure to support a credible status.

---

## 5. Users & Personas

1. **CEO / ELT (Strategy owners)**
   - Define the Rallying Cry and DOs.
   - Need a clear, simple top-level view and narrative.
2. **XLT / Project Owners**
   - Own SIs.
   - Need a manageable list of initiatives with clear metrics.
   - Need a place to update status and track tasks.
3. **People Leaders**
   - Need to understand which DO/SI their team impacts.
   - Use the framework to set and align priorities.
4. **ICs / Wider Org**
   - Mostly consumers, not editors.
   - Need to see “what matters this half-year” and how current work ties in.

---

## 6. Core Use Cases & Requirements

### 6.1 Define and lock the Rallying Cry & DOs

**Use case:** At the beginning of H1/H2, CEO and ELT define the Rallying Cry and 3–5 DOs.

**Requirements:**

- Ability to create a **Cycle** (H1 2026) and associate a Rallying Cry.
- Ability to add 3–5 DOs with:
  - Title
  - Success metric (free text + optional numeric fields)
  - Executive Sponsor (single select)
  - Target completion date (default: end of cycle).
- **Draft mode**:
  - Anyone with the right role (ELT) can edit RC and DOs while in Draft.
  - Once final, an Admin/CEO clicks **Lock Cycle**:
    - RC and DO titles/descriptions become read-only (except for explicit “unlock” action).
- View that shows the full set of DOs side by side (similar to the Dashboard sheet).

### 6.2 Define Strategic Initiatives under each DO

**Use case:** ELT/XLT define SIs for a DO, each with an owner and clear outcomes.

**Requirements:**

- From a DO detail page, ability to **add SIs**.
- Each SI must have:
  - Title
  - Description
  - SI success metric (text, plus optional numeric target)
  - XLT Project Owner (single owner, required)
  - Estimated completion date
  - Initial status (Not Started / On Track / At Risk / Off Track)
- Allow **3–7 SIs per DO** in practice, but not hard-limit (soft guidance).
- DO completion metric:
  - Option 1 (v1): simple average of SI % completion.
  - Option 2 (later): mark some SIs as “critical” but no weighting for now.

### 6.3 Plan and track tasks/milestones per SI

**Use case:** XLT owner / project owner plans key milestones and uses them for status updates.

**Requirements:**

- From an SI detail page, ability to **add tasks/milestones**:
  - Title, owner, due date, status, completion criteria.
- Simple **progress indicator**:
  - e.g., % tasks completed.
  - SI % completion can default to % tasks done, but owner can override with a manual value and note.
- Optional: quick “Add next milestone” shortcut to encourage owners to maintain forward-looking tasks.

### 6.4 Dashboard – RC / DO / SI overview

**Use case:** During ELT meetings, we want a high-level view that replaces the Excel “Dashboard” sheet.

**Requirements:**

- **Cycle summary view**:
  - Rallying Cry at the top (title + one-line description).
  - Cards for each DO:
    - DO title
    - Executive Sponsor
    - DO success metric summary
    - DO % completion
    - Pace indicator (🟢 On Track / 🟡 At Risk / 🔴 Off Track)
    - Count of SIs and their statuses (e.g., 3 On Track, 1 At Risk, 0 Off Track).
- Ability to **expand a DO** to see its SIs:
  - SI title
  - SI owner
  - SI status
  - ETA
  - % completion
- Filters:
  - By Executive Sponsor
  - By Status (show only At Risk/Off Track)
- Export / share:
  - Export to PDF, or shareable link for board / wider leadership.

### 6.5 Status & pace tracking

**Use case:** Before each leadership meeting, owners update statuses; we need to see if we’re ahead/behind.

**Requirements:**

- Each SI has:
  - Status (manual set).
  - % completion.
- System should compute **pace check**:
  - Simple rule: if current date is > X% of cycle duration, and SI % completion is < X − threshold, flag as “At Risk”.
  - Example: At halfway (50% of time elapsed), an SI with 10% completion should be flagged At Risk by default.
- DO pace:
  - Aggregated from SIs; if any critical SI is At Risk/Off Track, DO is at least At Risk.

### 6.6 Meeting integration (RCDO ↔ TacticalSync)

**Use case:** When leaders prepare weekly Tactical/Department meetings, their top 3 priorities should map to DO/SI where possible.

**Requirements (v1):**

- In the Meeting / TacticalSync module:
  - Allow each weekly **priority** to be linked to a DO or SI (optional but encouraged).
- Provide a **lightweight signal**:
  - If a DO owner’s priorities have not referenced any of their DO’s SIs for N consecutive weeks, show:
    - “Heads up: None of this week’s priorities are linked to your DO ‘Improve Customer Retention’. Consider aligning or adjusting DO/SIs.”
- Do NOT block the user; this is advisory.

### 6.7 Permissions & governance

**Requirements:**

- **Roles (minimum v1):**
  - Admin: can create cycles, lock/unlock RC and DOs, manage permissions.
  - ELT: can propose/edit DOs and SIs assigned to them until locked; can edit status fields later.
  - XLT / SI Owner: can edit SIs they own; update tasks, status, and notes.
  - Viewer: read-only access.
- Changes to RC and DOs after lock require explicit **“unlock RC–DO”** action with audit trail.

### 6.8 Notifications and rhythm

**Requirements:**

- Ability to configure a **weekly reminder**:
  - Before ELT/XLT meeting, notify SI owners: “Please update status for your SIs by [time].”
- Optional future: monthly “H1 2026 Rallying Cry update” digest summarizing progress.

---

## 7. AI / LLM Assist (v1 ideas to include)

The framework is structured and repetitive; LLMs can reduce friction and increase quality.

**Capabilities (at least exploratory in v1):**

1. **Draft DOs and SIs from narrative**
   - Input: ELT meeting notes or a simple prompt like “H1 2026: We want to reduce churn, improve ICP bookings, and harden the platform.”
   - Output: suggested DOs and SIs with candidate metrics and owners (user edits before saving).

2. **Suggest metrics & benchmarks**
   - Given a DO/SI title, propose:
     - 1–2 clear outcome metrics.
     - Suggested targets / benchmarks based on past data (if connected) or typical % change.

3. **Status update assistant**
   - For an SI, given:
     - Task statuses
     - Recent meeting notes / TacticalSync items linked to it
   - Suggest:
     - A status (On Track / At Risk)
     - % completion
     - Short narrative for “what happened this week / what’s next / risks”.

4. **Alignment checker with meetings**
   - Review weekly priorities from TacticalSync:
     - If they don’t reference any DO/SI the leader owns, propose:
       - “Possible alignment: this priority looks related to DO3 (‘Improve Product for Predictable Delivery & Scalability’). Link it?”

> These AI features should always be **assistive, not authoritative**. Human owners make final calls.

---

## 8. Success Metrics (for the product)

How we’ll know this is working:

- **Coverage:**
  - 100% of cycles (H1, H2) use the RC–DO–SI module instead of Excel.
  - 3–5 DOs per cycle, each with at least 3 SIs defined in the tool.
- **Engagement:**
  - ≥ 80% of SIs have updated status in the last 2 weeks.
  - ≥ 70% of weekly leadership meetings reference the RC–DO–SI module.
- **Alignment:**
  - ≥ 60% of weekly priorities in TacticalSync are linked to DO/SI after 3 months.
- **Perceived value (qualitative):**
  - ELT/XLT feedback: “It’s easier to see what matters and whether we’re on track.”
  - Fewer ad-hoc “what are our priorities again?” conversations.

---

## 9. Open Questions

- How strongly do we want to enforce the 6-month cadence (hard-coded H1/H2 vs flexible period definitions)?
- Do we want task-level planning in v1 or rely on integration with Aha/Jira for “real” project plans?
- Do we need per-DO/ per-SI numeric targets as structured fields right away, or is narrative metric description enough?
- How public should RC–DO–SI be internally?  
  - ELT/XLT only, or full company read access?
- How much historical data do we need?  
  - Do we keep and display past cycles (e.g., H2 2025) for comparison?
