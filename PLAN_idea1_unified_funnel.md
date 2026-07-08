# Idea #1: Unified Funnel — Meeting & 1:1 Action Items → Inbox

Status: **PLAN ONLY — no feature code written.** Pending approval.

## 1. Grounding: what actually exists today

There are **three** separate "action item" surfaces, not two, and they are shaped very
differently. This matters a lot for scoping the first PR.

### 1a. `inbox_items` (the destination)

`supabase/migrations/20260713000001_inbox_tables.sql:21-38`, hook `src/hooks/useInboxItems.ts`,
types in `src/types/inbox.ts`.

- `user_id` (owner, RLS-scoped 1:1 to `auth.users`)
- `type`: `task | note | agent_nudge | agent_question | meeting_insight | brief_item`
- `status`: `open | done | archived | snoozed`, plus `done_at` / `archived_at` / `snoozed_until`
- `source_ref jsonb`: `{ type, id }` — **already the dedupe/link mechanism used today**
- `bucket`: `now | next | later | NULL`
- `workflow_status`: `Do Now | Not started | Work in progress | Waiting on someone | Blocked | NULL`
- `agent_payload jsonb`, `pinned`, `priority_due_at`, `priority_fixed`, `tag_suggestions`

`SourceRef.type` (`src/types/inbox.ts:58-61`) is currently a **closed union**:
`'zoom_recording' | 'dci_brief' | 'dci_weekly_brief' | 'calendar' | 'manual'`. It must be
extended for this feature (see File Changes).

**Existing dedupe precedent to copy** — `syncBriefToInbox` in
`src/hooks/useInboxItems.ts:250-301`: look up an existing row with
`.eq('type', 'brief_item').contains('source_ref', { type, id }).maybeSingle()`; if found,
`update()` in place; if not, `insert()`. This is the exact pattern the new sync should reuse
(jsonb `@>` containment query via `.contains()`), because `source_ref` has no unique index
today and Realtime filters can't reference jsonb fields at all (see §4).

### 1b. `meeting_series_action_items` (team meeting action items)

`supabase/migrations/20251017001000_create_tables.sql:59-70`, plus later ALTERs. No dedicated
hook — all CRUD is inline in `src/components/meeting/ActionItems.tsx` and
`src/pages/TeamMeeting.tsx`.

- `series_id`, `title`, `notes`, `assigned_to`, `due_date`, `order_index`, `created_by`
- `assigned_to` **is a real FK to `profiles.id`** (added in
  `supabase/migrations/20251022200000_fix_assigned_to_foreign_keys.sql:22-25`,
  `ON DELETE SET NULL`) — so it directly identifies which user's inbox to write to.
- `completion_status` enum (`supabase/migrations/20251017001100_phase1_type_safety.sql:3`):
  `'completed' | 'not_completed' | 'pending'`.
- `completed_at` + a `BEFORE UPDATE` trigger `set_action_item_completed_at()`
  (`supabase/migrations/20251117010000_add_completed_at_to_action_items.sql:26-41`) that
  stamps/clears `completed_at` when `completion_status` flips to/from `'completed'`. This is
  the exact trigger pattern to imitate for the new sync trigger.
- **No `team_id` column** — only `series_id`. RLS
  (`supabase/migrations/20251023004000_fix_action_items_rls_policy.sql`) allows any
  authenticated user to `SELECT` all rows; `INSERT`/`UPDATE`/`DELETE` gated by
  `created_by = auth.uid()` only (not `assigned_to`). **This is a gap**: today the assignee
  cannot toggle completion via RLS unless they're also `created_by`. Confirmed against
  `ActionItems.tsx:392-412`'s `isOwner` check (`assigned_to === currentUserId ||
  created_by === currentUserId`) plus an admin bypass — the app-level check is more permissive
  than the DB RLS. A trigger/edge function that updates this table on behalf of an assignee
  who isn't `created_by` must run as `service_role` (bypassing RLS) or the RLS policy needs a
  companion migration. **Flagging this as a prerequisite, not an assumption.**
- Realtime: subscribed via generic `useRealtimeSubscription` in
  `src/hooks/useMeetingRealtime.ts:83-99`, filtered by `series_id=eq.${seriesId}`.

### 1c. `cos_meeting_actions` (1:1 prep "commitments" — this is the real 1:1 analog, not `cos_one_on_one_prep.content`)

This is the most important finding of the investigation. The task brief named
`cos_one_on_one_prep` (a markdown blob) as the 1:1 source, but the actual UI checklist in the
1:1 prep drawer is **backed by a separate, already-structured table**:
`supabase/migrations/20260424000000_add_cos_prep_inputs.sql:2-19`, later extended by
`supabase/migrations/20260620000000_relationship_memory_agent_foundation.sql:100-128` and
`supabase/migrations/20260704000000_add_cos_meeting_action_owner.sql`.

- `user_id` (the manager/CoS user — already personal-inbox-shaped, unlike
  `meeting_series_action_items`), `member_id` (the report), `text`, `due_date`,
  `status`: `pending | done | cancelled`, `completed_at`
- `owner`: `'them' | 'me'` — **`owner = 'me'` rows are literally "to-dos for me" from the 1:1.**
  This is exactly the "to-dos for me" concept the task brief asked about — it already exists
  as a first-class column, not something that needs to be parsed out of
  `cos_one_on_one_prep.content` (which remains unstructured markdown with no to-do parsing
  today — confirmed via `parsePrepMarkdown()` in
  `src/components/cos/OneOnOnePrepDrawer.tsx:102-143`, which only extracts heading/bullet
  sections for talking points, not action items).
- Rendered/toggled in `src/components/cos/OneOnOnePrepDrawer.tsx`:
  - Loaded on drawer open: lines 307-313 (`select id, text, created_at, due_date, owner`
    `.eq('member_id', member.id).eq('status', 'pending')`)
  - Insert (owner='me'): `addMyCommitment()`, lines 545-563
  - Insert (owner='them'): `addAssignAction()`, lines 525-543
  - Toggle done: `toggleAction()`, lines 515-523 — `update({ status: nextDone ? 'done' :
    'pending' })`
  - Drawer close handler: passed in from `src/pages/ChiefOfStaff.tsx` as
    `onClose={() => setPrepSheet(null)}` — there is **no existing "on close, transfer to
    inbox" hook point**; one must be added to this `onClose` callback or to a `useEffect`
    keyed on the sheet's open→closed transition.
- Already has a `BEFORE UPDATE` trigger precedent to imitate:
  `cos_meeting_actions_set_completed_at()` /
  `cos_meeting_actions_completed_at` trigger
  (`20260620000000_relationship_memory_agent_foundation.sql:113-128`).
- RLS: simple `auth.uid() = user_id` ALL-policy — much cleaner than
  `meeting_series_action_items`, since `cos_meeting_actions` is already single-user-owned.

### 1d. `rc_tasks` (RCDO execution tasks — structurally similar, out of scope for v1 but noted for future extension)

`supabase/migrations/20251121224833_create_tasks_table.sql:4-19`, hook `src/hooks/useTasks.ts`.
`owner_user_id` is a direct `auth.users` FK (cleaner than `meeting_series_action_items`). No
`team_id` column directly; scoping flows through
`strategic_initiative_id → defining_objective → rallying_cry → cycle → team_id`. **Recommend
explicitly deferring this to a later idea** — the task brief didn't ask for it, and folding it
in now would triple the surface area of PR 1.

### 1e. Realtime constraint that shapes the whole design

`src/hooks/useRealtimeSubscription.ts:47-54` passes `filter` straight into Supabase Realtime's
`postgres_changes` filter, which **only supports a single `column=eq.value` comparison** — it
cannot filter on jsonb fields (`source_ref->>'id'=eq....` is not supported by Realtime). So:

- Realtime subscriptions on `inbox_items` can filter by `user_id=eq.${userId}` (cheap, already
  personal), but matching a specific `source_ref` back to a specific
  `meeting_series_action_items`/`cos_meeting_actions` row must happen **client-side** after
  the payload arrives (inspect `payload.new.source_ref`), not via the Realtime filter string.
- This is fine for the "inbox → source" sync direction (few rows per user). It's the reason
  the plan below uses **DB triggers**, not client realtime, for the authoritative write path,
  and reserves client realtime purely for **UI refresh**, not as the sync mechanism of record.

## 2. Design: where creation/sync happens

**Decision: DB triggers (`AFTER INSERT/UPDATE` on the source tables) do the writing into
`inbox_items`, not app-level hooks or an edge function.** Rationale:

- Action items get created/updated from multiple UI entry points already
  (`ActionItems.tsx`, `TeamMeeting.tsx`, `OneOnOnePrepDrawer.tsx`, plus any future entry point
  or bulk/import script). A DB trigger guarantees the inbox mirror happens regardless of which
  code path wrote the row — matches the existing `set_action_item_completed_at` /
  `cos_meeting_actions_set_completed_at` convention of pushing this kind of invariant into
  Postgres rather than duplicating it in every caller.
- Avoids a race between "app writes action item" and "app writes inbox item" as two separate
  network round-trips from the client (partial failure would desync the two tables).
- Two-way status sync is symmetric this way: a trigger on `inbox_items` pushes `done`/`open`
  back to the source table, and a trigger on the source table pushes `completion_status`/
  `status` changes into `inbox_items` — both directions are single-transaction, atomic,
  server-side.

**Guard against infinite trigger ping-pong**: each trigger function must check whether the
incoming change *already matches* the target value before writing (e.g., "only push `done` to
`inbox_items` if it isn't already `done`") — same idempotency guard already used in
`set_action_item_completed_at` (`IF NEW.completion_status = 'completed' AND OLD... !=
'completed'`). Additionally, each cross-table write should use a session-local flag
(`pg_notify`/`current_setting` guard, e.g. `SET LOCAL app.skip_inbox_sync = true`) or simply
rely on the "already matches → no-op" check, which is sufficient here since both directions
converge to the same two states (open/done) and Postgres won't re-fire a trigger for a write
that doesn't change the row (`UPDATE ... WHERE status IS DISTINCT FROM ...` pattern, or check
inside the trigger body as the existing convention does).

### Dedupe (avoid duplicate inbox items on re-save)

Follow the `syncBriefToInbox` precedent but push it into SQL:

```
source_ref = jsonb_build_object('type', 'meeting_action_item', 'id', NEW.id::text)
```
or
```
source_ref = jsonb_build_object('type', 'cos_meeting_action', 'id', NEW.id::text)
```

Since `source_ref` is unindexed jsonb, add a **partial expression index** for the lookup the
trigger performs on every write:

```sql
CREATE INDEX inbox_items_source_ref_meeting_action
  ON inbox_items ((source_ref->>'id'))
  WHERE source_ref->>'type' = 'meeting_action_item';
CREATE INDEX inbox_items_source_ref_cos_action
  ON inbox_items ((source_ref->>'id'))
  WHERE source_ref->>'type' = 'cos_meeting_action';
```

Trigger logic (`INSERT ... ON CONFLICT` isn't usable without a real unique constraint, so use
`SELECT ... FOR UPDATE` + branch, matching the app-level `maybeSingle()` → insert-or-update
pattern):

1. On `meeting_series_action_items` `AFTER INSERT OR UPDATE`, when `NEW.assigned_to IS NOT
   NULL`:
   - Look up existing `inbox_items` row where `source_ref->>'type' = 'meeting_action_item'
     AND source_ref->>'id' = NEW.id::text AND user_id = NEW.assigned_to`.
   - If found: update `text`, `body` (from `notes`), `status` (mapped from
     `completion_status`), `done_at`.
   - If not found: insert a new `inbox_items` row (`type = 'task'`, `bucket = NULL`,
     `workflow_status = NULL` — see defaults discussion in §3).
   - **Re-assignment edge case**: if `assigned_to` changed from user A to user B, the trigger
     must also either delete/archive A's mirrored inbox item or leave it (see §3 risks) —
     recommend archiving A's copy and creating a fresh one for B.
2. On `cos_meeting_actions` `AFTER INSERT OR UPDATE`, when `NEW.owner = 'me'`:
   - Same lookup/insert/update pattern, `source_ref.type = 'cos_meeting_action'`.
   - `owner = 'them'` rows are explicitly excluded — those are the report's to-dos, not the
     current user's, and have no `assigned_to`/user mapping to sync to (the "them" person may
     not even be an app user — `member_id` points to `cos_team_members`, not `auth.users`).
3. On `inbox_items` `AFTER UPDATE` where `source_ref->>'type' IN ('meeting_action_item',
   'cos_meeting_action')` and `status` changed to/from `'done'`:
   - Push `completion_status`/`status` back to the source row keyed by `source_ref->>'id'`.
   - If the source row no longer exists (deleted), no-op silently (see §3).

### "Closing the 1:1 prep drawer transfers to-dos for me" — reframed

Because `cos_meeting_actions` rows with `owner = 'me'` are already synced into the inbox by
the trigger above **at insert/update time** (i.e., the moment the user clicks "Add for me" in
`addMyCommitment()`), there is no meaningful additional "on close, transfer" step needed at the
DB layer — the sync is already live per-item. What "closing the drawer" should still do at the
**app layer** (not DB) is:

- A one-time **toast/confirmation** ("3 items added to your inbox") when the drawer closes, if
  new `owner='me'` items were added during the session — purely a UX nicety, implemented as a
  `useEffect` on the drawer's open→close transition that counts items created this session,
  not a data-sync mechanism.
- No new backend logic is required for the close event itself; flagging this so the plan isn't
  over-built.

## 3. Files to change / create

### Database (new migrations — `supabase/migrations/`, timestamp-prefixed per convention)

| File (new) | Change |
|---|---|
| `supabase/migrations/<ts>_inbox_source_ref_meeting_action_indexes.sql` | Adds the two partial expression indexes on `inbox_items` for `source_ref->>'id'` lookups (one per source type). |
| `supabase/migrations/<ts>_meeting_action_items_inbox_sync.sql` | `CREATE OR REPLACE FUNCTION sync_meeting_action_item_to_inbox()` + `AFTER INSERT OR UPDATE` trigger on `meeting_series_action_items`. Also fixes the RLS gap noted in §1b: add an `UPDATE` policy allowing `assigned_to = auth.uid()` (not just `created_by`) so the assignee can complete their own item without the trigger requiring `service_role` for that specific case — or explicitly document that this trigger function must be `SECURITY DEFINER` to bypass RLS, whichever the team prefers (recommend `SECURITY DEFINER`, scoped tightly, since changing RLS also changes app-level behavior in `ActionItems.tsx` beyond this feature). |
| `supabase/migrations/<ts>_cos_meeting_actions_inbox_sync.sql` | `CREATE OR REPLACE FUNCTION sync_cos_meeting_action_to_inbox()` + `AFTER INSERT OR UPDATE` trigger on `cos_meeting_actions`, scoped to `owner = 'me'`. |
| `supabase/migrations/<ts>_inbox_items_reverse_sync.sql` | `CREATE OR REPLACE FUNCTION sync_inbox_item_status_to_source()` + `AFTER UPDATE` trigger on `inbox_items`, scoped to rows with a recognized `source_ref.type`. Branches by type to update either `meeting_series_action_items.completion_status` or `cos_meeting_actions.status`. |
| `supabase/migrations/<ts>_meeting_action_items_deletion_handling.sql` | `BEFORE DELETE` trigger on `meeting_series_action_items` (and one on `cos_meeting_actions`) that archives (not deletes) the mirrored `inbox_items` row — see §4 deletion risk. |

### Types

| File | Change |
|---|---|
| `src/types/inbox.ts` | Extend `SourceRef['type']` union to add `'meeting_action_item' \| 'cos_meeting_action'`. Update the doc comment above `AgentPayload`/`SourceRef` if one exists to note the new source kinds. |
| `src/integrations/supabase/types.ts` | Regenerate via Supabase MCP (`generate_typescript_types`, project pxirfndomjlqpkwfpqxq) after migrations land — per existing team convention (see user memory: committed types lag live schema; Docker-down workaround documented). Do this once per migration batch, not per file. |

### Frontend hooks (mostly additive; existing hooks are read-heavy)

| File | Change |
|---|---|
| `src/hooks/useInboxItems.ts` | No required change for the trigger-based flow (the DB writes rows directly), but add a `rowToItem` compatibility check for the two new `source_ref.type` values so any inbox UI that switches on `source_ref.type` (e.g., an icon or "jump to source" deep link) renders sensibly. Optionally add a small helper `getSourceLink(item.source_ref)` returning a route (`/my-meetings?series=...` or a 1:1 deep link) for the "open in source" affordance. |
| `src/hooks/useMeetingRealtime.ts` | No change required for sync (DB trigger handles it), but if the inbox is open in another tab while a meeting is live, no action needed since `inbox_items` gets its own realtime subscription (see next row). |
| New: `src/hooks/useInboxSourceSync.ts` (optional, only if product wants live inbox-badge updates without a full poll) | Thin wrapper around `useRealtimeSubscription` filtered on `inbox_items` by `user_id=eq.${userId}`, purely for UI refresh (e.g., updating a sidebar unread count) — **not** the sync mechanism itself, since that's DB-side. Skippable for v1 if `useInboxItems`'s existing fetch-on-mount + manual refresh is acceptable. |

### Frontend components

| File | Change |
|---|---|
| `src/components/meeting/ActionItems.tsx` | No functional change required — the trigger observes the same `assigned_to`/`completion_status` writes this component already makes. Optional: add a small "synced to inbox" indicator if assigned to the current user (nice-to-have, not required for v1). |
| `src/components/cos/OneOnOnePrepDrawer.tsx` | No functional change required for the sync itself. Add the optional close-toast described in §2 ("N items added to your inbox") — a `useEffect`/ref tracking `owner==='me'` inserts made during the session, firing the toast in the `Sheet`'s `onOpenChange={o => { if (!o) onClose(); }}` handler (line 759) or in `onClose` itself. |
| `src/pages/Inbox.tsx` / inbox item rendering (find the item-row component, likely under `src/components/inbox/`) | Add a small source badge/icon for `type: 'meeting_action_item'` and `'cos_meeting_action'`, and make the item clickable to deep-link back to the meeting series or 1:1 drawer, mirroring how other `source_ref` types are (or aren't) surfaced today — check `src/components/inbox/InboxItemDrawer.tsx` for the existing pattern before adding a new one. |

### Edge functions

None required for v1 — everything is DB-trigger-driven, consistent with the constraint in the
task brief ("this should mostly be triggers/hooks... not new tables"). No new edge function is
needed unless the team later wants Slack/email notifications on sync, which is out of scope
here.

### Tests

See §7.

## 4. Risks and edge cases

1. **Source row deleted.** `meeting_series_action_items.assigned_to` has `ON DELETE SET NULL`
   only for the *user* FK, not for the row itself — but the row can still be hard-deleted
   directly (no soft-delete column on either source table). If a `meeting_series_action_items`
   or `cos_meeting_actions` row is deleted while its mirrored `inbox_items` row still exists:
   - **Decision: archive, don't delete, the inbox item** (`status = 'archived'`,
     `archived_at = now()`), via a `BEFORE DELETE` trigger on the source table. Deleting the
     inbox item outright would be surprising if the user had already started acting on it
     (e.g., added notes in `body`); archiving preserves history and matches the existing
     `archived` status semantics.
   - The reverse-sync trigger (§2, item 3) must tolerate the source row being gone (its
     `UPDATE ... WHERE id = ...` will simply affect 0 rows — must not raise an error).
2. **Re-assignment.** If `meeting_series_action_items.assigned_to` changes from user A to user
   B after the item was already mirrored to A's inbox: archive A's mirrored item and create a
   fresh one for B (§2, item 1). Without this, A keeps a stale inbox item forever and B never
   gets one.
3. **`bucket` / `workflow_status` defaults for auto-created items.** Per the existing
   `syncBriefToInbox` precedent (`useInboxItems.ts:289`), brief-synced items default
   `bucket = 'now'`. For meeting/1:1 action items, recommend **`bucket = NULL`,
   `workflow_status = NULL`** (i.e., land in the default/unsorted view, not force-pinned to
   "Now") — these are pre-existing commitments of varying urgency, not fresh brief priorities,
   and forcing them all into "Now" would flood that bucket. Product should confirm this
   default before implementation; it's called out explicitly here because the two existing
   precedents (`brief_item` → `now`, manual create → `NULL`) disagree, and this feature is
   closer to manual creation than brief-generation.
4. **RLS / privilege boundary.** As detailed in §1b/§3, `meeting_series_action_items`'s RLS
   currently permits `UPDATE` only for `created_by = auth.uid()`, but the assignee (not
   necessarily the creator) is who completes items in the UI today via an app-level check that
   is *more* permissive than RLS — meaning either RLS already has a latent gap the app
   silently works around via a service-role path, or `ActionItems.tsx`'s update call is
   currently failing RLS for non-creator assignees and only "working" for
   creator-is-also-assignee cases in practice. **This needs verification against the live DB
   before writing the trigger**, since a `SECURITY DEFINER` trigger function can mask (but not
   fix) an underlying RLS bug. Recommend a quick manual check (assign an item to someone else,
   have them try to check it off) as step 0 of implementation.
5. **Double-write loops.** Covered in §2 — guarded via "no-op if already matching" checks in
   both trigger directions, following the existing `IF NEW.x = 'y' AND OLD.x != 'y'` idiom.
6. **`cos_meeting_actions.member_id` people who aren't app users.** `owner = 'them'` rows
   reference `cos_team_members`, which may not correspond to any `auth.users` row at all (many
   CoS "team members" are reports without app logins). This is why `owner = 'them'` is
   explicitly excluded from the sync (§2) — there is no inbox to sync into for a non-user.
7. **Multiple inbox items per source row across retries.** If the dedupe lookup and insert
   aren't in the same transaction as the triggering `INSERT`/`UPDATE` (they will be, since
   triggers run inside the same transaction as the statement that fired them), there's no
   TOCTOU race from concurrent app requests for the *same* row — Postgres row-level locking
   inside the trigger's `SELECT ... FOR UPDATE` (or simply relying on trigger atomicity) is
   sufficient. Flagging only because the JS-side `syncBriefToInbox` precedent has a real
   (if narrow) race between its `maybeSingle()` read and its later `insert()`/`update()` since
   those are two separate network round-trips from the client — the DB-trigger design avoids
   inheriting that race.
8. **`notes` (meeting action items) vs `body` (inbox) length/format mismatch.** `notes` is
   free text; `inboxValidation.ts` has `validateItemBody()` with length/control-char rules
   enforced at the app layer for user-typed inbox items. A DB trigger bypasses that JS
   validation entirely. Decide whether to (a) leave DB-inserted `body` unvalidated (simplest,
   since the source text was already accepted by its own form), or (b) mirror the same
   truncation rule in SQL. Recommend (a) for v1 — don't duplicate app validation in SQL for a
   trusted internal sync path.
9. **Team-scoping mismatch.** `inbox_items` RLS is `user_id`-only (no team concept), while
   `meeting_series_action_items` has no team_id at all and `cos_meeting_actions` is also
   user-scoped — so there's no cross-team leakage risk here, but it's worth confirming that
   `assigned_to`/`user_id` on the source tables always resolves to a user who is a legitimate
   member of whatever team the meeting/1:1 belongs to (should already be guaranteed by
   existing app logic that populates the assignee dropdown from team members).

## 5. Ordered implementation steps (sized for incremental PRs)

1. **PR 0 — Spike/verify RLS gap (no code merge, just findings).** Manually confirm whether
   non-creator assignees can currently update `meeting_series_action_items.completion_status`
   under RLS. Decide whether the sync trigger needs `SECURITY DEFINER` or whether an RLS policy
   fix ships alongside it. *Effort: 1-2 hours.*
2. **PR 1 — One-way sync: `cos_meeting_actions` (owner='me') → `inbox_items`.** Smallest,
   cleanest surface (already user-scoped, simple RLS, no team ambiguity). Ship: the
   `sync_cos_meeting_action_to_inbox()` trigger, the partial index, the `SourceRef` type
   extension, and regenerated Supabase types. No reverse sync yet — just create/update on
   insert. *Effort: 0.5-1 day.*
3. **PR 2 — Reverse sync for `cos_meeting_actions`.** Add the `inbox_items → cos_meeting_actions`
   direction (toggling done in the inbox marks the 1:1 commitment done, and vice versa — the
   forward direction from PR 1 already handles source→inbox). Include the "no-op if already
   matching" idempotency guard and the deletion-handling (archive-on-delete) trigger for this
   table. *Effort: 1 day.*
4. **PR 3 — Extend to `meeting_series_action_items` (forward sync only).** Same pattern as PR 1
   but for the meeting table, including the RLS decision from PR 0. Handle the re-assignment
   edge case (archive old assignee's item, create new one for new assignee). *Effort: 1-1.5
   days (more edge cases than PR 1: no user-only RLS, re-assignment, `ON DELETE SET NULL`
   semantics).*
5. **PR 4 — Reverse sync + deletion handling for `meeting_series_action_items`.** Mirrors PR 2
   for this table. *Effort: 1 day.*
6. **PR 5 — Frontend polish.** Source badges/deep-links in the inbox item list/drawer
   (`src/components/inbox/`), the optional "N items added to your inbox" toast on 1:1 drawer
   close, and the optional `bucket`/`workflow_status` product decision from §3 item 3 applied
   consistently. *Effort: 1 day.*
7. **PR 6 — Onboarding & user education (see §6).** First-run empty-state copy, source
   tooltips, two-way-sync trust affordance, the one-time announcement banner, and the
   changelog/"what's new" entry. Ship this in the **same release** as PR 1 (or PR 3, whichever
   ships first) rather than after — an auto-created inbox item with no explanation is the
   single biggest trust risk in this feature, per the coordinator's explicit ask that every
   plan bake in in-product education rather than bolt it on later. *Effort: 1-1.5 days.*
8. **PR 7 (stretch, only if product wants it) — `useInboxSourceSync` realtime UI refresh** for
   live badge counts without requiring a manual inbox refresh. *Effort: 0.5 day.*

Total: roughly **6.5-8 engineering days** across 7-8 small PRs, each independently shippable
and revertable. PR 1 and PR 3 could theoretically run in parallel if two engineers are
available, since they touch disjoint tables. PR 6 (education) should land alongside PR 1, not
at the end — see §6 for why sequencing this last is a risk in itself.

## 6. Onboarding & User Education

**Why this section exists:** the user approved this idea (and the other 8 in this batch) from
a one-paragraph summary, not a mockup. Nobody outside engineering will see an auto-created
inbox item and instinctively know it's a *feature* rather than a bug, a duplicate, or a sync
glitch. This section is not a nice-to-have appended to the plan — it is the mechanism by which
the person who approved "auto-flow meeting/1:1 action items into the inbox" actually gets to
see and understand the thing they approved, and by which end users don't file a support ticket
the first time it happens.

Grounding: today, `InboxItemDrawer.tsx:169-181` renders `source_ref` as a single unstyled line
— `<li>From {item.source_ref.type.replace('_', ' ')}</li>` — with no link, no icon, no
tooltip, and no mention that completing the item anywhere else will keep it in sync. That line
is the entire current "explanation" surface for `source_ref`, and it's insufficient for a
feature whose core value proposition is trust in an automated, bidirectional sync the user
didn't initiate by hand.

### 6.1 First-run / empty-state: the first auto-created item a user sees

The moment that matters most is the **first** time an inbox item appears that the user didn't
type themselves. If this is unexplained, it reads as a bug.

- **New visual treatment on the inbox item row** (`src/components/inbox/InboxItemRow.tsx`) for
  any item whose `source_ref.type` is `meeting_action_item` or `cos_meeting_action`: a small
  colored source chip (reuse the existing tag-pill visual language from
  `src/components/inbox/InboxTagPill.tsx` rather than inventing a new component) reading
  **"From [Meeting Name]"** or **"From your 1:1 with [Name]"**, not just a generic "task" row.
  This is the difference between "where did this come from?!" and instant recognition.
- **One-time inline callout**, shown only above the *first* auto-synced item a given user ever
  receives (tracked via a new boolean, e.g. a `has_seen_auto_sync_intro` flag on the user's
  settings row, or a `localStorage` flag if there's no cheap settings table to piggyback on —
  check `cos_prep_settings`/profile-level settings tables for an existing "seen X" pattern
  before adding a new column). Draft copy:

  > **This showed up automatically.** `[icon]`
  > We noticed an action item assigned to you in **[Weekly Sync]** and added it here so it
  > doesn't get lost in meeting notes. Check it off here or in the meeting — either way, it'll
  > stay in sync.
  > `[Got it]`  `[Don't show this again]` *(same action — this is a single-dismiss card, not
  > a real preference toggle)*

- **Empty-state copy update**: if `src/pages/Inbox.tsx` (or wherever the zero-items empty
  state lives — check `AccountabilityIllustration.tsx`, which looks like the existing
  empty-state illustration component) currently implies the inbox is purely a manual capture
  tool, add a line so first-time users don't need to discover the auto-sync by accident:

  > "Your inbox isn't just for things you type here — action items assigned to you in meetings
  > and 1:1s show up automatically too."

### 6.2 Inline hovers / tooltips (ongoing, not just first-run)

Three distinct trust questions need a permanent (not one-time) affordance, because a new user
will hit each of these on day 30 just as much as day 1:

1. **"Where did this come from, and can I go look at it?"** — The `source_ref` line in
   `InboxItemDrawer.tsx:177-179` needs to become a real link, not static text. Change:
   ```
   <li>From {item.source_ref.type.replace('_', ' ')}</li>
   ```
   to a clickable row that deep-links to the originating meeting series
   (`/my-meetings?series=...`) or opens the 1:1 prep drawer for the relevant team member,
   with hover title text: `title="Open the meeting this came from"` /
   `title="Open your 1:1 prep with {name}"`. This is the same `getSourceLink()` helper already
   scoped in §3's file-change table for `useInboxItems.ts` — education and engineering share
   this one function.
2. **"If I check this off here, does it actually close the loop back there?"** — This is the
   single highest-trust-risk moment in the whole feature. Add a small inline hint the first
   few times a user completes a *synced* item (not a manually-created one), e.g. a toast on
   completion:
   > "Done — this is also marked complete in **[Weekly Sync]**."
   Implementation: fire this toast conditionally in the inbox's existing complete/toggle
   handler only when `item.source_ref?.type` is one of the two new sync types, for roughly the
   first 3-5 times per user (track via the same lightweight flag/counter as §6.1, or simply
   show it unconditionally for v1 — cheaper, and repetition reinforces trust rather than
   annoying since it's a one-line toast, not a modal).
3. **"Why does this thing I never typed have a due date/notes/assignee already filled in?"** —
   A small `(i)` info affordance next to the source chip (§6.1) with tooltip text:
   > "Synced from a meeting or 1:1 — editing the text or due date here updates it there too."
   This sets the expectation that the sync isn't one-way-then-frozen; it's live in both
   directions for status, and specifically **not** live for text/due-date edits made from the
   inbox side if that's the final engineering decision (the plan in §2/§3 only specifies status
   round-tripping, not full-field two-way sync) — **copy must match whatever the engineering
   decision ends up being here**, so this string should be finalized against the actual PR 2/4
   behavior, not written speculatively before that trigger logic is locked.

### 6.3 "What's new" callout / changelog entry (draft copy)

For whatever changelog/announcement surface this app uses (check for an existing
"What's New" panel — if `src/components/inbox/InboxAssistantPanel.tsx` or `InboxSidebar.tsx`
has a notifications/announcements slot, reuse it; otherwise this becomes a one-off banner per
§6.4). Draft entry:

> **Your to-dos now find you.**
>
> **Before:** action items assigned to you in a team meeting or a direct report's 1:1 prep
> stayed buried in that meeting's notes or that person's prep drawer — easy to lose track of
> unless you remembered to go back and check.
>
> **Now:** the moment something's assigned to you in a meeting or a 1:1, it shows up in your
> inbox automatically — no copy-pasting, no separate list to remember to check. Complete it
> from your inbox or from the original meeting/1:1 and both places stay in sync.
>
> Look for the **"From [meeting/1:1 name]"** tag on inbox items to see where something came
> from, and click it to jump back to the original conversation.

### 6.4 Progressive disclosure / day-one banner for existing users

This is distinct from §6.1's first-*item* callout — this is a one-time **feature announcement**
that should fire for existing users at rollout, independent of whether they've received a
synced item yet, so the behavior change is never a surprise:

- A dismissible top-of-inbox banner (reuse whatever banner primitive exists for other
  app-wide announcements — check for one before building a new one; `AgentBar.tsx` in
  `src/components/inbox/` is a plausible existing top-of-inbox real-estate owner worth checking
  first) shown once per user at rollout:

  > 🔗 **New: Meeting and 1:1 to-dos now sync to your inbox automatically.** Nothing you need
  > to set up — action items assigned to you will just start showing up here.
  > `[See how it works]` → opens/links to the §6.3 changelog entry `[Dismiss]`

- Gate this behind a simple `has_seen_unified_funnel_announcement` flag (same
  settings-flag mechanism as §6.1 — these two flags should probably live together rather than
  as two separate ad hoc columns; worth a single small `user_feature_announcements jsonb` or
  similar shared column if the team wants to avoid a new column per feature going forward,
  though that's a broader decision than this plan should force).
- This banner ships **before or simultaneously with** PR 1 (the first sync trigger going live)
  — never after. Shipping the sync silently and explaining it later is exactly the "surprising
  behavior change" this section exists to prevent.

### 6.5 UI touchpoints / files (education-specific)

| File | Change |
|---|---|
| `src/components/inbox/InboxItemRow.tsx` | Add source chip ("From [Meeting]" / "From your 1:1 with [Name]") for the two new `source_ref` types, styled via existing `InboxTagPill.tsx` conventions. |
| `src/components/inbox/InboxItemDrawer.tsx` | Replace the static `From {type}` line (169-181) with a clickable deep-link + hover tooltip; add the `(i)` sync-behavior tooltip near it. |
| `src/components/inbox/AccountabilityIllustration.tsx` (or wherever the empty state lives) | Add the one-line empty-state copy update from §6.1. |
| New: a small `AutoSyncIntroCallout` component (or fold into `InboxItemRow`/`InboxItemDrawer` conditionally) | Renders the one-time "This showed up automatically" card from §6.1. |
| `src/components/inbox/AgentBar.tsx` (or existing app-wide banner primitive, whichever is confirmed to exist) | Renders the one-time rollout announcement banner from §6.4. |
| Completion toggle handler in `useInboxItems.ts` / wherever the inbox checkbox click lives | Fires the "Done — also marked complete in [X]" toast from §6.2 for synced items. |
| Settings/profile table (exact table TBD — check for an existing "seen X" flag pattern first) | New boolean flag(s) gating the one-time callout (§6.1) and rollout banner (§6.4) so they don't re-show on every load. |
| Changelog/"What's New" surface (exact location TBD — confirm whether one exists before building one) | Add the §6.3 entry. |

*Effort: 1-1.5 days*, folded into PR 6 above. This is deliberately scoped as copy + small
conditional-rendering changes, not new infrastructure — the one open engineering question is
where the "has seen this" flags live, which should be resolved by checking existing
settings/profile tables (e.g. `cos_prep_settings`, `profiles`) before adding a new one.

## 7. What "thorough testing" should cover (enumerated, not written)

### Unit tests (Vitest) — SQL trigger logic via integration-style DB tests, plus any JS helpers

- `sync_cos_meeting_action_to_inbox()`:
  - Insert with `owner='me'` creates exactly one `inbox_items` row with correct `source_ref`.
  - Insert with `owner='them'` creates **no** inbox row.
  - Re-running the same update (no field changes) does not create a second inbox row
    (idempotent dedupe via `source_ref` lookup).
  - Updating `text`/`due_date` on the source row updates the existing mirrored inbox item
    in place (not a duplicate).
  - Toggling `status` to `'done'` sets `inbox_items.status = 'done'` and `done_at`.
- `sync_meeting_action_item_to_inbox()`:
  - Same create/update/dedupe cases as above, scoped by `assigned_to IS NOT NULL`.
  - Re-assignment from user A to user B archives A's inbox item and creates a fresh one for B.
  - Assignment cleared (`assigned_to` set to `NULL`) archives the previously-mirrored item.
- `sync_inbox_item_status_to_source()` (reverse direction):
  - Marking the inbox item `done` flips `completion_status`/`status` on the correct source row.
  - Marking it `archived` or `snoozed` does **not** flip source completion (only `done`/`open`
    round-trip).
  - No-op (no error, no row change) when the source row has been deleted.
- Deletion-handling triggers:
  - Deleting a `cos_meeting_actions` row archives (does not delete) its mirrored inbox item.
  - Deleting a `meeting_series_action_items` row archives its mirrored inbox item.
- Loop-guard: simulate a rapid inbox-update → source-update → inbox-update chain and assert it
  terminates after one round-trip (no infinite trigger recursion, no duplicate writes).
- `src/types/inbox.ts` / `rowToItem` mapper: new `source_ref.type` values parse without
  throwing and pass through the union check.

### E2E tests (Playwright) — full create → complete → sync round trips

- **1:1 flow:** Open a team member's 1:1 prep drawer → add a "for me" commitment via
  `addMyCommitment()` UI → close the drawer → open `/inbox` (or wherever `Inbox.tsx` is routed)
  → assert the item appears with the correct text and a source badge/link. Then mark it done
  in the inbox → reopen the 1:1 drawer → assert the commitment shows as done there too
  (bidirectional).
- **Meeting flow:** In a team meeting's action items panel, create an item assigned to the
  current test user → assert it appears in `/inbox` shortly after (poll or wait for
  realtime/refetch) → toggle completion in the meeting UI → assert inbox reflects `done` →
  toggle back to open from the **inbox** side → assert the meeting UI's checkbox unchecks.
- **Re-assignment:** Create an action item assigned to user A, verify it's in A's inbox;
  reassign to user B via the UI; verify it disappears (archived) from A's inbox and appears in
  B's.
- **Deletion:** Delete a meeting action item (or 1:1 commitment) from its source UI; verify the
  mirrored inbox item becomes `archived` rather than disappearing entirely, and that
  re-opening the inbox doesn't error.
- **No-duplicate-on-resave:** Edit an action item's title/notes multiple times in quick
  succession (simulating autosave); assert only one inbox item ever exists for that
  `source_ref`.
- **Cross-user isolation:** Confirm user B never sees an inbox item mirrored from an action
  item assigned to user A (RLS smoke test at the E2E layer, not just unit).

### Manual/exploratory checklist (pre-ship, not automated)

- Verify the RLS-gap finding from §4 item 4 against the actual deployed policies before
  merging PR 3/4 (not just local migrations).
- Confirm `bucket`/`workflow_status` defaults match whatever product decides in §3 item 3 by
  eyeballing the inbox with a handful of real synced items.
- Confirm Supabase-generated TypeScript types were regenerated and committed after each
  migration PR (per the team's existing convention of committed types lagging schema — see
  `memory/supabase_type_regen.md`).
