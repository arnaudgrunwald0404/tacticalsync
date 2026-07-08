# Plan: Finish the Dormant 20% (Inbox Idea #2)

Status: **proposal — no code written**. This document is for review/approval before implementation begins.

## 0. Grounding — what the brief got right and what changed on inspection

The brief was directionally correct but a few details differ from the current code, and matter for scoping:

1. **`inbox_items.snoozed_until`** — confirmed, `timestamptz`, nullable, no default, no index
   (`supabase/migrations/20260713000001_inbox_tables.sql:32`). Truly unused: no query or mutation
   in `src/hooks/useInboxItems.ts` reads or writes it.
2. **`inbox_views`** — confirmed schema (`supabase/migrations/20260713000001_inbox_tables.sql:61-74`):
   `id, user_id, name, filter_json jsonb, sort_json jsonb, is_starred bool, sort_order int, created_at`.
   RLS: single `auth.uid() = user_id` policy. No `useInboxViews` hook, no UI. Confirmed unused.
3. **"Quick search" input** — **correction**: the input in `InboxSidebar.tsx:604-618` is scoped to the
   **Meetings sub-tab** (`meetingsSearch` / `onMeetingsSearchChange` props), not the main inbox item
   list. There is **no search input at all** on the primary Inbox view today — this isn't a broken
   search, it's a missing one. Scope accordingly (build new UI, not "fix" existing UI).
4. **Keyboard shortcuts** — **correction**: there is no `onKeyDown` handler for row navigation anywhere.
   `InboxItemRow.tsx:195-198` only has `Enter`/`Escape` handling for the inline text-edit input. A
   repo-wide grep for shortcut documentation/cheat-sheets/help overlays (j/k/e/d, "next item",
   "mark done", etc.) found **nothing** — no modal, no markdown doc, no cheat sheet component. The
   brief's claim that shortcuts are "documented in places but not wired up" does not hold; there is no
   documentation to match against. We will define the shortcut set from scratch as part of this work
   (informed by common inbox-app conventions: Superhuman/Gmail-style `j`/`k`/`e`/`d`) and document it
   ourselves (a small `?`-triggered cheat sheet), rather than reconcile against a nonexistent spec.
5. **`InboxItem` has grown since the migration brief was written** — it now also carries `pinned`,
   `bucket` (`now`/`next`/`later`), `priority_due_at`, `priority_fixed`, `workflow_status`. These
   don't block any of the 4 sub-features, but snooze and saved-views UI need to visually coexist with
   Prioritize mode's tier pills and the pinned/bucket treatment already in `InboxItemRow.tsx`.
6. **Status handling already favors a `snoozed` status approach.** `resolveTargetStatus()`
   (`src/lib/inboxValidation.ts:312-316`) maps every non-`done`/`archive` built-in view to
   `status = 'open'`. Since `inbox_items.status` already has a `'snoozed'` value in its CHECK
   constraint (line 29) that is **also currently unused**, snoozing an item by setting
   `status = 'snoozed'` automatically hides it from every existing "open" view with zero query changes.
   Un-snoozing just needs to flip `status` back to `'open'` (and clear `snoozed_until`). This is
   simpler and less invasive than introducing a parallel "snoozed but still open" flag.
7. **1:1 scheduling data model — the brief's suggested tables are not the right ones.**
   - `cos_one_on_one_prep` (`supabase/migrations/20260423000000_create_cos_one_on_one_prep.sql`) has
     **no scheduling fields at all** — it's prep *content* per `(user_id, team_member_id, prep_date)`,
     not a calendar of future meetings. Not usable for "next occurrence."
   - `dci_meeting_schedule` (`supabase/migrations/20260701000000_dci_meeting_schedule.sql`) stores
     **already-occurred** meetings for post-meeting transcript processing (`transcript_checked`,
     `action_items_extracted`), keyed by `attendees text[]` (free-text names/emails, no FK to
     `cos_team_members`). Not a forward-looking recurrence source.
   - The actual right table is **`cos_one_on_one_events`**
     (`supabase/migrations/20260605000000_calendar_integration.sql`,
     extended in `20260606000000_extend_1on1_categories.sql` and
     `20260625000000_meeting_cadence.sql`), which stores Google Calendar-synced 1:1 events with
     `team_member_id` (nullable, FK to `cos_team_members`), `google_event_id`, `recurring_event_id`,
     `start_time`, `end_time`, `status` (`confirmed`/`tentative`/`cancelled`), indexed on
     `(user_id, start_time)` and on `recurring_event_id`. This is populated by the
     `google-calendar-sync` edge function and is exactly the "future occurrences of a 1:1" source.
     `src/hooks/useUpcomingMeetingGroups.ts` already demonstrates the query pattern: filter
     `start_time >= now`, `status != 'cancelled'`, group by `recurring_event_id`.

These corrections don't change the shape of the ask, but they change which tables the "snooze until
next 1:1" feature reads from, and clarify that keyboard shortcuts are new UX, not a bug fix.

---

## 1. Snooze

### 1a. Fixed-date / relative snooze

**UI**
- A "Snooze" action on `InboxItemRow` (new icon button, shown in the hover-revealed controls area
  next to the existing pin/archive affordances) and as a bulk action in the selection toolbar in
  `Inbox.tsx` (alongside "Mark Done" / "Archive" / "Delegate" / "Pin", lines ~764-828).
- Clicking opens a small popover (reuse the `Popover`/`PopoverContent` pattern already used for the
  fixed-due-date calendar in `InboxItemRow.tsx:402-429`) with:
  - Relative quick options: "Later today" (e.g. +4h, capped at 6pm local), "Tomorrow morning" (9am
    local next day), "This weekend" (Saturday 9am), "Next week" (Monday 9am).
  - A `Calendar` date picker (same component already imported: `@/components/ui/calendar`) for a
    specific date, defaulting to 9am local on the chosen day.
  - A third option, "Until my next 1:1 with…", detailed in 1b.
- Snoozed items disappear from the current view immediately (optimistic) since they move to
  `status = 'snoozed'`.
- A new built-in sidebar view, **"Snoozed"**, in `InboxSidebar.tsx` (parallel to "Done"/"Archive" in
  the "More" section, lines 793-807), so users can see/edit/cancel snoozes. Needs a `snoozed` entry
  in `InboxFilterState.builtIn` and `VIEW_LABELS` in `Inbox.tsx:97-103`, plus a `resolveTargetStatus`
  branch and a sidebar count.

**Data model**
- No new migration needed for the fixed-date path — `snoozed_until` and `status = 'snoozed'` already
  exist. Add:
  - An index: `CREATE INDEX inbox_items_snoozed_until ON inbox_items (snoozed_until) WHERE status = 'snoozed';`
    (new migration, e.g. `supabase/migrations/<ts>_inbox_snooze_index.sql`) to make the un-snooze
    sweep cheap at scale.

**Hook changes — `src/hooks/useInboxItems.ts`**
- New mutation:
  ```ts
  const snoozeItem = useCallback(async (id: string, until: Date, meta?: { untilNext1on1MemberId?: string }) => {
    await updateItem(id, {
      status: 'snoozed',
      snoozed_until: until.toISOString(),
      // meta.untilNext1on1MemberId persisted separately — see 1b.
    } as Partial<InboxItem>);
    applyPatch(prev => prev.filter(i => i.id !== id)); // drop from current (open) view
  }, [updateItem, applyPatch]);

  const unsnoozeItem = useCallback(async (id: string) => {
    await updateItem(id, { status: 'open', snoozed_until: null } as Partial<InboxItem>);
  }, [updateItem]);
  ```
- `resolveTargetStatus` in `src/lib/inboxValidation.ts` gets a new branch:
  `if (filter.builtIn === 'snoozed') return 'snoozed';`

**Un-snooze mechanism — cron edge function (recommended) vs. client-side filter**

Recommendation: **cron edge function**, not client-side filtering, for two reasons: (1) client-side
"treat snoozed-until-passed items as open" would require every view's query to special-case status,
undoing the simplicity of using the `status` column as the single source of truth; (2) it needs to
work even when the user isn't looking at the app (so the item is back in the inbox next time they
open it, not stale until a client happens to poll).

- New edge function `supabase/functions/inbox-unsnooze-sweep/index.ts`, following the existing
  `calendar-sync-cron` pattern (service-role Supabase client, no user auth needed since it's
  system-triggered):
  ```ts
  const { data: due } = await supabaseAdmin
    .from('inbox_items')
    .select('id, user_id')
    .eq('status', 'snoozed')
    .lte('snoozed_until', new Date().toISOString());
  if (due?.length) {
    await supabaseAdmin
      .from('inbox_items')
      .update({ status: 'open', snoozed_until: null, updated_at: new Date().toISOString() })
      .in('id', due.map(d => d.id));
  }
  ```
- New migration `supabase/migrations/<ts>_inbox_unsnooze_cron.sql` scheduling it every 5-15 minutes
  via `pg_cron` + `pg_net`, following the exact pattern in
  `supabase/migrations/20260622000001_calendar_sync_cron.sql`:
  ```sql
  SELECT cron.schedule(
    'inbox-unsnooze-sweep',
    '*/10 * * * *',
    $$ SELECT net.http_post(
         url := (SELECT current_setting('app.settings.supabase_url', true) || '/functions/v1/inbox-unsnooze-sweep'),
         headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
         body := '{}'::jsonb
       ); $$
  );
  ```
- Realtime: since `useRealtimeSubscription`/`useRCDORealtime` patterns exist for other tables, consider
  a lightweight realtime subscription on `inbox_items` filtered to the current user so an unsnooze
  that happens while the tab is open refreshes the list without a manual reload. Not required for v1
  (a `reloadItems()` on window focus is a cheaper stopgap) but flag as a nice-to-have.

### 1b. "Snooze until my next 1:1 with X" (differentiating twist)

**Resolution logic**
- New helper, e.g. `src/hooks/useNextOneOnOneWith.ts` or a function in a new
  `src/lib/oneOnOneResolution.ts`:
  ```ts
  async function resolveNextOneOnOne(userId: string, teamMemberId: string): Promise<{ start_time: string } | null> {
    const { data } = await supabase
      .from('cos_one_on_one_events')
      .select('id, start_time')
      .eq('user_id', userId)
      .eq('team_member_id', teamMemberId)
      .neq('status', 'cancelled')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data;
  }
  ```
- Person selection UI: reuse the existing person-tag list (`InboxTag` where `type === 'person'`,
  which already carries `member_id -> cos_team_members.id`) so the "until my next 1:1 with…" option
  is a searchable list of people already tagged in the inbox, not a fresh picker. Fall back to
  `useTeamMembers` (`src/hooks/useTeamMembers.ts`) for people who exist as team members but have no
  inbox person-tag yet.

**Data model addition**
- The item needs to remember *who* it's waiting on, not just a resolved date, so that:
  (a) if the meeting gets rescheduled before the item unsnoozes, the un-snooze sweep can re-resolve
      rather than rely on a stale timestamp, and
  (b) the "Snoozed" view can render "Until your next 1:1 with Jane" instead of a bare date.
- Add two nullable columns to `inbox_items` in a new migration:
  ```sql
  ALTER TABLE inbox_items
    ADD COLUMN snooze_until_member_id uuid REFERENCES cos_team_members(id) ON DELETE SET NULL;
  -- snoozed_until still stores the resolved timestamp (kept in sync by the sweep/hook)
  -- so existing "due <= now" queries keep working unchanged.
  ```
  Rationale for reusing `snoozed_until` as the resolved cache rather than computing it live on every
  read: keeps the un-snooze sweep query simple (`status='snoozed' AND snoozed_until <= now()`) and
  keeps the "person-bound" case an additive refinement instead of a second code path.

**Resolution + drift handling**
- On snooze: resolve immediately via `resolveNextOneOnOne`, store both `snooze_until_member_id` and
  the resolved `snoozed_until`. If no upcoming event is found, see risk below (do not silently snooze
  forever).
- The unsnooze sweep additionally re-resolves person-bound snoozes before trusting the cached
  timestamp — meetings get moved/cancelled often:
  ```ts
  const { data: personBound } = await supabaseAdmin
    .from('inbox_items')
    .select('id, user_id, snooze_until_member_id')
    .eq('status', 'snoozed')
    .not('snooze_until_member_id', 'is', null);
  for (const item of personBound ?? []) {
    const next = await resolveNextOneOnOne(item.user_id, item.snooze_until_member_id);
    if (!next) continue; // leave as-is; surfaced via the "no meeting found" UI (see risks)
    if (next.start_time !== cachedValue) await supabaseAdmin.from('inbox_items').update({ snoozed_until: next.start_time }).eq('id', item.id);
  }
  ```
  This re-resolve pass can run in the same `inbox-unsnooze-sweep` function, before the "due" query.

**Files to change/create — Snooze**
- `supabase/migrations/<ts>_inbox_snooze_index.sql` (new) — partial index on `snoozed_until`.
- `supabase/migrations/<ts>_inbox_snooze_member.sql` (new) — `snooze_until_member_id` column + FK + index.
- `supabase/migrations/<ts>_inbox_unsnooze_cron.sql` (new) — `pg_cron` schedule.
- `supabase/functions/inbox-unsnooze-sweep/index.ts` (new) — sweep + person-bound re-resolve.
- `src/hooks/useInboxItems.ts` — add `snoozeItem`, `unsnoozeItem`, `snoozeUntilNext1on1`.
- `src/lib/oneOnOneResolution.ts` (new) — `resolveNextOneOnOne` helper, shared by the hook and (if
  desired later) the edge function's Deno-side logic (kept as parallel implementations since edge
  functions can't import `src/` directly — mirror the query, don't share code across the boundary).
- `src/lib/inboxValidation.ts` — `resolveTargetStatus` gets the `snoozed` branch; add a
  `formatSnoozeLabel(item)` pure helper for "Until your next 1:1 with Jane" / "Until Jul 14".
- `src/types/inbox.ts` — add `snooze_until_member_id: string | null` to `InboxItem`; add `'snoozed'`
  to `InboxFilterState.builtIn` union.
- `src/components/inbox/InboxItemRow.tsx` — snooze button in the hover controls; snooze popover
  (new small component, e.g. `src/components/inbox/SnoozePopover.tsx`); render the "Snoozed until…"
  chip when `status === 'snoozed'` (relevant mainly inside the new Snoozed view).
- `src/components/inbox/InboxSidebar.tsx` — new "Snoozed" `SidebarItem` in the "More" section.
- `src/pages/Inbox.tsx` — `VIEW_LABELS.snoozed`, `emptyStateFor` case for `builtIn === 'snoozed'`,
  wire `snoozeItem`/`unsnoozeItem` through to the row/bulk-bar, add "Snooze" to the bulk action bar.
- `src/components/inbox/InboxGroupedView.tsx` / `InboxByProjectView.tsx` — thread the new
  `onSnooze` callback down to `InboxItemRow` (same prop-drilling pattern already used for
  `onArchive`/`onDelete`).

### Risks / edge cases — Snooze
- **No future 1:1 exists for the chosen person** (never scheduled, or the recurring series ended).
  Do not silently snooze with no resolution — on snooze-time, if `resolveNextOneOnOne` returns null,
  show an inline warning in the popover ("No upcoming 1:1 found with Jane — snooze until a fixed date
  instead?") and block confirming the person-bound option until either a meeting exists or the user
  picks a fallback date. Do not create a snooze with `snoozed_until = null`, since that would never
  be picked up by the sweep's `<= now()` comparison and the item would be stuck invisible forever.
- **Meeting gets cancelled after snoozing.** Sweep re-resolves; if the next lookup also returns null,
  leave the item snoozed but flag it (e.g. a `snooze_stale` computed flag surfaced in the Snoozed view
  as "This meeting was cancelled — pick a new time") rather than auto-unsnoozing (which could dump a
  stale item back into the inbox at a random moment) or auto-deleting.
- **Recurring series migrates to a new `recurring_event_id`** (Google sometimes does this on edit).
  `team_member_id`-based lookup is robust to this since it doesn't key off `recurring_event_id`.
- **Timezone**: relative options ("Tomorrow morning") must use the user's local timezone consistently
  with the `parseLocalDate` convention already mandated in `CLAUDE.md` — do not construct with
  `new Date("2025-07-01")`-style UTC-shifting patterns.
- **Double snooze / re-snoozing an already-snoozed item**: `updateItem` must overwrite, not stack.
- **Un-snooze race with manual "un-snooze now" click**: if the user clicks "un-snooze" in the UI at
  the same moment the cron sweep fires, both attempt the same update — idempotent by construction
  (`status = 'open'` twice is a no-op), so no lock needed.
- **RLS**: the edge function uses the service-role key and bypasses RLS by design (matches
  `calendar-sync-cron`'s pattern) — confirm the function only ever operates on rows already scoped by
  its own `user_id` column in the WHERE/update, not exposed to any client-facing path.

---

## 2. Saved Views

**UI**
- "Save current view" action, placed in the sidebar's "Views" section header
  (`InboxSidebar.tsx:675`, `SectionHeader` already supports an `action` slot used elsewhere for
  `ReorderToggle`) — opens an inline name input (reuse `InlineInput`, already in this file).
- Saved views render as a new list under "Views", between the built-ins (All/Do Now/Waiting on me)
  and "People" — each is a `SidebarItem`-style row showing the view's `name`, active-state highlight
  when `filter`+`sortMode` match, and on hover a star toggle (`is_starred`) plus a delete affordder.
- Clicking a saved view applies both `filter_json` (via `onFilterChange`) and `sort_json` (a new
  `onSortChange` prop, since `sortMode`/`prioritizeMode` currently live only in `Inbox.tsx` state and
  aren't part of `InboxFilterState`).
- A starred view becomes the default view on next inbox load (replaces the current hardcoded
  `{ builtIn: 'all' }` initializer in `Inbox.tsx:205`).

**Data model**
- No migration needed — `inbox_views` already has everything: `filter_json`, `sort_json`,
  `is_starred`, `sort_order`.
- `sort_json` should store `{ sortMode: SortMode; prioritizeMode: boolean }` — a `Record<string, unknown>`
  today in `InboxView.sort_json` (types/inbox.ts:105), fine as-is; give it a concrete shape via a new
  `InboxViewSort` type instead of `Record<string, unknown>`.

**New hook — `src/hooks/useInboxViews.ts`** (mirrors `useInboxTags.ts` structure closely):
```ts
export interface InboxViewSort { sortMode: 'grouped' | 'byProject'; prioritizeMode: boolean }

export function useInboxViews(userId: string | null) {
  // load(): select * from inbox_views where user_id = userId order by sort_order
  // createView(name, filter: InboxFilterState, sort: InboxViewSort)
  // renameView(id, name)
  // deleteView(id)
  // toggleStar(id, starred) -- consider: only one starred view at a time (see risk below)
  // reorderViews(...) -- reuse planTagGroupReindex-style logic if drag-reorder is in scope, else skip for v1
}
```

**Files to change/create — Saved Views**
- `src/hooks/useInboxViews.ts` (new).
- `src/types/inbox.ts` — replace `sort_json: Record<string, unknown>` with `sort_json: InboxViewSort`
  (or keep loose typing at the DB boundary and narrow in the hook, matching the `rowToItem`/`rowToTag`
  convention already used for jsonb columns).
- `src/components/inbox/InboxSidebar.tsx` — new "Saved views" list rendering, save-view action button
  in `SectionHeader`, star/delete affordances per row (reuse `TagItem`'s hover-actions visual pattern
  rather than inventing a new one).
- `src/components/inbox/SaveViewDialog.tsx` (new, small) — or inline via `InlineInput` if the only
  input needed is a name; a full dialog is likely unnecessary for v1.
- `src/pages/Inbox.tsx` — instantiate `useInboxViews`, thread `views`/`createView`/`toggleStar`/
  `deleteView` into `InboxSidebar`; on mount, if a starred view exists, initialize `filter`/`sortMode`/
  `prioritizeMode` from it instead of the hardcoded default; add "Save view" to reflect current
  `filter` + `sortMode` + `prioritizeMode`.
- `src/lib/inboxValidation.ts` — add `validateViewName` (mirror `validateTagName`) for consistency
  with existing validation conventions.

### Risks / edge cases — Saved Views
- **Filter state includes ephemeral/user-specific references** (`tagIds` reference tag UUIDs) — if a
  tag is later deleted, a saved view silently becomes "no matches." Not worth solving in v1 beyond
  graceful empty-state handling (existing `emptyStateFor` already handles "no tag" gracefully via
  optional chaining) — flag as acceptable degradation, not a blocker.
- **Multiple starred views**: decide whether starring is exclusive (one default) or just a
  pinned-to-top marker with no "default view" semantics. Recommend exclusive-star (starring one
  unstars the previous) to keep "default view" unambiguous — enforce client-side in `toggleStar`
  rather than a DB constraint, to avoid an extra migration.
- **Name collisions**: `inbox_views` has no unique constraint on `(user_id, name)` (unlike
  `inbox_tags`). Decide whether to allow duplicate names (simplest, recommended for v1) or add a
  uniqueness check client-side like `useInboxTags.createTag`'s duplicate-name short-circuit.
- **View vs. current in-session state drift**: if a user applies a saved view then tweaks the filter
  further, there's no "unsaved changes" indicator — acceptable for v1, but worth a one-line UX note
  ("Save as new view" vs. "Update view") for a future pass.

---

## 3. Search

**Scope decision**: build substring (`ilike`) search first, not full-text (`tsvector`) search. The
one FTS precedent in the codebase (`supabase/migrations/20260620000000_relationship_memory_agent_foundation.sql`,
`cos_relationship_topics`) is for longer free-text content; inbox item `text` is typically short
(task-length strings), where substring matching is both sufficient and avoids stemming surprises
("meeting" not matching "meet"). Revisit FTS only if usage data shows it's needed for `body`.

**UI**
- Add a real search input to the main Inbox item view (not the Meetings-only one) — placed in the
  top bar of `Inbox.tsx` (the `flex items-center gap-2` row at line 663), to the left of the sort
  toggle, matching the visual style of the existing meetings search box in `InboxSidebar.tsx:601-619`.
- Debounced (~250ms) controlled input; clears with an `X` button (same pattern as
  `InboxSidebar.tsx:610-617`).
- Search should combine with the active filter (AND), not replace it — e.g. searching while viewing
  a specific project should search within that project.

**Data model**
- No migration required for `ilike`-based search — Postgres can do `ilike` without extra indexes for
  the data volumes an individual inbox will have (hundreds to low thousands of rows per user). If
  scale becomes a concern later, add:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX inbox_items_text_trgm ON inbox_items USING gin (text gin_trgm_ops);
  ```
  Flag as a follow-up, not part of v1.

**Hook changes**
- Extend `InboxFilterState` with an optional `search?: string`.
- In `src/hooks/useInboxItems.ts`'s `load()`, add:
  ```ts
  if (filter.search?.trim()) {
    query = query.or(`text.ilike.%${filter.search.trim()}%,body.ilike.%${filter.search.trim()}%`);
  }
  ```
  Note: Supabase's `.or()` string needs its own comma/percent escaping — sanitize the search term
  (strip `%`, `,`, and `*` before interpolating, or use `.textSearch`/parameterized filter builder
  functions if available) to avoid breaking the filter string or enabling trivial injection into the
  PostgREST filter syntax.
- Client-side filters in `applyInboxClientFilters` are unaffected since search is server-side.

**Files to change/create — Search**
- `src/types/inbox.ts` — add `search?: string` to `InboxFilterState`.
- `src/hooks/useInboxItems.ts` — extend `load()`'s query building with the sanitized `ilike` clause.
- `src/pages/Inbox.tsx` — new debounced search input in the top bar; local `searchDraft` state feeding
  a debounced `setFilter({ ...filter, search })`.
- `src/lib/inboxValidation.ts` — add a `sanitizeSearchTerm(term: string): string` pure helper (escape
  `%`/`_`/`,` for safe interpolation into PostgREST `.or()` / `.ilike()` calls) — easy to unit test in
  isolation, matching the existing pattern of pulling filter/query logic into this file.
- Consider: should search also work within the "Snoozed"/"Done"/"Archive" views? Yes — apply it
  uniformly since it composes with `resolveTargetStatus`, not against it.

### Risks / edge cases — Search
- **PostgREST filter-string injection via unescaped `%`/`,`** in the search term — must sanitize
  before building the `.or()` string (see above). This is a correctness/security issue, not just
  a UX one — an unescaped `,` in the search term could inject an unintended second filter clause.
- **Empty/whitespace-only search** should be treated as "no search," not "match nothing."
- **Search across tags** is out of scope for v1 (only `text`/`body`) — tag-name search already exists
  implicitly via sidebar tag click-to-filter; combining free-text search with tag name matching is a
  reasonable v2 addition, not required now.
- **Performance** on large inboxes without a trigram index — acceptable for expected per-user volumes;
  document the `pg_trgm` follow-up rather than pre-optimizing.

---

## 4. Keyboard Shortcuts

Since no existing documentation exists to match (see Section 0.4), this defines the shortcut set
fresh, using conventions already implied elsewhere in the app (Enter/Escape for inline edits) plus
common inbox-tool conventions (Gmail/Superhuman-style `j`/`k`/`e`/`d`).

**Shortcut set (v1)**
| Key | Action | Scope |
|-----|--------|-------|
| `j` | Move focus to next item | Item list |
| `k` | Move focus to previous item | Item list |
| `e` | Edit focused item's text (enters inline edit, same as double-click) | Item list |
| `d` | Mark focused item done | Item list |
| `s` | Open snooze popover for focused item | Item list |
| `Enter` | Open focused item in the drawer (`onOpenDrawer`) | Item list |
| `x` | Toggle selection of focused item (for bulk actions) | Item list |
| `?` | Open a shortcuts cheat-sheet overlay | Global (inbox page) |
| `Escape` | Close drawer / cheat sheet / clear focus | Global |

**Implementation approach**
- Global shortcuts must not fire while an `<input>`/`<textarea>` is focused (e.g. mid-inline-edit,
  or typing in the new search box) — guard on `document.activeElement` tag name, matching how
  `InlineInput`'s own `onKeyDown` already scopes `Enter`/`Escape` to itself.
- "Focused item" needs a new concept: `Inbox.tsx` currently has no notion of a keyboard-focused row
  (only `selected: Set<string>` for checkbox multi-select, and hover state local to each row). Add:
  ```ts
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  ```
  in `Inbox.tsx`, initialized to the first visible item once `sortedItems` loads, and kept in bounds
  when the list changes (e.g. after archiving the focused item, focus should move to the next one —
  reuse the same "what's next" logic Gmail/Superhuman use: focus follows to where the removed item
  was, clamped to the new list length).
- A single `useEffect` with a `keydown` listener at the `Inbox.tsx` page level (not per-row) reads
  `focusedItemId`, looks up the item in `sortedItems`, and calls the appropriate handler
  (`markDone`, `archive`, `snoozeItem`, `updateItem` to enter edit mode, etc.) — avoids attaching a
  listener per row.
- `InboxItemRow.tsx` needs a new prop `isFocused?: boolean` to render a visible focus ring (distinct
  from `isSelected`/hover), and a new prop `onRequestEdit?: () => void` so the page-level `e` handler
  can trigger the row's existing internal `startEditText()` (currently private to the row component —
  needs to be lifted to accept an external trigger, e.g. via a controlled `editingText` prop or an
  imperative ref).
- Cheat-sheet overlay: new small component, e.g. `src/components/inbox/ShortcutsHelpDialog.tsx`,
  triggered by `?`, listing the table above. Use the existing `Dialog`/`Sheet` primitives already in
  `src/components/ui/`.

**Files to change/create — Keyboard Shortcuts**
- `src/pages/Inbox.tsx` — `focusedItemId` state, the page-level `keydown` `useEffect`, wiring to
  `markDone`/`archive`/`snoozeItem`/`openDrawer`/`handleSelect`; render `ShortcutsHelpDialog` on `?`.
- `src/components/inbox/InboxItemRow.tsx` — `isFocused` prop + focus-ring styling; expose an
  edit-trigger (either lift `editingText` to a controlled prop, or add an `onRequestEdit` callback
  invoked from a `useEffect` watching a new `focusRequestEdit` prop — prefer lifting state to match
  how `datePickerOpen`/`editingText` are already local-only, i.e. keep them local but add a
  `forceEditOn?: boolean` prop that triggers `startEditText()` via `useEffect`).
- `src/components/inbox/InboxGroupedView.tsx`, `InboxByProjectView.tsx` — thread `focusedItemId` and
  `onFocusItem` down to each row (same drilling pattern as other per-item callbacks).
- `src/components/inbox/ShortcutsHelpDialog.tsx` (new).
- `src/lib/inboxValidation.ts` — pure helper `getAdjacentItemId(items, currentId, direction)` for
  `j`/`k` navigation math, unit-testable in isolation (matches the file's existing pattern of holding
  pure list/reindex logic like `planTagGroupReindex`).

### Risks / edge cases — Keyboard Shortcuts
- **Conflicts with browser/OS shortcuts** — `e` and `d` are unclaimed in Chrome/Firefox, but confirm
  no conflict with `Cmd+B` sidebar toggle (`SIDEBAR_KEYBOARD_SHORTCUT = "b"` in
  `src/components/ui/sidebar.tsx:22`) — different key, no conflict, but audit for the full set.
- **Typing in the new search box (Section 3) or any inline edit must not trigger shortcuts** — must
  test `j`/`k`/`e`/`d`/`s` typed into the search field do not fire actions. This is the single
  highest-risk regression class for this sub-feature.
- **Focus ring accessibility** — the focus concept introduced here is a custom app-level "active
  item," not native DOM focus/tab order; screen reader / keyboard-only (Tab-key) users get no benefit
  from `j`/`k` and must retain full mouse-free operability via Tab traversal + Enter, which already
  works today via native button/tabindex semantics on each row's controls — don't let the new
  synthetic focus concept replace or hide that.
- **Focused item scrolling out of view** — `j`/`k` must scroll the focused row into view
  (`scrollIntoView({ block: 'nearest' })`), or fast navigation on a long list becomes unusable.
- **Mobile/touch** — shortcuts are meaningless on touch devices (`useIsTouch()` already used
  elsewhere in these files); the page-level listener should still attach (harmless, no physical
  keyboard) but the cheat-sheet trigger (`?`) is effectively desktop-only — no special-casing needed
  beyond not advertising it in the mobile UI chrome.
- **Bulk selection (`x`) interacting with existing checkbox click-to-select** — must not double-toggle
  or diverge from the existing `handleSelect` semantics already used by mouse clicks.

---

## 5. Onboarding & User Education

Every sub-feature here is either invisible by default (keyboard shortcuts), easy to miss on a quiet
first run (saved views, search), or has a genuinely confusing failure mode if the mechanics aren't
explained up front ("snooze until next 1:1" when no such meeting exists). This section is the
in-product education plan, not just the build plan — it ships in the same PR as the mechanics it
describes, not as a follow-up.

### 5.1 First-run / empty-state copy

**Saved views — empty "Views" section, before any view is saved.**
Today `InboxSidebar.tsx`'s "Views" section (`SectionHeader` at line 675) always shows the three
built-ins (All/Do Now/Waiting on me) — there's no empty state today because built-ins always exist.
The empty state that needs designing is for the *new* "Saved views" sub-list underneath them, which
starts with zero items:
- Instead of just omitting the sub-list entirely (making the feature invisible), show one muted
  affordance row the first time, styled like a ghost/dashed entry (matching the existing dashed-border
  treatment already used in `InboxSidebar.tsx`'s `DropGap` empty-folder state, line 758-760):
  > "☆ Save this view — filters + sort, one click away" — clicking it behaves exactly like the
  > "Save current view" action (see 5.1's tooltip below), so the empty state doubles as the entry
  > point rather than being purely decorative.
- After the first view is ever saved (tracked via `views.length > 0` from `useInboxViews`, no new
  persisted flag needed), this row disappears permanently in favor of the real list — it's a one-time
  nudge, not a recurring empty state.

**Search — empty search box before typing (placeholder text).**
Current meetings-only search box placeholder is the generic `"Quick search…"` (`InboxSidebar.tsx:607`).
The new main-inbox search input should not reuse that generic copy — it should hint at scope and the
shortcut in one line, e.g.:
- Placeholder: `"Search tasks, notes, briefs… ( / )"` — names what's searchable (ties back to the
  `text`/`body` scope decision in Section 3) and teaches the `/`-to-focus shortcut passively, every
  time the user looks at an empty search box, with zero extra UI.
- If the user searches and gets zero results while a non-`all` filter is also active (e.g. searching
  inside a project view), the empty state should say why, not just "no results":
  > "No matches for "expense report" in Marketing — try All instead?" with "All" as a clickable link
  > that reruns the same search against `{ builtIn: 'all' }`. This is a small addition to
  > `emptyStateFor()` in `Inbox.tsx` (currently keyed only on `filter`, needs a `search` param too).

**Snooze — first time a user opens the snooze popover.**
No persistent empty state needed (it's a popover, not a panel), but the *first* time it's ever opened
per user, show one dismissible inline line above the options, not a separate modal:
> "Snoozed items come back automatically — you'll see them again in your inbox once it's time."
Tracked via a simple `localStorage` flag (`inbox_snooze_intro_seen`) — consistent with this being
pure client-side education, not something that needs a DB column or migration. Dismisses on first
interaction with any snooze option, not just an explicit close button, so it never blocks the actual
action.

**Keyboard shortcuts — no dedicated empty state (see progressive disclosure, 5.4), but the first
`j`/`k` press should self-announce.** The very first time `focusedItemId` transitions from `null` to
a real id in a session, show a small transient toast/pill near the newly-focused row:
> "Keyboard nav on — press ? for all shortcuts" (auto-dismiss after ~3s, `localStorage`-gated to
> once-ever like the snooze intro line, not once-per-session, so it doesn't nag returning users).

### 5.2 Inline hovers / tooltips

**Keyboard shortcuts cheat sheet (the `?` overlay from Section 4).**
This is the single most load-bearing piece of education in this feature set, since shortcuts have
zero visual presence otherwise. Design for `ShortcutsHelpDialog.tsx`:
- Triggered by `?` (documented in the passive toast above, and — for discoverability without ever
  pressing a key — a small `⌘` /keyboard-icon button placed next to the existing Settings gear in
  `Inbox.tsx`'s top bar, line ~738-746, tooltip: "Keyboard shortcuts (?)").
- Content is a simple two-column key/action list, grouped to match how a user thinks, not how the
  code is organized:
  ```
  Navigate            Act on the focused item
  j   Next item       d   Mark done
  k   Previous item   e   Edit text
  Enter  Open item    s   Snooze
                       x   Select (for bulk actions)
  ```
- Footer line, small and muted: "Shortcuts don't work while typing in a text field." — this preempts
  the single most likely confusion (Section 4's own top risk) by stating the guard rail explicitly
  instead of leaving users to discover it by trial and error.

**"Snooze until my next 1:1 with X" tooltip.**
This option (in the snooze popover, Section 1b) is the one place in this entire feature set where
silent failure is a real risk — a user could snooze something and have it vanish for good if no
meeting is ever resolved. The tooltip must say so plainly, attached to the option itself (a small `(i)`
info glyph next to the "Until my next 1:1 with…" row, consistent with how `title=` tooltips are
already used throughout `InboxItemRow.tsx`, e.g. line 297's `title={`Due ${format(...)}`}`):
> "We'll bring this back right before your next scheduled 1:1 with [Name]. If none is on the calendar
> yet, we'll ask you to pick a fallback date instead — no meeting means no auto-return."
- This tooltip text is the human-readable half of the blocking behavior already specified in Section
  1b's risk list (blocking confirmation when `resolveNextOneOnOne` returns null) — the UI copy for
  that exact moment, so drafting it here instead of leaving it as an unwritten "show a warning" note:
  > Inline warning copy (replaces the tooltip when the block actually triggers):
  > "No upcoming 1:1 found with Jane. Pick a date instead, or add one to your calendar first."
  > with the date-picker option visually highlighted as the suggested next action.
- If a person-bound snooze later goes stale (meeting cancelled with no replacement — see Section 1b's
  `snooze_stale` flag), the Snoozed view row shows: "Your 1:1 with Jane was cancelled — snoozed
  indefinitely until you pick a new time" with an inline "Pick a date" affordance, not a passive label.

**Saved views — "Save current view" tooltip.**
The save action itself (Section 2's `SectionHeader` action slot) gets a one-line tooltip on hover,
since "save current view" is a phrase that presumes the user already knows what "current view" means
(filter + sort + prioritize-mode combined) — spell it out:
> "Save this filter and sort as a view you can jump back to anytime."

**Star tooltip.**
Given Section 2's open question about exclusive-star semantics, whichever way that's resolved, the
star icon needs a tooltip that states the resolved behavior explicitly rather than leaving it to be
inferred from a star icon alone:
> If exclusive (recommended per Section 2): "Make this your default view when you open your inbox"
> (unstarred state) / "This is your default view" (starred state, on the currently-starred one).

### 5.3 "What's new" callout — draft copy

A single changelog-style announcement covering all four sub-features together (they ship as one
initiative from the user's point of view, even though they land as five incremental PRs internally).
Placement: reuse the existing `WeekendBanner`-style dismissible banner slot already present in
`Inbox.tsx` (`<WeekendBanner bare />`, line 660) as the pattern to follow — either a new sibling
banner component (`InboxWhatsNewBanner.tsx`) shown once per feature-set release and dismissible
per-user (same `localStorage` or a lightweight `dismissed_at` pattern, consulting how `WeekendBanner`
already handles its own dismiss state before deciding whether to match it or use `localStorage` to
avoid a schema addition for a one-time banner).

Draft copy (four short before/after pairs, scannable in under 10 seconds):

> **Your inbox just got faster.**
>
> **Before:** No way to search your inbox — you scrolled to find things.
> **Now:** Press `/` to search everything, instantly.
>
> **Before:** Snoozed items? There weren't any — done or not, that was it.
> **Now:** Snooze anything for later — or until your next 1:1 with someone, so it comes back exactly
> when it's relevant again.
>
> **Before:** Every time you opened your inbox, you rebuilt the same filter from scratch.
> **Now:** Save any filter + sort combo as a view, and jump straight to it next time.
>
> **Before:** Every action meant reaching for the mouse.
> **Now:** `j`/`k` to move, `d` to mark done, `e` to edit, `s` to snooze. Press `?` anytime to see
> the full list.
>
> [Got it] [Show me the shortcuts →] (links directly to the `?` overlay from 5.2)

### 5.4 Progressive disclosure

Two of the four sub-features (saved views, keyboard shortcuts) are power-user surface area that a
brand-new user does not need on day one, and showing them too early risks the exact "bounced off
because it looked complicated" failure mode this whole initiative is meant to fix. Concretely:

- **Saved views**: the ghost "Save this view" row (5.1) only appears after a user has actively
  changed the filter/sort away from the default at least once in a session (a cheap client-side
  signal that they're the kind of user who'd want this — reuse the existing `isNewUser` computation
  already in `Inbox.tsx` (line 342, `!allItemsLoading && allItems.length === 0`) as an additional
  gate: suppress the ghost row entirely for a user's first session so an empty inbox with zero items
  doesn't also ask them to save a view of nothing).
- **Keyboard shortcuts**: the first-press toast (5.1) and the `?` icon button both stay hidden until
  a user has at least, say, 5 inbox items — gate on `allItems.length >= 5` (same `allItems` already
  computed in `Inbox.tsx`) — below that threshold there's nothing meaningful to navigate between with
  `j`/`k` anyway, so introducing the concept earlier just adds noise to an empty/near-empty inbox.
- **Snooze and search are not gated.** Both map to a single, immediately-understandable real-world
  concept (search = find something; snooze = come back later) that don't require the user to have
  accumulated any usage history to benefit from — introduce them at first use, same as today's
  existing pin/archive/tag actions, no threshold needed.
- **The "what's new" banner (5.3) is the one exception to gating-by-usage** — it should show to
  *existing* users on their first inbox load after this release regardless of activity level (that's
  the point of a changelog), but should not show to a user who signs up for the first time *after*
  the release ships — a brand-new user should just see the finished product with its normal empty
  states, not a "what's new" banner about changes they never experienced the "before" of. Gate this
  on `created_at` (user account age) vs. a feature-release timestamp, not on `isNewUser`'s
  zero-items heuristic, which would incorrectly also suppress it for an existing user who happens to
  have cleared their inbox to zero.

### Files to change/create — Onboarding & User Education
- `src/components/inbox/ShortcutsHelpDialog.tsx` — cheat-sheet content per 5.2 (already listed as new
  in Section 4; this section supplies its actual copy/grouping).
- `src/pages/Inbox.tsx` — keyboard-icon button next to Settings gear (~line 738-746); first-press
  toast logic gated on `allItems.length >= 5`; `localStorage` flags for the snooze intro and the
  first-shortcut toast; instantiate the new `InboxWhatsNewBanner`.
- `src/components/inbox/InboxWhatsNewBanner.tsx` (new) — the 5.3 draft copy, dismissible, gated on
  account-age vs. release timestamp per 5.4.
- `src/components/inbox/InboxSidebar.tsx` — ghost "Save this view" empty-state row in the Views
  section, gated per 5.4; tooltip text on the save-view action and star toggle (5.2).
- `src/components/inbox/SnoozePopover.tsx` (new component, already listed in Section 1) — first-open
  intro line (5.1); `(i)` tooltip and blocking-warning copy for "until next 1:1 with X" (5.2).
- `src/pages/Inbox.tsx` / new search input (Section 3) — placeholder copy; `emptyStateFor()` extended
  with a search-aware "no matches — try All?" branch (5.1).
- `src/components/inbox/InboxGroupedView.tsx` / `InboxByProjectView.tsx` — Snoozed-view row copy for
  the stale/cancelled-meeting case (5.2).

### Risks / edge cases — Onboarding & User Education
- **Tooltip/copy drift from actual behavior** — e.g. if Section 2's exclusive-star question gets
  resolved differently than assumed here, the star tooltip copy must be updated to match, not left
  describing the wrong behavior; treat the copy drafts here as bound to the specific design decisions
  made elsewhere in this doc, not independent.
- **`localStorage`-gated one-time UI is per-browser, not per-account** — a user who switches devices
  or clears browser storage sees the intro copy again. Acceptable for low-stakes education copy (worst
  case: mild repetition), but don't use the same pattern for anything that gates an irreversible
  action.
- **Banner fatigue** — stacking the "what's new" banner on top of the already-existing `WeekendBanner`
  risks a cluttered top-of-inbox on release day; confirm only one dismissible banner shows at a time
  (the what's new banner should take priority and suppress the weekend banner while unread, not stack
  both).
- **Translating tooltip copy if the app is ever localized** — not a current concern (no i18n
  infrastructure found in this codebase during investigation) but flagging so copy is written as
  plain, simple strings rather than baked into JSX in a way that would resist future extraction.

---

## 6. Incremental delivery order and effort estimate

Ordered by (a) independence — later steps don't block on earlier ones except where noted — and
(b) risk-reduction — cheapest, most isolated wins first. Each engineering step now folds in its own
onboarding/education copy and UI (Section 5) rather than treating that as a separate follow-on pass —
the "what's new" banner (5.3) is the one exception, held until last since it should announce the
whole shipped set at once.

| Step | Sub-feature | Depends on | Est. effort |
|------|-------------|------------|-------------|
| 1 | Snooze — fixed date/relative, incl. first-open intro line + tooltip copy (5.1, 5.2) | none | 2.5-3.5 days |
| 2 | Search (substring, main inbox view), incl. placeholder copy + search-aware empty state (5.1) | none | 1.5-2 days |
| 3 | Saved views (save/switch/star), incl. ghost empty-state row + tooltips + progressive-disclosure gate (5.1, 5.2, 5.4) | none | 2.5 days |
| 4 | Snooze — "until next 1:1 with X", incl. blocking-warning copy + stale-meeting messaging (5.2) | Step 1 | 2-2.5 days |
| 5 | Keyboard shortcuts (j/k/e/d/s), incl. cheat-sheet dialog, keyboard-icon button, first-press toast, progressive-disclosure gate (5.1, 5.2, 5.4) | Step 1 (for `s`) | 2.5-3.5 days |
| 6 | "What's new" banner covering all four sub-features (5.3) | Steps 1-5 | 0.5-1 day |

Total: **~11.5-15 working days** (roughly 2-3 weeks with review/QA buffer) — up from the
engineering-only estimate of ~9-12 days, reflecting that onboarding copy/UI is built alongside each
step rather than bolted on after. Still broadly consistent with the brief's 1-2 week ask if the "what's
new" banner and lower-priority tooltip polish (e.g. the star-toggle tooltip) are treated as trimmable
scope under time pressure — call this out explicitly to the reviewer rather than quietly cutting it.

Steps 1-3 can still be parallelized across two engineers if available, since they touch mostly
disjoint files (snooze touches `InboxItemRow`/row-level actions; search touches the top bar and the
fetch hook; saved views touch the sidebar and a new hook) — the main shared-file contention point is
`src/pages/Inbox.tsx`, which every step edits, so land these as separate, fast-following PRs rather
than long-lived parallel branches to minimize merge conflicts there.

Step 4 depends on Step 1 because it extends the same `snoozeItem` mutation and `Snoozed` view. Step 5
is ordered near-last because it's the highest-regression-risk item (global keydown listener touching
focus state across every row) and benefits from snooze already existing so the `s` shortcut has
something real to call; it could alternatively move earlier if the team wants the "wow"
keyboard-navigation feature sooner and is willing to stub `s` as a no-op until Step 1 lands. Step 6 is
last by definition — it announces what steps 1-5 shipped.

---

## 7. Testing coverage

### Snooze
- **Unit** (`src/lib/inboxValidation.ts` helpers via Vitest): `resolveTargetStatus` returns `snoozed`
  for the new builtIn; `formatSnoozeLabel` renders both fixed-date and person-bound cases correctly;
  relative-date computation ("tomorrow morning") is correct across DST boundaries and respects local
  time (per the `parseLocalDate` mandate in `CLAUDE.md`).
- **Unit** (`resolveNextOneOnOne`): mock Supabase client — returns the soonest future non-cancelled
  event; returns `null` when none exist; ignores past/cancelled events.
- **Integration** (Vitest + test Supabase instance or mocked client): `snoozeItem` sets
  `status='snoozed'` and the item disappears from the `open` list fetch; `unsnoozeItem` restores it.
- **Edge function test**: `inbox-unsnooze-sweep` — items with `snoozed_until` in the past are flipped
  to `open`; items with a future `snoozed_until` are untouched; person-bound items get re-resolved and
  their cached `snoozed_until` updated when the underlying meeting time changes; person-bound items
  whose meeting was cancelled with no replacement are left snoozed and flagged, not force-unsnoozed.
- **E2E** (Playwright, `e2e/`): snooze an item via the relative-option popover, confirm it disappears
  from "All" and appears in "Snoozed"; snooze "until next 1:1 with X" for a person with a seeded
  future `cos_one_on_one_events` row, confirm the resolved date shown matches; attempt to snooze
  "until next 1:1" for a person with no upcoming meeting, confirm the blocking warning appears and
  the action is not silently accepted.
- **Manual/exploratory**: verify cron actually fires in a deployed environment (can't be covered by
  local Playwright) — check via `get_logs`/Supabase dashboard after deploy that the schedule runs.

### Saved Views
- **Unit**: `validateViewName` rejects empty/overlong names consistent with `validateTagName`.
- **Integration**: `useInboxViews.createView` persists `filter_json`/`sort_json` and round-trips
  through `rowToView`-style parsing without type coercion bugs (especially the `builtIn` union and
  `tagIds` array surviving jsonb round-trip).
- **E2E**: create a view while filtered to a project + grouped sort mode; navigate away (switch to
  "All"); click the saved view; confirm both filter and sort mode are restored. Star a view, reload
  the page (simulate fresh session), confirm the starred view is the initial view instead of "All".
  Delete a view, confirm it's removed from the sidebar and doesn't reappear on reload.
- **Edge case test**: create a view scoped to a tag, delete that tag, click the view — confirm it
  doesn't crash and shows a reasonable empty state.

### Search
- **Unit**: `sanitizeSearchTerm` correctly escapes `%`, `_`, `,` so a search term containing those
  characters doesn't corrupt the PostgREST filter string or match unintended rows (write a test that
  proves a comma in the input can't inject a second `.or()` clause).
- **Integration**: `useInboxItems` with `filter.search` set only returns items whose `text` or `body`
  contains the term (case-insensitive); combining `search` with `tagIds`/`builtIn` narrows correctly
  (AND semantics, not OR).
- **E2E**: type into the search box, confirm debounced filtering (no request storm — can check
  network call count in a Playwright test); clear search, confirm the full list returns; search while
  viewing "Done", confirm results stay scoped to done items.
- **Performance smoke test**: seed a few hundred inbox items and confirm search still returns in a
  reasonable time without the trigram index (documents whether the Section 3 follow-up is needed
  sooner than expected).

### Keyboard Shortcuts
- **Unit**: `getAdjacentItemId` — correct wraparound/boundary behavior (no item selected yet, focus on
  first item and press `k`, focus on last item and press `j`, empty list).
- **Integration/component test** (React Testing Library + Vitest, following the existing
  `OneOnOnesView.search-filter.test.tsx` pattern for interaction tests): simulate `j`/`k` keypresses
  on the page and confirm `focusedItemId` advances/retreats through the currently rendered
  `sortedItems` order (which differs between grouped/byProject/prioritize modes — test at least two
  of these sort modes since focus order must follow *displayed* order, not raw fetch order).
- **Regression test — the highest-risk case**: focus the search input (Section 3) or an inline edit
  field, press `j`/`k`/`e`/`d`/`s`, and assert no navigation/mutation happens and the keystroke is
  typed into the field normally instead.
- **E2E**: full keyboard flow — load inbox, press `j` three times, press `d`, confirm the correct item
  is marked done and focus moves sensibly to a remaining item; press `?`, confirm the cheat sheet
  opens and lists all documented shortcuts; press `Escape`, confirm it closes.
- **Accessibility check**: confirm Tab-key traversal through row controls (checkbox, tag picker,
  status chip) still works independently of the new `j`/`k` synthetic focus — i.e. this feature is
  additive, not a replacement for existing keyboard accessibility.

### Onboarding & User Education
- **Unit**: progressive-disclosure gates are pure predicates on existing data (`allItems.length >= 5`,
  session-changed-filter flag, account-age vs. release-timestamp comparison for the what's-new banner)
  — each is testable in isolation without rendering the full page.
- **Component test**: ghost "Save this view" row renders only when `views.length === 0` AND the
  session has changed the filter/sort at least once; disappears permanently once `views.length > 0`.
- **Component test**: first-press toast and keyboard-icon button are absent when `allItems.length < 5`
  and present at/above the threshold; toast fires at most once across reloads (`localStorage` gate).
- **Component test**: snooze popover's first-open intro line renders once, dismisses on any option
  click (not just an explicit close), and never reappears in the same browser afterward.
- **Component test**: the "until next 1:1 with X" blocking-warning copy renders exactly when
  `resolveNextOneOnOne` returns null for the selected person, and the date-picker fallback is
  reachable from that same warning state without closing the popover.
- **E2E**: what's-new banner appears for a seeded pre-existing user account and does not appear for a
  freshly created account; dismissing it persists across a reload; it does not stack visually with
  `WeekendBanner` when both would otherwise be eligible.
- **Copy review (manual, non-automatable)**: read every draft string in Section 5 against the actual
  shipped behavior once each sub-feature lands — this plan flags copy/behavior drift as a risk (5's
  risk list); a pre-ship copy pass should confirm the star-toggle tooltip, the "until next 1:1"
  tooltip, and the what's-new banner still match whatever the team decided on the open questions in
  Section 8, since those decisions may land differently than this doc's working assumptions.

---

## 8. Open questions for reviewer

1. Should "Snoozed" be a top-level sidebar item (like Done/Archive) or nested under "More"? Plan
   assumes nested under "More" for consistency with Done/Archive, but it may deserve top billing
   given it's one of the four headline features.
2. Exclusive-star semantics for saved views (only one default) — confirm this matches user
   expectation, or if "starred" should just mean "pinned to top of the list" with a separate, explicit
   "set as default" action.
3. Is `pg_trgm` acceptable to add now preemptively for search, or confirmed fine to defer per Section 3?
4. Keyboard shortcut key choices (`s` for snooze, `x` for select) — confirm no collision with any
   planned future shortcut, since changing bindings after users learn them is disruptive.
5. Is the "what's new" banner (Section 5.3) in scope for this release, or can it be trimmed under time
   pressure per Section 6's note? If it ships, confirm the draft copy's tone matches how the product
   wants to talk to users elsewhere (this plan modeled it on the existing dismissible-banner pattern,
   not on any established changelog voice, since none was found in the codebase).
6. Progressive-disclosure thresholds in Section 5.4 (`allItems.length >= 5` for shortcuts,
   "changed filter/sort at least once this session" for the saved-views ghost row) are placeholder
   heuristics, not analytics-backed numbers — confirm they're reasonable or should be tuned once
   real usage data exists.
