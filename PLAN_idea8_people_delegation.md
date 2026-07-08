# Plan: Idea #8 — People Delegation with a Paper Trail

Status: **PLANNING ONLY — no feature code written.** This document is for human review/approval before implementation begins.

## 0. TL;DR verdict

**This idea is not buildable as scoped today.** There is a hard blocking prerequisite: `cos_team_members` (the table that represents "Alex, my direct report") has **no link whatsoever** to Alex's own `auth.users` account. It is a freeform contact record — `name`, `role`, `email` (as plain text), owned entirely by the manager. There is no `linked_user_id`, `auth_user_id`, invite flow, or resolution mechanism connecting a `cos_team_members` row to the person's own login.

Separately, the app *does* have a real cross-user account-linking mechanism — `profiles` + `team_members` + `invitations` (with `invite_code` / `invited_by`) — used by the unrelated RCDO/team module. But it is **completely disconnected** from `cos_team_members`. The two systems have never been joined.

Also worth noting up front: the delegation infrastructure that already exists in the inbox (`inbox_delegations` table, `useInboxDelegation.ts`, `delegate-inbox-task` edge function, the "Delegate" button in `Inbox.tsx`) is **AI-agent delegation**, not person delegation. It hands the task to an autonomous Claude-powered sub-agent that ramps up, asks clarifying questions, plans, and executes — all while the item stays owned by the same `user_id`. This is a different feature wearing a similar name. The actual person-delegation entry point is stubbed as a no-op:

```tsx
// src/pages/Inbox.tsx:803
onSelect={(target) => {
  if (target.type === 'assistant') handleDelegateToAssistant();
  else setDelegateOpen(false); // person delegation — future
}}
```

So Idea #8 requires two sequential efforts, not one:
1. **Prerequisite: account-linking** — give `cos_team_members` a resolvable path to the teammate's real `user_id`.
2. **Idea #8 proper** — cross-user delegated inbox items, two-way status sync, and 1:1 agenda surfacing.

Recommend treating these as two separate approvals. Everything below is planned as if both are in scope, with the prerequisite called out at every step so it can be descoped/deferred without re-planning.

---

## 1. Investigation findings (grounding)

### 1.1 Does `cos_team_members` resolve to a real `user_id`? — No.

`supabase/migrations/20260419000000_create_cos_tables.sql:26-36`:

```sql
CREATE TABLE IF NOT EXISTS cos_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- the MANAGER's user_id
  name text NOT NULL,
  role text NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN ('direct_report', 'collaborator')),
  context_notes text,
  last_1on1_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

`user_id` here is the **owner/manager's** account (RLS: `USING (auth.uid() = user_id)` — "manage own cos_team_members"). `email` was added later (`20260605000000_calendar_integration.sql:8`, for calendar-attendee matching) as a plain text column, not a foreign key. I grepped the entire migrations directory and `src/` for `linked_user_id`, `auth_user_id`, `invite_token`, `pending_invite`, `account_link` — the only invite/account-linking hits are in the unrelated RCDO team system (`profiles`, `invitations` table with `invite_code`/`invited_by`, `TeamInvite.tsx`). None of it touches `cos_team_members`.

Practical implication: today, if "Alex" is a row in your `cos_team_members`, the system has no way to know which (if any) `auth.users` row is Alex's own login — not even by matching `cos_team_members.email` to `auth.users.email`, since that join doesn't exist anywhere in code. Cross-user delegation cannot target a real recipient without solving this first.

### 1.2 The delegation UI stub

`src/components/inbox/DelegateDropdown.tsx` already renders a full people picker — grouped by "Direct reports" / "Skip-level" / "Others", sourced from `cos_team_members` — with an `onSelect({ type: 'person', member })` callback. This is exactly the entry point idea #8 needs. But the consumer in `src/pages/Inbox.tsx:798-807` only wires up the `'assistant'` branch (`handleDelegateToAssistant`, calling the `delegate-inbox-task` edge function which runs an AI agent, `supabase/functions/delegate-inbox-task/index.ts`). The `'person'` branch is a one-line no-op. So the UI entry point exists; nothing behind it does.

### 1.3 Existing `inbox_delegations` table is unrelated infrastructure, not reusable as-is

`supabase/migrations/20260713000003_inbox_delegations.sql` creates `inbox_delegations` scoped by `user_id = auth.uid()` (the delegator, i.e. same user), with a `status` enum (`ramping_up, clarifying, planning, getting_it_done, seeking_approval, done, cancelled`) for tracking an **AI agent's** progress, plus `agent_log`, `current_question`, `plan`, `result` — all AI-agent-shaped fields. This table name collides conceptually with what we'd want to call a person-delegation link table, so naming needs to avoid confusion (see §3).

### 1.4 `inbox_items.workflow_status` already has `'Waiting on someone'`

Confirmed present per the task brief; `20260713000002_inbox_workflow_status.sql` and `20260716000000_inbox_workflow_status_do_now.sql` manage this enum's evolution. Today this status is set manually by the owning user for their own self-tracking — it has no wiring to any other user's item.

### 1.5 RLS on `inbox_items` — strict single-user ownership

`supabase/migrations/20260713000001_inbox_tables.sql:40-42`:

```sql
ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_items: own rows" ON inbox_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

No later migration changes this. It's a single, unconditional `USING`/`WITH CHECK` on `auth.uid() = user_id`. Any cross-user visibility requires either a new policy in addition to this one (RLS policies are OR'd within a command type in Postgres, so this is additive) or restructuring into a separate table. Sibling tables (`inbox_item_tags`, `inbox_tags`, `inbox_views`) follow the identical pattern and are NOT modified by this plan — only `inbox_items` (or a new linking table) needs new policy surface.

### 1.6 1:1 agenda surfaces

`cos_one_on_one_prep` (`20260423000000_create_cos_one_on_one_prep.sql`) stores prep content per `(user_id, team_member_id)` pair — `team_member_id uuid NOT NULL UNIQUE REFERENCES cos_team_members(id)`. It's a single blob of prep `content` (markdown/text) generated by an AI prep pipeline (`source IN ('cleargo', 'static')`), not a structured, queryable agenda-item list. `cos_prep_inputs` (`20260424000000_add_cos_prep_inputs.sql`) and `cos_person_sections` (`20260505000000_create_cos_person_sections.sql`) hang more structured content off `member_id` but I did not find a discrete "agenda items" table with individual rows that a delegated inbox item could attach to declaratively — the prep surface is generated/assembled content, scoped to the manager's account, keyed by `cos_team_members.id`.

Critically: since 1:1 prep is scoped to `user_id` (the manager) + `team_member_id` (a row the manager owns), and it's a **one-sided** structure (there's no `cos_one_on_one_prep` row visible to or owned by the direct report's own account), "surfaces on your next shared 1:1 agenda together" cannot mean "appears in a table both people's RLS can read" — it means "appears in the delegator's prep view for that team member" (one-directional, from the manager's side only) unless the account-linking prerequisite (§2) is solved, in which case a symmetric, both-sides-visible agenda becomes possible.

---

## 2. Prerequisite: account-linking (`cos_team_members` → `auth.users`)

This has to happen before delegated items can route to a real recipient's inbox. Two viable approaches:

### Option A — Email-match auto-link (lightweight, no invite flow)
Add `cos_team_members.linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`. Backfill/maintain it via a trigger or edge function that matches `lower(cos_team_members.email) = lower(auth.users.email)` whenever either side changes (new team member added, or a matching user signs up). Works only if the direct report already has an account in the same Supabase project (same tenant) and their `cos_team_members.email` was entered correctly.

- Pro: no new UI, no invite friction, fast to ship.
- Con: silent, fragile (typo'd email = silently unlinked forever; email changes break it); doesn't work if the direct report has never signed up; matching by email across tenants is itself a privacy question (does User A get to discover whether an email belongs to a real account in this system by adding it as a team member? Needs a resolution endpoint that reveals only a boolean/linked-or-not, never account details, to avoid an email-enumeration oracle).

### Option B — Explicit invite/claim flow (heavier, consent-first)
Add `cos_team_members.linked_user_id` (nullable) plus an invite record (`cos_team_member_invites`: `team_member_id`, `invite_code`, `status`, `invited_email`, `expires_at`). Manager clicks "Invite Alex to link" → email sent → Alex logs in / signs up → claims the row → `linked_user_id` set, with Alex's explicit consent captured at claim time (this doubles as the delegation consent gate in §7).

- Pro: explicit consent, no email-enumeration oracle, reuses the existing `invitations`/`invite_code` pattern already proven in `TeamInvite.tsx` for the RCDO module (same shape, different table).
- Con: real onboarding flow to build; adds a "pending link" state that the UI must represent (delegate button should be visibly disabled/different for unlinked team members); slower time-to-value for the viral loop this idea is explicitly designed to drive.

**Recommendation:** Option B. Idea #8 is explicitly framed as a cross-user, viral growth mechanic — shipping silent email-matching for a feature whose entire pitch is "share this with a colleague" is a consent and trust problem waiting to happen (see §7). The invite flow also gives us a natural moment to explain what delegation will share with the other person, which materially reduces the privacy risk.

This prerequisite is its own project. Suggest scoping and approving it separately before greenlighting the rest of idea #8; the estimate in §8 treats it as Phase 0 so the tradeoff is visible.

---

## 3. RLS model for cross-user delegated items

Two designs considered.

### Approach 1 — `delegated_to_user_id` column directly on `inbox_items`

```sql
ALTER TABLE inbox_items ADD COLUMN delegated_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE POLICY "inbox_items: delegatee can view and update delegated rows"
  ON inbox_items FOR SELECT
  USING (auth.uid() = delegated_to_user_id);

CREATE POLICY "inbox_items: delegatee can update status on delegated rows"
  ON inbox_items FOR UPDATE
  USING (auth.uid() = delegated_to_user_id)
  WITH CHECK (auth.uid() = delegated_to_user_id);
```

- Pro: simplest possible query — "my inbox" is still `user_id = auth.uid()`, and a delegated-to-me view is `delegated_to_user_id = auth.uid()`. No join needed anywhere in the app.
- Con: this is the same physical row visible under two different owners' RLS predicates simultaneously. Any future column added to `inbox_items` must be re-examined for "is it safe for the delegatee to also see/write this?" — the table's trust boundary silently expands forever as the schema grows. It also conflates "the delegator's item" and "the delegatee's item" as literally one row, which breaks the product's own model: the brief says the item should "appear in the delegatee's inbox" (implying it becomes *their* actionable item, potentially retagged/reprioritized on their side) while "staying in your inbox as Waiting on" (implying the delegator's copy is a distinct, lighter-weight tracking artifact). One row can't cleanly be both without a lot of conditional UI logic keyed off "am I the owner or the delegatee."
- This also does not extend cleanly to re-delegation, delegation history, or multiple simultaneous delegates (not asked for now, but foreclosing it with a single column is a real cost).

### Approach 2 — new linking/tracking table (recommended)

Create `inbox_item_delegations` (name deliberately distinct from the existing AI-agent `inbox_delegations` table to avoid confusion):

```sql
CREATE TABLE inbox_item_delegations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id      uuid NOT NULL REFERENCES inbox_items(id) ON DELETE CASCADE,
  delegator_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegatee_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegatee_item_id   uuid REFERENCES inbox_items(id) ON DELETE SET NULL, -- the copy created in delegatee's inbox
  team_member_id      uuid REFERENCES cos_team_members(id) ON DELETE SET NULL, -- which cos_team_members row this routed through, for the 1:1 hook
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'declined', 'done', 'cancelled')),
  note                text, -- optional message from delegator ("can you take a look before Friday?")
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

ALTER TABLE inbox_item_delegations ENABLE ROW LEVEL SECURITY;

-- Delegator can see/manage delegations they created
CREATE POLICY "delegator can manage their outgoing delegations"
  ON inbox_item_delegations FOR ALL
  USING (auth.uid() = delegator_user_id)
  WITH CHECK (auth.uid() = delegator_user_id);

-- Delegatee can see delegations addressed to them, and update status only
CREATE POLICY "delegatee can view their incoming delegations"
  ON inbox_item_delegations FOR SELECT
  USING (auth.uid() = delegatee_user_id);

CREATE POLICY "delegatee can update status on their incoming delegations"
  ON inbox_item_delegations FOR UPDATE
  USING (auth.uid() = delegatee_user_id)
  WITH CHECK (
    auth.uid() = delegatee_user_id
    -- lock down which columns effectively change via a trigger (see §4) rather than
    -- trying to restrict columns in RLS, which Postgres RLS cannot do natively
  );
```

Then `inbox_items` itself needs exactly **one** additive policy so the delegatee can read (not write) the original item's content for display purposes, scoped tightly through the join:

```sql
CREATE POLICY "inbox_items: delegatee can view delegated source item"
  ON inbox_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inbox_item_delegations d
      WHERE d.source_item_id = inbox_items.id
        AND d.delegatee_user_id = auth.uid()
        AND d.status <> 'cancelled'
    )
  );
```

The delegatee's actual actionable item is a **separate row** in `inbox_items`, owned by them (`user_id = delegatee_user_id`, normal existing RLS applies, no new policy needed for it) — created by a `SECURITY DEFINER` function or edge function at delegation time, with `inbox_item_delegations.delegatee_item_id` pointing at it. This keeps "my inbox" = `user_id = auth.uid()` invariant intact for both people, and keeps the *reason* two people can both see related-but-distinct rows in one dedicated, auditable table instead of smearing cross-user exceptions across the core table's policy set.

- Pro: `inbox_items` gains exactly one narrowly-scoped additive SELECT policy (no new UPDATE/DELETE exposure on the core table at all); the delegatee's working copy is a fully normal, fully-owned row so all existing inbox features (tags, bucket, priority, snooze) work on it for free; delegation lifecycle (pending/accepted/declined/cancelled) has a home; supports future multi-delegate or re-delegate cases without touching `inbox_items` schema again; it's the natural audit/paper-trail table the feature is named after.
- Con: two rows to keep in sync (see §4) instead of one; slightly more query complexity when rendering "waiting on" state in the delegator's list (needs a join or a denormalized status mirror — see §4).

**Recommendation: Approach 2.** The core justification is RLS hygiene: `inbox_items` is the most heavily-used, most-frequently-modified table in the module (12+ migrations touching it already). Keeping its trust boundary at "the row's `user_id` is the only writer/reader" and pushing all cross-user complexity into one clearly-named, single-purpose, easy-to-audit table is a much smaller ongoing security review surface than teaching every future `inbox_items` migration to think about a second implicit owner.

---

## 4. Two-way status sync design

Goal: delegatee marks their copy done → delegator's "Waiting on" item reflects it, without giving the delegatee write access to the delegator's row (per the RLS design above, they explicitly do not have UPDATE rights on `inbox_items` beyond their own copy).

Mechanism: a Postgres trigger on `inbox_items`, scoped to rows that are a delegatee-owned copy, that updates the linked `inbox_item_delegations` row and cascades to the delegator's source item — running as `SECURITY DEFINER` (or as a trigger function owned by a role that bypasses RLS, which is how triggers normally operate against the table they're defined on) so it isn't blocked by the delegatee's own RLS grant:

1. Delegatee marks their `inbox_items` copy `status = 'done'`.
2. `AFTER UPDATE` trigger on `inbox_items` (`fn_sync_delegation_status`) detects the update was on a row that is a `delegatee_item_id` in `inbox_item_delegations`, and:
   - Sets `inbox_item_delegations.status = 'done'`, `completed_at = now()`.
   - Updates the **source** `inbox_items` row's `workflow_status` to something like `'Done — confirmed by <name>'` or clears `'Waiting on someone'` and sets a `delegation_resolved_at`-style marker (exact status string TBD with design, see open question below) — this write happens via the trigger's elevated privilege, not the delegatee's own grant, so it's not an RLS bypass exploitable by the delegatee for anything else.
3. Reverse direction (delegator cancels/reassigns): a symmetric trigger on `inbox_item_delegations` (`AFTER UPDATE ... WHEN status = 'cancelled'`) soft-cancels or archives the delegatee's copy so it doesn't sit orphaned in their inbox.
4. Realtime: both `inbox_items` and `inbox_item_delegations` already sit under Supabase Realtime (per `useRealtimeSubscription.ts` / `useRCDORealtime.ts` patterns used elsewhere) — subscribe the delegator's inbox view to `inbox_item_delegations` changes filtered by `delegator_user_id=eq.<uid>` so the "Waiting on" row updates live, mirroring the existing `useInboxDelegation.ts` pattern of subscribing to `postgres_changes` on a filtered table.

Open question to resolve with design before implementation: does the delegator's original item auto-transition out of `'Waiting on someone'` on completion, or does it move to `'done'`/get archived automatically? Recommend: transition to `'done'` automatically (with a small "completed by Alex on <date>" annotation sourced from `inbox_item_delegations.completed_at` + the delegatee's name) rather than requiring the delegator to separately close the loop — the entire point of the feature is removing that manual bookkeeping step.

---

## 5. 1:1 agenda surfacing design

Given §1.6's finding that `cos_one_on_one_prep` is one-sided, generated content (not a discrete agenda-item table), two options:

### Option A — Query-time injection into prep generation
When the 1:1 prep pipeline (`ai_prep_generation` per `20260607100000_ai_prep_generation.sql`, feeding `cos_one_on_one_prep.content`) runs for a given `team_member_id`, add a data-fetch step: look up `inbox_item_delegations WHERE delegator_user_id = :manager AND team_member_id = :this_member AND status IN ('pending','accepted')`, and feed those into the prep-generation prompt/template as a discrete "Open delegations" section, alongside whatever else already populates prep (recent 1:1 notes, accountabilities, etc. — per `cos_prep_inputs`/`cos_person_sections`). This requires `inbox_item_delegations.team_member_id` (already included in the schema in §3) to be populated at delegation time — i.e., when delegating from the `DelegateDropdown`, the selected `CosMember.id` is stored on the delegation row so the prep pipeline can look it up later without guessing.
- Pro: no new table; reuses the existing prep-generation trigger points; delegations show up as part of the same AI-assembled agenda doc the manager already reads before every 1:1.
- Con: content-only, not structurally queryable/checkable from the UI as discrete agenda line items unless the prep renderer specifically parses out a delegation block; and since prep is one-sided (manager's view only, per §1.6), the direct report does not see "this is on today's agenda" from their own side unless the account-linking prerequisite (§2) also extends prep visibility to the linked account — which is out of scope here and would be its own project.
- This is the pragmatic near-term option and matches how the rest of the 1:1 prep surface already works (assembled content, not structured checklist).

### Option B — Structured agenda-item table (bigger lift, better long-term)
Introduce a real `cos_one_on_one_agenda_items` table (`user_id`, `team_member_id`, `source_type` in `('delegation','manual','accountability',...)`, `source_id`, `resolved_at`) that both the prep pipeline and a future "agenda" UI can query directly, and that a next-1:1 date lookup (via `cos_team_members.last_1on1_date` or the meeting-cadence tables from `20260625000000_meeting_cadence.sql`) can filter against ("show me everything that should come up before our next scheduled 1:1"). Delegating an item inserts a row here with `source_type = 'delegation'` pointing at the `inbox_item_delegations.id`.
- Pro: the right long-term structure; makes "auto-surfaces on your next 1:1" a real, testable, checkable query instead of "hope the AI prep prompt includes it"; extensible to other future agenda sources beyond delegation.
- Con: new table, new UI surface (or at least new query wiring into the existing prep view), meaningfully larger scope; likely deserves its own spec rather than being bootstrapped as a side effect of idea #8.

**Recommendation:** Ship Option A for the v1 of idea #8 (reuses existing prep-generation infrastructure, smallest surface area), but store `team_member_id` on `inbox_item_delegations` from day one (it's nearly free) so Option B can be layered on later without a backfill migration.

---

## 6. Files to change or create

### Prerequisite (Phase 0 — account linking, Option B from §2)
- **New migration**: `supabase/migrations/<ts>_cos_team_member_account_linking.sql`
  - `ALTER TABLE cos_team_members ADD COLUMN linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;`
  - `CREATE TABLE cos_team_member_invites (id, team_member_id, invited_email, invite_code, status, expires_at, created_at, claimed_at, claimed_by_user_id)` + RLS (owner of `team_member_id` can create/view; the invite-claim edge function uses service role to set `linked_user_id`).
  - New RLS policy allowing a claimed/linked user to read limited fields of the `cos_team_members` row that represents them (needed so the delegatee-side UI can show "you're linked as Alex under <manager>'s team," and needed for §5's future Option B agenda visibility).
- **New edge function**: `supabase/functions/claim-team-member-invite/index.ts` — validates invite code, sets `linked_user_id`, marks invite claimed.
- **New page/route**: `src/pages/ClaimTeamMemberInvite.tsx` (or extend `TeamInvite.tsx` if a shared pattern makes sense — investigate reuse, but note `TeamInvite.tsx` is wired to the RCDO `team_members`/`profiles` model, not `cos_team_members`, so likely needs its own lightweight page).
- **Edit**: `src/components/inbox/DelegateDropdown.tsx` — show link-status affordance (e.g., grey out / add an "Invite to link" action) for `cos_team_members` rows without `linked_user_id`.
- **Edit**: wherever `cos_team_members` rows are created/edited (find the "add direct report" form) — add an "Invite them to link their account" action.

### Idea #8 core
- **New migration**: `supabase/migrations/<ts>_inbox_item_delegations.sql` — `inbox_item_delegations` table + RLS policies (§3), plus the one additive SELECT policy on `inbox_items` for delegatee visibility into the source row.
- **New migration**: `supabase/migrations/<ts>_inbox_item_delegation_sync_triggers.sql` — the `fn_sync_delegation_status` trigger function + triggers described in §4.
- **Edit**: `supabase/migrations/20260713000002_inbox_workflow_status.sql`-successor — likely a new migration adding whatever new `workflow_status` value(s)/annotation columns are needed to represent "delegated, waiting on X" distinctly from the existing self-referential `'Waiting on someone'` (needs a decision: reuse the string or add a `delegation_id` pointer column on `inbox_items` so the UI can render "Waiting on Alex" with a live link instead of a static string — recommend the latter, add `inbox_items.active_delegation_id uuid REFERENCES inbox_item_delegations(id) ON DELETE SET NULL` for the delegator's row).
- **New edge function**: `supabase/functions/delegate-inbox-item-to-person/index.ts` — creates the `inbox_item_delegations` row + the delegatee's `inbox_items` copy in one transaction (needs service-role/`SECURITY DEFINER` since the delegator's own RLS grant can't insert a row owned by someone else's `user_id`); validates the `cos_team_members` row belongs to the delegator and has `linked_user_id` set (hard-fail with a clear error otherwise, prompting the invite flow from Phase 0).
- **Edit**: `src/pages/Inbox.tsx` — wire the `'person'` branch (currently `// person delegation — future`, line 803) to call the new edge function instead of no-op; add UI for the delegator's "Waiting on Alex" row state (read `active_delegation_id`).
- **New hook**: `src/hooks/useInboxItemDelegation.ts` (naming distinct from existing `useInboxDelegation.ts`, which is the AI-agent one) — mirrors the realtime-subscription pattern in `useInboxDelegation.ts` but for `inbox_item_delegations`.
- **New component**: `src/components/inbox/DelegatedBadge.tsx` or extend `src/components/inbox/DelegationStatusRow.tsx` (check if reusable — it currently renders AI-agent delegation status; needs to visually and semantically distinguish "AI is working on this" from "Alex is working on this") — recommend renaming/splitting rather than overloading.
- **Edit**: `src/lib/inboxValidation.ts` — add a Zod schema for the new edge function's request body, mirroring the existing `delegationRequestSchema` pattern (kept hand-in-sync with the Deno edge function per the existing code comment convention).
- **Edit**: 1:1 prep generation pipeline (`supabase/functions/` — find the function backing `20260607100000_ai_prep_generation.sql`) — add the "open delegations" data-fetch step described in §5 Option A.
- **Edit**: `src/integrations/supabase/types.ts` — regenerate via Supabase MCP after migrations land (per the user's existing memory note on type regen).

---

## 7. Risks — privacy, consent, and RLS bar

This is the most important section. Flagging explicitly per the task brief:

1. **Consent and scope of who can delegate to whom.** This must be restricted to existing `cos_team_members` relationships the delegator has created (i.e., you can only delegate to someone you've already added as a direct report/collaborator), never an arbitrary `auth.users` email lookup. The edge function in §6 must validate `cos_team_members.user_id = delegator` AND `cos_team_members.linked_user_id = target` before creating anything — this is the actual security boundary, more important than the RLS policies themselves, because RLS on `inbox_item_delegations` only checks "are you the delegator/delegatee," not "was this relationship consensual." Recommend also requiring the delegatee's one-time consent at claim time (Phase 0 invite flow) to explicitly cover "your manager will be able to send items to your inbox" — don't bury this in generic terms of service.

2. **This is genuinely multi-tenant data sharing**, arguably the first real instance of it in the inbox module (everything else is single-user-owned). The RLS bar is categorically higher than the rest of the module:
   - Every new policy touching `inbox_items` or `inbox_item_delegations` needs a negative test proving the *other* user cannot see non-delegated rows (see §10).
   - The additive SELECT policy on `inbox_items` (§3) must be re-reviewed every time `inbox_items` gains new sensitive columns in the future — flag this in code review checklists/CLAUDE.md once built, since it's easy for a future migration to add a column assuming single-owner semantics.
   - Consider whether `body` (rich text notes) on a delegated item should be visible to the delegatee at all, or whether delegation should only copy `text`/title, not the owner's private notes — recommend the edge function copy only `text`, tags relevant to the task, and an explicit `note` field the delegator writes for the delegatee, NOT the full `body` of the original item, to avoid accidentally leaking the delegator's private working notes.

3. **Viral/growth mechanic framing raises the stakes on the invite flow (Phase 0).** Because this is explicitly designed to pull a second user into the product, there's pressure to make linking frictionless (Option A, email auto-match) — resist that. An auto-match-by-email approach that silently links accounts, combined with a feature whose whole point is "push a task into someone else's inbox," is exactly the shape of dark pattern that generates support complaints and trust damage ("why is my manager's task in my inbox and I never agreed to this?"). The explicit invite/claim flow (Option B) is a deliberate friction point that should not be cut for growth-metric reasons without a real product/legal conversation.

4. **Email-enumeration oracle.** If any part of the linking flow reveals "yes, this email belongs to an account" vs. "no it doesn't" as a distinguishable response, that's a minor account-enumeration leak. Keep the invite flow's response uniform regardless of whether the email matches an existing account (send an email either way: "claim your linked profile" for existing users, "join TacticalSync to see what Alex sent you" for new ones).

5. **Delegatee's ability to see the delegator's original item (§3's additive SELECT policy).** Scope it as tightly as written — `status <> 'cancelled'`, joined only through `inbox_item_delegations`, SELECT-only, never UPDATE/DELETE. Any expansion of this policy's `USING` clause in the future should be treated as a security-relevant change requiring the same review rigor as the initial launch.

6. **Un-linking / offboarding.** If a `linked_user_id` is later cleared (person leaves the team, or unlinks), what happens to in-flight delegations? Recommend: existing `inbox_item_delegations` rows keep functioning (the FK is to `auth.users`, not to the link record) but new delegations to that `cos_team_members` row should be blocked until re-linked. Needs explicit handling in the edge function.

---

## 8. Onboarding & User Education

The user has asked that every one of these feature plans bake in in-product education, not bolt it on after the fact — they approved idea #8 from a summary paragraph, and end users (plus the user themselves, re-encountering this feature months after approving it) need to actually understand the value when it ships, not just have engineering mechanics that technically work. This section covers first-run copy, inline UI markers, a changelog entry, and consent framing, specific to this feature, and is sized and folded into the phased plan in §9.

This section assumes Phase 0 (account-linking) ships as designed in §2 (explicit invite/claim, Option B) — the education plan below treats the invite/claim moment as the primary consent and expectation-setting surface, since it's the only point where both parties are deliberately looking at the screen together (conceptually) before any data crosses accounts.

### 8.1 First-run / empty-state copy — delegator side

**A. Picking a person in `DelegateDropdown` when they're already linked** (`src/components/inbox/DelegateDropdown.tsx`)

No extra friction needed here beyond a first-time tooltip (see §8.2) — the member row shows normally. But the very first time *any* user opens the delegate dropdown and it contains at least one linked person, show a one-time inline coach mark (dismissible, stored in `localStorage` or a `user_settings`-style flag, not a modal):

> **Delegate directly to your team**
> Send this item to Alex's inbox instead of doing it yourself. They'll see it, you'll see "Waiting on Alex" until it's done — no more digging through Slack to remember who has what.
> `[Got it]`

**B. Picking a person who has NOT linked their account yet** — this is the critical fallback path. Today `DelegateDropdown` shows every `cos_team_members` row with no distinction; once Phase 0 ships, unlinked rows need a visibly different state and a different click outcome. Proposed UI: unlinked members render greyed/secondary (not hidden — hiding them would be confusing, since the manager still thinks of them as a team member) with a small "not linked" tag inline in the row itself:

```
[avatar] Alex Chen        Not linked yet →
[avatar] Priya Shah
```

Clicking an unlinked row does **not** silently no-op (as it does today) and does **not** attempt delegation. It opens a small inline panel/popover in place of the dropdown:

> **Alex hasn't linked their account yet**
> To delegate items to Alex, they need to connect their TacticalSync login to your team list. Send them an invite — it takes 30 seconds on their end.
>
> `[Send invite to Alex]`     `[Maybe later]`
>
> *Alex will get an email explaining what this means and can decline if they'd rather not.*

That last line matters — it pre-tells the delegator that the delegatee has a real choice, which sets the right expectation and reduces "why didn't Alex respond" confusion later. On "Send invite," fire the invite (Phase 0's `claim-team-member-invite` flow) and flip the row to a "Invite sent" state with a timestamp, so re-opening the dropdown later doesn't imply nothing happened:

```
[avatar] Alex Chen        Invite sent 2 days ago →
```

**C. Empty state: delegator has zero linked team members at all.** If every `cos_team_members` row is unlinked (i.e., Phase 0 just shipped and nobody has claimed anything yet), the dropdown's default view — not just the per-row click — should lead with an explanation rather than a wall of "not linked" tags:

> **Delegate to your team**
> None of your team members have linked their accounts yet. Once they do, you can send them items directly and track progress together.
> `[Invite your team]` → bulk-invite entry point, or fall through to per-person invites above.

### 8.2 First-run / empty-state copy — delegatee side

**A. The first delegated item ever lands in someone's inbox.** This is the highest-leverage education moment in the whole feature — it's the delegatee's first contact with a capability they may not know exists ("wait, people can just... put things in my inbox now?"). The item itself needs a clear, un-missable origin marker (see §8.3), but the *first* one specifically should carry a one-time explanatory banner above it in the inbox list, shown once and dismissible:

> **New: items delegated to you show up here**
> Dan sent you "Review the Q3 comp bands" — it showed up in your inbox because Dan delegated it to you. Mark it done and Dan will see it update automatically. [Learn more]
> `[Dismiss]`

"Learn more" links to a short static help panel/modal (not a new page) covering: what delegation is, that the delegator can see the item's status but not edit your inbox, that you can decline (see §8.4), and that it's tied to your existing team relationship with Dan (not something a stranger can do to you).

**B. Every subsequent delegated item** (no banner, just the inline marker from §8.3) — the education cost should front-load onto the first occurrence and get out of the way after that; repeating an explanatory banner on every item would be noisy and would undercut the "this is just normal now" feeling the feature wants to build.

### 8.3 Inline hovers / tooltips / origin markers

**Delegator's "Waiting on" row** (rendered wherever `workflow_status`/`active_delegation_id` surfaces — likely a status chip in the inbox row, per `src/components/inbox/InboxItemRow.tsx`): the status text itself should read `Waiting on Alex` (not a generic "Waiting on someone" once a real delegatee exists — reuse the existing enum value only for the legacy self-referential case), and hovering/tapping it should show a small tooltip:

> **Waiting on Alex Chen**
> Delegated 3 days ago (Jul 4)
> [View in Alex's words →] *(optional link to the note text, if any)*

This directly answers "who is it waiting on and since when," per the requirement — both facts should be readable without a click (the chip text carries "who," a relative-time hover/subtext carries "since when": e.g. render `Waiting on Alex · 3d` inline, with the tooltip giving the exact date).

**Delegatee's copy of the item** (`src/components/inbox/InboxItemRow.tsx`, likely a new small badge component per §6's `DelegatedBadge.tsx`): every delegated item needs a persistent, non-hover-only origin marker — don't make this discoverable only on hover, since the whole point is a scannable paper trail. Proposed inline badge, always visible in the row:

```
↳ From Dan · 3 days ago
```

Hovering the badge expands to:

> **Delegated by Dan Pope**
> Jul 4, 2026 · "Can you take a look before Friday?" *(the delegator's optional note, if present)*

This distinguishes it visually and semantically from the existing AI-agent delegation status row (`DelegationStatusRow.tsx`, which shows "Assistant is planning…" etc.) — per §6's note that these two concepts must not be visually conflated. Recommend a consistent color/icon convention: person-delegation badges use an avatar/person icon; AI-agent delegation status keeps its existing bot icon. A user should be able to tell at a glance, without reading text, whether a given item is "a colleague is on this" vs. "the AI assistant is on this."

### 8.4 Consent copy — account linking and delegation-permission awareness

Two distinct consent moments, both required given this is new cross-user data sharing (per §7):

**Moment 1 — the invite email** (sent from Phase 0's invite/claim flow, the first time a delegatee hears about any of this):

> Subject: Dan wants to connect with you on TacticalSync
>
> Hi Alex,
>
> Dan Pope has added you to their team in TacticalSync and would like to be able to send you items to work on directly — they'll land in your inbox, and Dan will be able to see when you mark them done. You'll always be able to see who sent you something and why.
>
> This does not give Dan access to anything else in your account — only items they explicitly send you.
>
> [Connect my account]   [Not interested]
>
> If you don't recognize this or don't want to connect, you can safely ignore this email.

The "Not interested" / ignore path must be a genuine no-op with no nagging re-send loop beyond a single reasonable reminder (see §7.3's concern about growth-metric pressure overriding consent) — this is a policy point worth flagging back to the approving human, not just a copy point.

**Moment 2 — the claim confirmation screen** (`src/pages/ClaimTeamMemberInvite.tsx` per §6), the actual consent checkpoint, shown after clicking "Connect my account" and logging in/signing up:

> **Link your account to Dan's team?**
>
> Once linked, Dan will be able to:
> - Send items directly to your TacticalSync inbox
> - See the status of items they've sent you (not your other inbox items)
>
> You can unlink at any time from Settings → Connections.
>
> `[Link my account]`   `[Cancel]`

This is the actual legal/product consent gate — explicit, itemized, reversible, and separate from just clicking an email link (email clicks are not informed consent on their own).

**"How does a user find out someone *can* delegate to them" going forward** (i.e., after the initial invite, how do they re-discover/confirm this is active): add a visible entry under **Settings → Connections** (or wherever account-level integrations live today — investigate for a existing settings pattern to extend rather than invent a new one) listing everyone currently linked to the user's account, in both directions ("People who can send you items" / "Your team members"), with an unlink action next to each. This is the persistent, always-available answer to "wait, who can put things in my inbox?" — not just a one-time email they might not remember.

### 8.5 "What's new" callout / changelog entry

Draft copy for the release-notes/changelog surface (wherever the app's existing "what's new" mechanism lives — investigate for one; if none exists, this plan doesn't scope building a changelog system, just supplying the entry copy for whatever ships it, e.g. a `release_notes` table, a static markdown file, or an in-app toast):

> **Delegate to your team, with a paper trail**
>
> Before: "I asked Alex to do this" lived in Slack scrollback, three weeks deep. Now: delegate an item straight from your inbox — it shows up in Alex's inbox, stays in yours as "Waiting on Alex," and updates automatically the moment they mark it done. It even shows up on your next 1:1 agenda together, so nothing falls through the cracks.
>
> Requires linking your account with your team members first — [see how it works →]

The "[see how it works →]" link should point to the same help panel referenced in §8.2's "Learn more," so there's exactly one canonical explanation surface rather than three different half-explanations scattered across an email, a coach mark, and a changelog entry.

### 8.6 Effort estimate for this section

**0.5–1 week**, folded into the phases below rather than run as a standalone phase (copy and UI touchpoints are cheap relative to the schema/RLS work they ride on top of, but they touch multiple phases and must not be an afterthought bolted on at the end):

- Copy drafting/review (all copy above, finalized with actual product/legal input on the consent strings in §8.4) — 1–2 days
- Delegator-side UI: unlinked-member state in `DelegateDropdown.tsx`, invite-sent state, empty-state copy — 1–2 days (rides on Phase 0)
- Delegatee-side UI: first-delegation banner (one-time, dismissible, needs a small persisted "seen" flag — likely a new boolean column or a lightweight `user_ui_state` table if one doesn't exist) + help panel content — 1–2 days (rides on Phase 1)
- Inline badges/tooltips (`DelegatedBadge.tsx`, "Waiting on Alex" chip + tooltip) — 1 day (rides on Phase 1/2, since it needs `active_delegation_id` and the sync triggers to show accurate "since when" data)
- Settings → Connections page/section for visibility into linked accounts — 1–2 days (rides on Phase 0, but can ship slightly after initial launch if needed)
- Changelog entry — copy only, <1 day, ships at Phase 4 launch

### 8.7 How this folds into the phased plan

- **Phase 0 (account linking):** must include the invite email copy (§8.4 Moment 1), the claim confirmation screen copy (§8.4 Moment 2), and the Settings → Connections surface. Do not ship Phase 0 without these — an account-linking flow with no consent framing is exactly the dark-pattern risk flagged in §7.3, and retrofitting consent copy after users have already been silently linked is not an acceptable fallback.
- **Phase 1 (delegation core):** must include the delegator-side unlinked-member state/invite-from-dropdown flow (§8.1B/C) and the delegatee-side first-delegation banner + inline origin badge (§8.2A, §8.3) — these are load-bearing parts of the UI, not polish, since without them the feature ships mechanically functional but silently confusing (a random item appearing in someone's inbox with no explanation is itself a trust problem, independent of the RLS being correct).
- **Phase 2 (two-way sync):** the "Waiting on Alex · since when" tooltip (§8.3) depends on sync data being accurate, so finalize its copy/behavior here once `completed_at`/timestamps are reliably populated.
- **Phase 4 (testing/rollout):** the changelog entry (§8.5) ships at general availability, not before — don't announce the feature in a changelog until Phase 0–3 are all live, or the changelog will point users at a feature that isn't fully usable yet (e.g., they'd read about 1:1 surfacing before Phase 3 lands).

---

## 9. Incremental steps and effort estimates

Total: **8.5–11 weeks** (revised from 8–10 weeks to fold in §8's onboarding/education work, which is not free even though it's cheap relative to the schema/RLS effort). If Phase 0 is descoped/already exists by the time this is picked up, the remaining phases alone are a good match for the original 6–8 week estimate plus a small education-copy tail.

**Phase 0 — Account-linking prerequisite (2–3 weeks)**
- Schema + RLS for `linked_user_id` and `cos_team_member_invites` (2–3 days)
- Invite/claim edge function + email send (reuse existing email infra if any — investigate) (3–4 days)
- Claim UI page + linking-status affordance in `DelegateDropdown` and team-member management UI (3–4 days)
- **Invite email copy, claim confirmation consent screen copy, Settings → Connections surface (§8.4, §8.7)** (1–2 days)
- Testing: RLS tests for invite claiming, enumeration-safety review (3–4 days)

**Phase 1 — Cross-user delegation core (2.5–3.5 weeks)**
- `inbox_item_delegations` schema + RLS + `inbox_items` additive policy + `active_delegation_id` column (3–4 days)
- `delegate-inbox-item-to-person` edge function, including the relationship-validation check from §7.1 (3–4 days)
- Wire `Inbox.tsx` person-delegation branch, delegator-side "Waiting on Alex" UI, delegatee-side incoming-delegation UI/badge (4–5 days)
- `useInboxItemDelegation.ts` hook + realtime wiring (2 days)
- **Unlinked-member dropdown state + invite-from-dropdown, first-delegation banner + help panel, origin badge (§8.1, §8.2, §8.3, §8.7)** (2–3 days)

**Phase 2 — Two-way status sync (1–1.5 weeks)**
- Trigger functions for both directions (§4) (3–4 days)
- Realtime propagation + UI polish for live "Alex marked this done" updates (2–3 days)
- **"Waiting on Alex · since when" tooltip finalized against real sync timestamps (§8.3, §8.7)** (folded into the UI polish above, no separate line item)

**Phase 3 — 1:1 agenda surfacing (1–1.5 weeks)**
- `team_member_id` wiring end-to-end from `DelegateDropdown` selection through to `inbox_item_delegations` (1 day — mostly already covered by Phase 1 schema)
- Prep-generation pipeline edit to inject open delegations (§5 Option A) (3–4 days)
- Validate rendering in the actual prep content/UI (1–2 days)

**Phase 4 — Testing hardening + rollout (1–1.5 weeks)**
- Full RLS negative-test suite (§10) (3–4 days)
- E2E delegation flow test (delegate → delegatee sees it → completes → delegator sees update) (2 days)
- Staged rollout behind a feature flag if the codebase has one (check for existing flag infra); otherwise gate behind the Phase 0 linking requirement itself as a natural rollout limiter (1 day)
- **Changelog/"what's new" entry (§8.5), published only once Phases 0–3 are live (§8.7)** (<1 day)

Suggest sequencing Phase 0 as a distinct, separately-approvable project given its own risk surface (invite emails, account claiming) — it is not "just a column."

---

## 10. Testing requirements

RLS correctness is the top priority here — this is the first genuinely multi-tenant read/write path in the inbox module, and the existing test suite (per `src/test/lib/inboxValidation.test.ts`) covers validation, not cross-user RLS.

### RLS policy tests (critical — must be negative-tested, not just happy-path)
- User B (no delegation relationship to User A) **cannot** SELECT any of User A's `inbox_items` rows, before and after this feature ships (regression guard on the existing single-owner policy).
- User B **cannot** SELECT an `inbox_item_delegations` row where they are neither `delegator_user_id` nor `delegatee_user_id`.
- Delegatee **can** SELECT the source `inbox_items` row once delegated, but **cannot** UPDATE or DELETE it.
- Delegatee **cannot** SELECT the source item once the delegation is `cancelled` (verifies the `status <> 'cancelled'` clause actually takes effect).
- Delegator **cannot** directly UPDATE the delegatee's copy of the item (their own `user_id` grant doesn't extend to a row owned by someone else — this should already be blocked by the existing base policy, but must be explicitly tested given the new relationship).
- A user who is a `cos_team_members.linked_user_id` for manager X **cannot** be delegated to via a `cos_team_members` row owned by manager Y unless a separate linking relationship exists for Y too (guards against ID-reuse/confusion bugs in the edge function's validation, not RLS itself, but should be an integration test against the edge function).
- Attempting to create an `inbox_item_delegations` row via direct table insert (bypassing the edge function) with a `delegatee_user_id` that has no corresponding `linked_user_id` relationship to the delegator's `cos_team_members` should be rejected — decide whether this validation belongs in a DB constraint/trigger (defense in depth) or is edge-function-only (weaker); recommend adding a DB-level check via a trigger that re-validates the relationship, since RLS alone (`auth.uid() = delegator_user_id`) does not enforce relationship legitimacy.

### Functional / integration tests
- Full delegation lifecycle: create delegation → delegatee's copy appears in their inbox with correct fields (title copied, `body` NOT copied per §7.2, `note` present) → delegatee marks done → delegator's item transitions correctly (§4) → both sides reflect final state.
- Cancellation: delegator cancels → delegatee's copy is archived/removed appropriately, no orphaned actionable item left in their inbox.
- Realtime: both parties see live updates without a page refresh (mirrors the existing pattern tested implicitly by `useInboxDelegation.ts`'s realtime subscription — add explicit coverage this time).
- Attempting to delegate to a `cos_team_members` row with no `linked_user_id` shows the correct "invite them first" UI state and the edge function rejects the request with a clear error.
- Un-linking mid-flight: verify existing delegations keep working per §7.6, new ones are blocked.

### E2E (Playwright, per existing `npm run test:e2e` infra)
- Two-browser-context test: User A delegates an item to User B (pre-linked fixture accounts) → switch context to User B, confirm item appears in their inbox → User B marks done → switch back to User A, confirm "Waiting on" item updates without refresh.
- Invite-and-claim flow E2E for Phase 0.

### Manual/security review
- Have someone attempt the enumeration/privacy attacks described in §7 directly (try to infer whether an email belongs to an account via invite flow timing/response differences) before shipping Phase 0.
- Confirm `body` is genuinely excluded from the copied delegatee item by inspecting actual payloads, not just code review (edge function output, not just source).

---

## Open questions for the approving human

1. Is Phase 0 (account linking) in scope for this initiative, or should it be spun out as its own approved project first? This plan estimates it at 2–3 weeks and it's the part most exposed to consent/privacy scrutiny.
2. Option A vs B for account linking (§2) — recommend B (explicit invite/claim), but this trades off against the "viral growth mechanic" goal's desire for low friction. Worth a explicit product call.
3. Exact `workflow_status` / annotation UX for the delegator's row once delegated (§6) — reuse the existing `'Waiting on someone'` string or introduce a live-linked `active_delegation_id` (recommended)?
4. 1:1 agenda surfacing: ship as prep-content injection now (Option A, §5) and accept it's one-directional/manager-only, or wait and build the structured agenda table (Option B) so the direct report also sees it on their own side? Recommend A now, but flag that "shared 1:1 agenda" as worded in the brief implies both people see it, which A alone does not deliver until Phase 0's Option B extension is also built.
