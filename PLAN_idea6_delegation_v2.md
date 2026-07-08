# Plan — Idea #6: Delegation v2 (from planning to doing)

Status: **DRAFT — plan only, no code written.** Requires human approval before implementation begins.

## 1. Problem recap

`delegate-inbox-task` (`supabase/functions/delegate-inbox-task/index.ts`) runs a state machine:

```
ramping_up → clarifying? → planning → getting_it_done → seeking_approval → (dead end)
```

Reading the current code closely:

- `rampUp()` (~line 95) checks task clarity via Claude, either goes straight to `planPhase` or asks clarifying questions.
- `receiveAnswer()` (~line 137) advances through queued questions, then calls `planPhase`.
- `planPhase()` (~line 170) does three things in one shot, with no real gap between them:
  1. Calls Claude for a markdown plan, immediately writes `status: 'getting_it_done'` (line 189) — but this is a **label with no behavior**. No tool runs, nothing external happens.
  2. Immediately (same function, no await on human input) calls Claude again for a 2-3 sentence `approval_summary` and writes `status: 'seeking_approval'` (line 198).
  3. Appends that summary to `inbox_items.body` (lines 200-209).
- `done` / `cancelled` are declared in the DB CHECK constraint (`supabase/migrations/20260713000003_inbox_delegations.sql`) and in the `DelegationStatus` TS union (`src/hooks/useInboxDelegation.ts`) but **no code path ever sets them** except the frontend's `approve()` (line 116-122 of `useInboxDelegation.ts`), which does a direct Supabase update to `status: 'done'` — it doesn't call the edge function at all, and it doesn't distinguish "approve the whole plan" from "approve step 3 of 5."

So today, "seeking_approval" isn't really approval-gating an action — it's approving a *summary of an action that was never taken*. The `getting_it_done` status is emitted but nothing happens while it's set (no tool calls, no external side effects). This is the exact gap the idea targets.

On the frontend: there is no `DelegationStatusPanel.tsx` in this codebase (only `src/components/inbox/DelegationStatusRow.tsx` — the idea doc's file name appears to be aspirational/incorrect; this plan corrects the file list accordingly). `DelegationStatusRow.tsx` renders a single "Approve" button (line 163-170) that calls `onApprove`, which is wired straight to `useInboxDelegation.approve()` — an unconditional `status → done` write with no server round-trip, no record of *what* was approved, and no per-step granularity.

## 2. Tool-call framework design

### 2.1 Core idea

Replace the single opaque `plan` (markdown text) with a **structured plan**: an ordered array of typed steps, each naming a tool + params. The agent still narrates in markdown for human readability, but the executable contract is the structured array. Each step carries its own approval and execution status, so a user can approve/reject/edit individual steps rather than an all-or-nothing plan.

### 2.2 New data shape — `plan_steps` (replaces free-text-only `plan`)

Add a new jsonb column `plan_steps` to `inbox_delegations` (keep `plan` as the human-readable markdown rendering, generated from `plan_steps`, for backward compatibility with existing UI/rows).

```ts
type ToolName = 'draft_email' | 'create_meeting_topic' | 'post_slack_update' | 'schedule_checkin';

interface PlanStep {
  id: string;                 // stable uuid, generated at plan time
  order: number;
  tool: ToolName;
  description: string;        // human-readable summary, shown to the approver
  params: Record<string, unknown>;  // tool-specific, validated by a per-tool zod schema
  status: 'proposed' | 'approved' | 'rejected' | 'running' | 'succeeded' | 'failed' | 'skipped';
  result?: unknown;           // tool-specific output (e.g. draft id, topic id, message ts)
  error?: string;
  approved_by?: string;       // user_id
  approved_at?: string;       // ISO timestamp
  executed_at?: string;
  idempotency_key: string;    // see §5
}
```

### 2.3 Tool registry (server-side, in the edge function)

Each tool is a discrete module with the same interface:

```ts
interface Tool<Params> {
  name: ToolName;
  paramsSchema: z.ZodType<Params>;          // validates agent-produced params before showing to user
  describe(params: Params): string;          // human-readable one-liner for the approval UI
  execute(db, ctx, params: Params): Promise<{ result: unknown }>; // the actual side effect
  isAlreadyDone(db, ctx, step: PlanStep): Promise<boolean>;       // idempotency check, see §5
}
```

The planning prompt to Claude is changed from "draft a numbered markdown action plan" to: "produce a JSON array of steps, each `{ tool, description, params }`, using only the following tool definitions: <tool schemas>." Output is parsed and validated against each tool's `paramsSchema` before being persisted — invalid tool calls are dropped with a logged warning rather than silently accepted (mirrors the existing `try/catch JSON.parse` → fallback pattern already used in `rampUp()`).

### 2.4 State machine changes

```
ramping_up → clarifying? → planning → seeking_approval (per-step) → getting_it_done → done
                                                                  ↘ (partial failure) → seeking_approval (retry) | cancelled
```

Key change: **`seeking_approval` now happens before execution, not after**, and it's granted per-step, not per-plan. `getting_it_done` becomes real — it executes only steps whose status is `approved`, in `order`.

New request actions on `delegate-inbox-task`:

- `{ action: 'approve_step', delegation_id, step_id }` — human approves one step; server flips `plan_steps[i].status → 'approved'`, stamps `approved_by`/`approved_at`, then immediately attempts execution of that step (transition to `getting_it_done` if not already there).
- `{ action: 'reject_step', delegation_id, step_id }` — flips to `'rejected'`; skipped at execution time.
- `{ action: 'approve_all', delegation_id }` — convenience bulk action, internally loops `approve_step` semantics.
- Existing `{ action: 'answer', ... }` unchanged.
- Remove the frontend's direct `status → 'done'` write in `useInboxDelegation.approve()`; replace with a call to the edge function so the audit trail (§5) is always server-authored.

Overall delegation `status` still exists for the coarse-grained UI badge, but its meaning shifts:
- `seeking_approval`: at least one step is `proposed` and awaiting a decision.
- `getting_it_done`: at least one step is `approved`/`running`, none still `proposed`.
- `done`: all steps are `succeeded`, `rejected`, or `skipped` (i.e., nothing left to do).
- New: keep `cancelled` for user-initiated full abort (already exists, just needs a code path — e.g. a `{ action: 'cancel' }` request).

### 2.5 Frontend changes

`src/hooks/useInboxDelegation.ts`:
- Extend `Delegation` interface with `plan_steps: PlanStep[]`.
- Replace `approve()` with `approveStep(stepId)`, `rejectStep(stepId)`, `approveAll()` — each POSTs to the edge function instead of writing Supabase directly.
- Keep realtime subscription as-is (already listens to the whole row, `plan_steps` updates will flow through unchanged).

`src/components/inbox/DelegationStatusRow.tsx`:
- Replace the single "Approve" button (currently gated on `delegation.status === 'seeking_approval'`) with a per-step list: each `PlanStep` renders `description`, a tool-type icon/badge, and "Approve"/"Reject" buttons when `status === 'proposed'`, or a status icon (spinner/check/x) once decided.
- The existing `DelegationDetail` expand panel already renders `delegation.plan` as markdown — keep that as the "narrative view" but add a structured step list above it (this is the "Approve & Execute" surface the idea's task description asks for).
- Label change: "Approve" button copy becomes "Approve & Execute" per-step to make the causality explicit to the user (approving now triggers a real side effect, not just an unlock).

## 3. Mapping the 4 example actions to existing capability

| Tool | Existing capability in this codebase | Verdict |
|---|---|---|
| **Draft a follow-up email** | No general-purpose "compose and send/draft an arbitrary email" service exists. `supabase/functions/send-invitation-email/index.ts` and `send-admin-granted-email/index.ts` call the Resend API directly (`RESEND_API_KEY` env var, `fetch('https://api.resend.com/emails', ...)`), but both are single-purpose, hardcoded-template transactional senders (invite/admin-grant), not reusable for arbitrary agent-drafted content. There is no `agent-draft-email` or similar function, no email drafts table, and no email-sending Deno module intended for reuse. | **Buildable, but needs new infra**: a generic `send-agent-email` (or extend Resend usage) edge function/module, plus decide on "draft" semantics — since Resend has no native "save as draft, user reviews later, then send" concept, "draft" likely means: agent composes the email body, human reviews/edits *inside our own UI* (not an actual email-provider draft), and clicking approve triggers the send via Resend. This is more net-new work than the doc's premise assumed. |
| **Create a meeting topic** | Yes — `meeting_instance_topics` table exists (`supabase/migrations/20251017001000_create_tables.sql`), columns: `instance_id, title, notes, assigned_to, time_minutes, order_index, created_by`. Existing hooks (`src/hooks/useMeetingRealtime.ts`, `useMeetingRealtimeWithNotifications.ts`) already subscribe to this table's realtime changes, so inserts will show up live in the meeting UI without extra work. Similar tables (`meeting_series_agenda`) exist for recurring series-level agenda items. | **Easiest — capability already exists.** The tool just needs to resolve which `instance_id` (or `series_id`) to attach to (likely: "next occurrence of the team's meeting series," needs a small resolver) and insert a row. |
| **Post a Slack update** | Outgoing `chat.postMessage` calls already exist in `supabase/functions/agent-command/index.ts` (line ~127), `agent-tick`, `generate-dci-brief`, `generate-1on1-prep` — all follow the same pattern: look up `user_slack_credentials.access_token` for the user, POST to `https://slack.com/api/chat.postMessage`. `agent-slack-action/index.ts` is the *inbound* interactive-button handler (Slack → us), not outbound — the idea doc's suggestion that this could be reused is only half right; the outbound half already exists elsewhere and should be reused/refactored into a shared helper instead. Does **not** depend on idea #5's Slack surface work — outbound posting is already independently proven in production code paths. | **Second-easiest.** Extract the existing `chat.postMessage` pattern (from `agent-command/index.ts`) into a shared `postSlackMessage(db, userId, text, channel?)` helper reusable by the new tool, rather than depending on unshipped idea #5 work. |
| **Schedule a check-in** | Ambiguous term — codebase has `rc_checkins` (`supabase/migrations/20251112000000_create_rcdo_tables.sql`), but that table records a check-in that **already happened** (`summary`, `blockers`, `next_steps`, `sentiment`, `date` defaulting to `CURRENT_DATE`) against an RCDO `parent_type`/`parent_id` (DO or Initiative) — it is not a "future reminder" or calendar entity. There is no table for a *scheduled future* check-in reminder outside of the RCDO domain, and inbox items aren't currently linked to `rc_defining_objectives`/`rc_strategic_initiatives` at all. | **Hardest / most ambiguous.** Two sub-options: (a) narrow scope to "schedule a check-in **within RCDO**" by creating a future-dated placeholder/reminder tied to a DO/SI — needs new schema (a `scheduled_for` nullable column on `rc_checkins`, or a new lightweight `inbox_reminders` table) and a linking step from the inbox item to an RC DO/SI (via existing `rc_links` table, which already supports linking arbitrary refs to a DO/Initiative — see `rc_links.kind`/`ref_id` in `20251112000000_create_rcdo_tables.sql`); or (b) redefine "check-in" generically as a follow-up reminder unrelated to RCDO, which is simpler schema-wise (one new table) but a bigger product/scope decision, not just an engineering one. **Recommend deferring a final decision to the scoping conversation in §6** — flagged as a hard dependency below. |

## 4. Files to change / create, and hard dependencies

### New files
- `supabase/functions/delegate-inbox-task/tools/types.ts` — `Tool<Params>` interface, `ToolName` union, `PlanStep` type.
- `supabase/functions/delegate-inbox-task/tools/createMeetingTopic.ts` — inserts into `meeting_instance_topics`.
- `supabase/functions/delegate-inbox-task/tools/postSlackUpdate.ts` — extracts/reuses the `chat.postMessage` pattern from `agent-command/index.ts`.
- `supabase/functions/delegate-inbox-task/tools/draftEmail.ts` — **new infra required**, see §3/§6.
- `supabase/functions/delegate-inbox-task/tools/scheduleCheckin.ts` — **schema decision required first**, see §3/§6.
- `supabase/functions/delegate-inbox-task/tools/index.ts` — tool registry keyed by `ToolName`.
- `supabase/migrations/2026XXXXXXXXXX_inbox_delegation_plan_steps.sql` — adds `plan_steps jsonb NOT NULL DEFAULT '[]'` and `idempotency` tracking (see §5) to `inbox_delegations`.
- `supabase/migrations/2026XXXXXXXXXX_delegation_action_audit_log.sql` — new `inbox_delegation_audit_log` table (see §5).
- (Conditional, only if email tool proceeds) `supabase/migrations/2026XXXXXXXXXX_agent_email_drafts.sql`.
- (Conditional, only if check-in tool proceeds with new schema) `supabase/migrations/2026XXXXXXXXXX_inbox_scheduled_checkins.sql` or a `scheduled_for` column added to `rc_checkins`.
- `src/components/inbox/DelegationApprovalIntro.tsx` — first-run explainer banner (see §9.1).
- `src/components/inbox/PlanStepBadge.tsx` — persistent per-step type badge, incl. "Draft only" (see §9.2).
- `src/components/inbox/DelegationWhatsNewBanner.tsx` — fallback changelog surface if no existing what's-new mechanism is found (see §9.3).
- `src/lib/delegationCopy.ts` — tool-specific tooltip copy templates and `describeStepOutcome()` plain-language audit formatter (see §9.2, §9.4).

### Modified files
- `supabase/functions/delegate-inbox-task/index.ts` — rewrite `planPhase()` to emit `plan_steps` via structured Claude output; implement `getting_it_done` to actually call `tools/index.ts` executors; add `approve_step`/`reject_step`/`approve_all`/`cancel` request handling; write audit log rows on every state transition.
- `src/lib/inboxValidation.ts` — extend `delegationRequestSchema` discriminated union with the new action types (mirrors the edge function's hand-kept-in-sync copy, per the existing comment convention in that file).
- `src/hooks/useInboxDelegation.ts` — add `plan_steps` to `Delegation`, replace `approve()` with `approveStep`/`rejectStep`/`approveAll`, add `cancel()`.
- `src/components/inbox/DelegationStatusRow.tsx` — per-step approval UI (see §2.5).
- `src/types/inbox.ts` — if `PlanStep`/`ToolName` types need to be shared with non-hook consumers.
- Test files: `src/test/lib/inboxValidation.test.ts` (extend), plus new unit tests for each tool module and the plan-step reducer logic; new e2e spec under `e2e/` for the approve-and-execute flow (pattern-match existing e2e/rcdo structure).

### Hard dependencies flagged
1. **Email sending is not generically available.** Resend is wired for two hardcoded transactional templates only. Shipping `draft_email` requires either (a) generalizing the existing Resend integration into a reusable send function, or (b) explicitly limiting v1 to "draft only, human copies text and sends manually via their own email client" (no send integration at all) — which sidesteps the infra gap entirely and is worth considering as the true v1 for this tool.
2. **"Schedule a check-in" has no clear schema target.** `rc_checkins` records completed check-ins, not future ones, and inbox items have no existing link to RCDO entities. This needs a product decision (RCDO-scoped vs. generic reminder) before any migration is written.
3. **Slack tool has no hard blocker** — contrary to the idea doc's assumption, it does **not** need to wait on idea #5; outbound posting infrastructure already exists and just needs extraction into a shared helper.
4. **Meeting topic tool has no hard blocker** — schema and realtime plumbing already exist.

## 5. Risks

### 5.1 Idempotency (approved action executed twice)
Causes: user double-clicks "Approve & Execute"; realtime re-render fires a duplicate handler; edge function retried by a flaky network client; Supabase function cold-start retry.

Mitigations:
- Each `PlanStep` gets a server-generated `idempotency_key` (uuid) at plan-creation time, stored in `plan_steps[i].idempotency_key`.
- Before executing, the tool's `isAlreadyDone(db, ctx, step)` check runs first — e.g. for `create_meeting_topic`, check whether a `meeting_instance_topics` row already exists with a `notes` field tagged with that idempotency key (requires storing the key somewhere queryable — e.g. a hidden marker appended to `notes`, or a new `source_idempotency_key` column on the target tables where feasible); for `post_slack_update`, Slack's own `chat.postMessage` has no idempotency support, so dedupe must happen entirely on our side via a `DELEGATION_EXECUTED_STEPS` guard: flip `plan_steps[i].status → 'running'` in the same DB transaction/update that reads current status, using an optimistic-concurrency check (`WHERE plan_steps @> '[{"id": "...", "status": "approved"}]'`) so two concurrent requests can't both observe `'approved'` and both execute.
- The `approve_step` handler should be effectively a single atomic `UPDATE ... WHERE` (status transition guarded in the SQL predicate), not a read-then-write from application code, to close the race window.

### 5.2 Partial failure mid-plan
Some steps succeed, one fails (e.g., Slack token expired, meeting instance no longer exists because the meeting got cancelled).

Mitigations:
- Steps execute independently and update their own `status`/`error` — a failure in step 3 must not roll back or block already-succeeded steps 1-2 (no cross-step transaction; each tool call is its own unit).
- Delegation-level `status` reflects the aggregate: define a rule such as "if any step is `failed`, overall status stays `getting_it_done` (not `done`) until the human either retries or explicitly dismisses/skips the failed step" — never silently mark the whole delegation `done` when a step failed.
- Add a `retry_step` action (or reuse `approve_step` on a `failed` step, transitioning it back to `approved` and re-running) so a transient failure (e.g., expired Slack token) doesn't require restarting the whole delegation.
- Surface step-level errors in `DelegationStatusRow` (e.g., red icon + `error` message + a "Retry" button) rather than only surfacing failures in the aggregate `agent_log`.

### 5.3 Audit trail (who approved what, when)
Currently: the frontend's `approve()` does a bare client-side Supabase update with no record of *who* clicked approve beyond RLS's implicit `auth.uid()` — and it approves a *summary*, not a specific action.

Mitigations:
- New `inbox_delegation_audit_log` table: `id, delegation_id, step_id, action (approved|rejected|executed|failed), actor_user_id, created_at, metadata jsonb`. Every state transition in the edge function writes a row here — this is separate from `agent_log` (which is agent narration for the user) and from `plan_steps[i].approved_by/approved_at` (which is the denormalized "current state" convenience copy). The audit log is the append-only source of truth; `plan_steps` is the queryable current-state projection.
- RLS on the audit log: read-only for the owning user, insert-only via the service-role edge function (no client-side inserts), matching the trust model already used for `inbox_delegations` itself.
- Since every external action (Slack message, meeting topic, email) is inherently attributable to "the agent acting on behalf of user X," the audit log combined with `plan_steps[i].result` (e.g., the Slack message timestamp, the created topic's row id) gives a full "what actually happened, on whose approval" trail — important given these actions are irreversible in the real world (a sent Slack message can't be unsent).

## 6. Recommended starting scope (validated against actual infra)

The idea doc suggests starting with **email drafts + meeting-topic creation**. Based on the infra audit in §3, this ordering is **not** the easiest path — email has the largest infra gap (no reusable send capability, ambiguous "draft" semantics), while meeting-topic creation and Slack posting both have existing, working plumbing to build on.

**Recommended reordering:**

1. **Create meeting topic** — ships first. Zero new infra; existing table + existing realtime subscriptions mean the UI updates "for free" once the row is inserted.
2. **Post Slack update** — ships second. Existing `chat.postMessage` pattern just needs extraction into a shared, reusable helper; existing `user_slack_credentials` lookup is already proven in three other functions.
3. **Draft email** — ships third, and only after answering the scope question in §4.1 (true send vs. draft-for-manual-send). Recommend shipping the narrower "draft only, no send" version first to avoid building new Resend-based send infra under time pressure.
4. **Schedule check-in** — ships last, blocked on the product decision in §4.2 (RCDO-scoped vs. generic reminder). This is as much a scoping conversation as an engineering task.

This reordering should be confirmed with the idea's original author before implementation — the "start with email" instinct may reflect a belief that email infra already existed, which it does not.

## 7. Incremental steps and effort estimates

Total: **7.5-9 weeks**, sequenced to de-risk the framework first, then add tools one at a time (each independently shippable/flaggable). Onboarding/education work (step 8, §9) is not bolted on at the end — its copy and touchpoints ship alongside each tool as that tool ships, so the estimate below shows it both as its own line and folded into the total.

| Step | Scope | Estimate |
|---|---|---|
| 1. Framework foundation | `plan_steps` migration, `Tool` interface, tool registry skeleton, structured-output planning prompt + validation, rewrite `getting_it_done` to loop over approved steps, audit log table + writes, optimistic-concurrency approve/reject handlers | 1.5-2 weeks |
| 2. Frontend approval UI | Per-step approve/reject UI in `DelegationStatusRow`, hook changes in `useInboxDelegation`, realtime step-level updates, error/retry affordance | 1 week |
| 3. Tool: create meeting topic | Tool module, instance-resolution logic (which meeting instance to attach to), idempotency check, unit + e2e tests | 0.5-1 week |
| 4. Tool: post Slack update | Extract shared `postSlackMessage` helper, tool module, idempotency handling (no natural Slack-side idempotency, so rely on step-state guard), unit + e2e tests | 0.5-1 week |
| 5. Tool: draft email (scoped to draft-only, no send) | Decide+document draft semantics, tool module (likely just persists a draft body onto the delegation/step, no external call), UI to display/copy the draft, tests | 1 week |
| 5b. (If "send" is greenlit later) email send infra | Generalize Resend integration, add send confirmation step, additional approval gate given irreversibility | 1-1.5 weeks (separate follow-up, not in the 7-8 week total) |
| 6. Tool: schedule check-in | Blocked on product scoping decision; once decided: schema migration, `rc_links` integration (if RCDO-scoped) or new table (if generic), tool module, tests | 1-1.5 weeks |
| 7. Hardening pass | Partial-failure UX polish, retry flows, audit log review/reporting surface if needed, load-test the optimistic-concurrency approve path | 1 week |
| 8. Onboarding & user education | First-run explainer, per-tool preview tooltips (including the draft-vs-send distinction), changelog/what's-new entry, plain-language audit trail surface (see §9) | 0.5-1 week, layered in alongside steps 2-6 rather than fully deferred to the end |

## 8. Testing coverage

### Idempotency
- Double-click / concurrent `approve_step` requests for the same step resolve to exactly one execution (test via two near-simultaneous requests against the same `step_id`; assert the tool's side effect — e.g., Slack message, meeting topic row — exists exactly once).
- Edge function cold-start retry simulation: replaying the same `approve_step` request after a step is already `succeeded` must be a no-op (verify via `isAlreadyDone` returning true and no duplicate side effect).
- Idempotency key collision handling: two different steps must never share a key; verify key generation is per-step-per-plan, not reused across retries of the same plan.

### Partial failure
- Multi-step plan where step 2 of 3 fails (e.g., mock Slack API 401 due to expired token): assert step 1's result persists, step 3 does not auto-execute (no forward progress past a failure unless explicitly configured to continue), delegation status reflects "needs attention," and `agent_log`/audit log both record the failure distinctly from a rejection.
- Retry-after-failure: flipping a `failed` step back through `approve_step` re-attempts execution and, on success, updates status/result without duplicating any earlier-succeeded steps' effects.
- Simulated transient vs. permanent failures (network timeout vs. 404 "meeting instance no longer exists") — verify error messages surfaced to the user are actionable and distinguish "try again" from "this target no longer exists, plan needs editing."

### Approval flow correctness
- Rejecting a step marks it `rejected` and it is excluded from execution; delegation can still reach `done` with some steps `rejected` (not stuck waiting forever).
- `approve_all` behaves identically to sequential `approve_step` calls (same end state, same audit trail granularity — one audit row per step, not one row for the bulk action).
- Non-owner cannot approve/reject another user's delegation (RLS + edge function auth check regression test, mirroring existing `isUuid`/ownership patterns already tested in `inboxValidation.test.ts`).

### Tool-specific
- `create_meeting_topic`: correct `instance_id` resolution when multiple upcoming instances exist; graceful failure (not a crash) when no instance exists yet.
- `post_slack_update`: correct channel/DM resolution; graceful failure when the user has no `user_slack_credentials` row (unauthenticated with Slack) — must produce an actionable error, not a silent no-op.
- `draft_email` (draft-only scope): content is persisted and displayed; no external network call is made in this scope (a regression test asserting *no* Resend call occurs is worth adding explicitly, so a future change doesn't silently start sending).
- `schedule_checkin`: once scope is decided, cover both "linked to a valid DO/SI" and "target DO/SI was deleted/archived between planning and approval" (stale reference).

### Audit trail
- Every `approve_step`/`reject_step`/execution outcome produces exactly one `inbox_delegation_audit_log` row with correct `actor_user_id`, `action`, and `created_at` ordering.
- Audit log is append-only and not user-editable (RLS test: attempt a client-side update/delete and assert rejection).

### Regression
- Existing `ramping_up`/`clarifying`/`planning` phases (unchanged in this plan) continue to pass all current tests in `src/test/lib/inboxValidation.test.ts` and any existing component tests under `src/test/components/inbox/`.
- Backward compatibility: existing `inbox_delegations` rows created before this migration (with `plan` text but no `plan_steps`) must not break the UI — `plan_steps` defaults to `[]`, and the UI should fall back to rendering legacy `plan` markdown read-only with no approval affordance for those old rows.

## 9. Onboarding & User Education

This feature changes what clicking "Approve" *means* — today it dismisses a summary; after this ships, it triggers a real, often irreversible, external action (a Slack message lands in a channel, a meeting topic appears on an agenda, an email draft is created). That's a trust threshold, not just a UI change, and it needs to be taught, not just shipped. This section covers the in-product copy and touchpoints; it is sized and folded into §7 (step 8) rather than treated as a documentation afterthought.

### 9.1 First-run / empty-state copy

The first time a user's delegation reaches the new per-step approval UI (replacing the old single "Approve" button in `DelegationStatusRow.tsx`), show a one-time inline banner above the step list — dismissible, stored via a `localStorage` flag (e.g. `delegation_v2_intro_seen`) or a lightweight `user_preferences` row if one already exists in this codebase, so it doesn't reappear every session but *does* reappear if the user hasn't acted yet within the current delegation.

**Banner copy (first-run only):**

> **This is new: approving a step now does it for real.**
> Each step below is a specific action your agent is ready to take — posting to Slack, adding a meeting topic, drafting an email. Nothing happens until you approve it, and you approve one step at a time. Once you click **Approve & Execute**, that action happens immediately and can't be undone from here.
>
> *[Got it]*

Design notes:
- This must appear *before* the first step in the list, not as a modal/interstitial that blocks progress — the goal is orientation, not a gate.
- The word "immediately" and "can't be undone" are load-bearing; softer phrasing (e.g. "will be processed") tested worse in similar approval-gate patterns because it doesn't register as a real-world action.
- If a delegation has zero steps requiring approval (e.g., all steps already auto-skipped/rejected), the empty state should say so plainly rather than showing nothing: *"No actions are waiting on you for this task."*

**File/touchpoint:** new small component, e.g. `src/components/inbox/DelegationApprovalIntro.tsx`, rendered conditionally at the top of the step list inside `DelegationStatusRow.tsx`.

### 9.2 Inline hovers / tooltips per step type

Each `PlanStep` in the approval list needs a tooltip (hover on desktop, tap-to-reveal on mobile) triggered from an info icon next to the step's `description`, shown *before* the user decides, not just in the expanded log after the fact. Content is tool-specific and pulls from `step.params` so it previews the *actual* target, not a generic description.

| Tool | Tooltip copy (templated from `params`) |
|---|---|
| `create_meeting_topic` | **What happens:** Adds "*{title}*" as a topic to your next **{meeting series name}** meeting on **{date}**. It'll show up on the agenda immediately and everyone with access to that meeting will see it. |
| `post_slack_update` | **What happens:** Posts this message to **#{channel}** (or **DM to {person}**), visible to everyone in that channel, right away: *"{message preview, truncated}"* |
| `draft_email` | **Draft only — this will NOT be sent.** Your agent will write an email addressed to **{recipient}** about "*{subject}*" and save it here for you to review, edit, and send yourself. No email leaves TacticalSync unless you copy it out and send it manually. |
| `schedule_checkin` *(post-scoping)* | **What happens:** {copy finalized once §4.2's scoping decision lands — placeholder: "Schedules a check-in reminder for {target} on {date}."} |

Design notes:
- The `draft_email` tooltip is deliberately the longest and front-loads "will NOT be sent" in bold, distinct styling (e.g. a small amber/neutral "Draft only" badge next to the step, not just tooltip text) — this is the one action type most likely to be mistaken for "it just sent an email on my behalf," so it gets a persistent visual marker, not just a hover-only explanation a user might never trigger.
- Tooltips render the *real* target (channel name, meeting name, recipient) resolved server-side at plan time, not left as a template — a step proposing to post to "#eng-standup" must say `#eng-standup`, not "a Slack channel."
- For `post_slack_update` specifically, truncate the message preview (e.g. 140 chars) with a "see full message" expand, matching the existing `DelegationDetail` expand pattern already used for the plan/log.

**Files/touchpoints:**
- `src/components/inbox/DelegationStatusRow.tsx` — add a `StepPreviewTooltip` (new small component or inline) per step row.
- `src/components/inbox/PlanStepBadge.tsx` (new) — the persistent "Draft only" (and, if useful, "Posts to Slack" / "Adds to meeting") badge shown inline, not just on hover, so the distinction survives a quick skim.
- Tooltip copy strings live alongside `STATUS_LABEL` in `DelegationStatusRow.tsx` (or a new `delegationCopy.ts` if the file starts feeling crowded) so tool-specific strings aren't scattered.

### 9.3 "What's new" callout / changelog entry

If this codebase has an existing changelog/what's-new surface (a settings panel, a notification, a release-notes modal), this entry slots into it; if none exists yet, a one-time dismissible banner in the inbox (same mechanism as §9.1, different flag) is the fallback — worth a quick check against `src/components/ui/settings-navbar.tsx` or similar during implementation to avoid building a second mechanism if one already exists.

**Changelog entry draft:**

> **Delegation now finishes the job.**
> Before: your agent handed you a plan and stopped — you still had to go post the Slack message, add the meeting topic, or write the email yourself.
> Now: approve a step and it does it for you. Draft a follow-up email, add a topic to your next meeting, or post a Slack update — one approval, one action, done. Email drafts are always draft-only; nothing sends without you.

Design notes:
- Keep the before/after framing — it's the clearest way to communicate the value of an internal state-machine change that's otherwise invisible to a user who never looked closely at where the old flow stalled.
- Explicitly reiterate "email drafts are always draft-only" even in the changelog, not just the tooltip — this is the detail most likely to cause a support ticket if a user assumes otherwise.

**File/touchpoint:** wherever this app's changelog surface lives (needs a quick audit at implementation time); if none exists, new `src/components/inbox/DelegationWhatsNewBanner.tsx`.

### 9.4 Audit trail visibility (plain language, not raw log)

§5.3 designed `inbox_delegation_audit_log` as an append-only, service-role-written table — that's the durable record, but it's not something a user should ever have to read as raw rows. Surface it as a plain-language activity line attached to each executed step, using data already in `plan_steps[i]` (result, approved_by, approved_at) joined with the acting user's display name (the owning user is also normally the approver in v1, but the audit log's `actor_user_id` matters once delegations are ever shared/team-visible, and this phrasing should hold up if that happens).

**Copy pattern:**

> *{Actor name}'s agent posted this Slack update on your behalf on {date, time}.*
> *{Actor name}'s agent added this topic to {meeting name} on {date, time}.*
> *{Actor name} drafted this email on {date, time} — not sent.*

Rendered inline under each `succeeded` step in the expanded `DelegationDetail` view (`DelegationStatusRow.tsx`, ~line 82-114), replacing/augmenting the current raw `agent_log` timestamp+text lines for executed steps specifically (the general agent narration log stays as-is for ramping_up/clarifying/planning commentary — this plain-language line is additive, specific to steps that actually executed).

Design notes:
- Always name the actor explicitly, even when it's "you" — "You approved this" / "Your agent posted this on your behalf" reads more trustworthy than a passive "This was posted," especially for actions with external, visible side effects like a Slack message a teammate might ask about.
- Timestamps use existing locale-aware formatting already present in `DelegationStatusRow.tsx` (`toLocaleTimeString` pattern, line 104) rather than introducing a new date-formatting convention.
- Failed/rejected steps get their own plain-language line too, not silence: *"This Slack update wasn't sent — the connection to Slack expired. [Retry]"* rather than only a red icon.

**Files/touchpoints:**
- `src/components/inbox/DelegationStatusRow.tsx` — extend `DelegationDetail` to render the plain-language line per executed step.
- Possibly a small formatter helper, e.g. `describeStepOutcome(step, actorName)`, colocated with the other pure helpers in `src/lib/inboxValidation.ts` (or a new `src/lib/delegationCopy.ts`) so it's unit-testable independent of the component.

### 9.5 Effort estimate

Folded into §7 as step 8 (0.5-1 week), but not fully deferred to the end — the recommendation is to ship each tool's tooltip/badge copy (§9.2) and audit-trail line (§9.4) *with* that tool in steps 3-6, rather than batching all education work into a final pass. Only the first-run banner (§9.1) and the changelog entry (§9.3) are genuinely one-time, standalone pieces of work, sized at roughly 2-3 days combined; the remaining budget in step 8 covers copy review/polish and the "Draft only" badge component shared across tools.

---

*This document is a plan only. No feature code, migrations, or edge function changes have been made in this pass.*
