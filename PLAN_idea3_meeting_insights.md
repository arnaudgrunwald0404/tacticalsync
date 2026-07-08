# Plan: Wire Meeting Insights into the Inbox (Idea #3)

Status: DRAFT — for approval before any code is written.

## 1. Problem

`extract-zoom-quotes` (`supabase/functions/extract-zoom-quotes/index.ts`) already asks
Gemini for 1-3 standout quotes per Zoom transcript and writes them to
`cos_member_quotes` (a table used only to power the "quote" shown on a team
member's 1:1 hero card). Two things fall on the floor today:

1. **Unmatched speakers are silently dropped.** The function fuzzy-matches
   `q.speaker` against `cos_team_members` by name; if there's no unambiguous
   match (external participant, name spelled differently than in the roster,
   two members sharing a first name, etc.) the quote is discarded
   (`index.ts:204-207`, `console.log('No member match...')`, then `continue`).
2. **Even matched quotes never reach the user's task stream.** They land only
   on the hero card. There is no "here's something interesting that was said
   in your last meeting, do you want to act on it?" moment. The
   `inbox_items.type = 'meeting_insight'` value exists in the schema
   (`supabase/migrations/20260713000001_inbox_tables.sql:25`) and the frontend
   already renders it with a video icon + blue-50 background
   (`src/types/inbox.ts`, `src/components/inbox/InboxItemRow.tsx:52,74`), but
   nothing ever inserts a row of that type.

This plan wires the extraction step to the inbox and gives the user a
lightweight, one-tap way to turn a surfaced insight into a task, a saved
note, or nothing at all.

## 2. Where in the pipeline this belongs

**Insight-writing belongs inside `extract-zoom-quotes`, not `agent-tick`.**

Reasoning, grounded in the actual code:

- `agent-tick`'s `postMeetingCheck()` (`agent-tick/index.ts:964-1139`) already
  orchestrates the post-meeting pipeline for a user: it calls
  `zoom-recordings-sync`, then `generate-meeting-suggestions`
  (`agent-tick/index.ts:1059-1077`). It does **not** call
  `extract-zoom-quotes` today, and there is no evidence anything else calls it
  either — it appears to be dead/manually-triggered code today. That's the
  real gap: `extract-zoom-quotes` needs to be added to `postMeetingCheck`'s
  call chain, the same way `generate-meeting-suggestions` already is.
- Once `extract-zoom-quotes` *is* being called per-transcript, the natural
  place to insert `inbox_items` rows is inside that function's own
  per-quote loop (`index.ts:180-233`) — it already has the matched member,
  the quote text, the recording, and the transcript in scope. Doing the
  insert in `agent-tick` instead would mean re-fetching/re-parsing
  everything `extract-zoom-quotes` already computed, or having
  `extract-zoom-quotes` return the quotes in its response and having
  `agent-tick` write them — an unnecessary hop.
- This exactly mirrors the existing sibling function
  `generate-meeting-suggestions`, which is called by `agent-tick` and does
  its own writes (to `dci_suggested_tasks`) and its own
  `suggestions_extracted_at` marking, in the same request. `extract-zoom-quotes`
  should follow the identical shape for `inbox_items` writes and
  `quotes_extracted_at` marking.

**Concretely:**
- `agent-tick/index.ts`: add a third fetch call alongside the existing
  `zoom-recordings-sync` → `generate-meeting-suggestions` chain in
  `postMeetingCheck()` (around line 1059-1077), calling
  `extract-zoom-quotes` with the same `x-supabase-user-id` service-role
  pattern `generate-meeting-suggestions` already uses.
  `extract-zoom-quotes` currently only supports user-JWT auth
  (`index.ts:67-77` — it 401s without a `Bearer` token, and has no
  `x-supabase-user-id` override branch). It must gain the same "service-role
  key + x-supabase-user-id header" override branch that
  `generate-meeting-suggestions/index.ts:258-271` already implements, or
  `agent-tick` can never call it.
- `extract-zoom-quotes/index.ts`: inside the existing per-quote loop
  (`index.ts:180-233`), after a quote is matched to a member and inserted
  into `cos_member_quotes`, also insert a row into `inbox_items`
  (`type: 'meeting_insight'`). Do this for both matched *and* unmatched
  speakers — see the source_ref/matching discussion in §3 — so the
  "unmatched speaker" data loss is fixed as a side effect of this work,
  not left in place.

**Auth pattern note:** there are three different auth conventions already
live across sibling edge functions — `extract-zoom-quotes` today requires a
user JWT (`index.ts:67-77`); `generate-meeting-suggestions` supports JWT *or*
service-role + `x-supabase-user-id` (`index.ts:258-271`); `suggest-inbox-tags`
trusts a body-supplied `user_id` with no auth check at all
(`suggest-inbox-tags/index.ts`, reads `{ item_id, user_id }` directly from
the POST body). This plan follows the `generate-meeting-suggestions`
convention (JWT-or-service-role) for `extract-zoom-quotes`, not the
`suggest-inbox-tags` no-auth convention — the latter is a weaker pattern that
should not be propagated further.

### Dedup against `dci_meeting_schedule.action_items_extracted`

No — that flag is the wrong tool for this and should not be reused.
`action_items_extracted` on `dci_meeting_schedule`
(`supabase/migrations/20260701000000_dci_meeting_schedule.sql:19`) is a
per-*meeting* boolean set once by `agent-tick`
(`agent-tick/index.ts:1106-1113`) after `generate-meeting-suggestions` runs,
and it's derived from a different granularity: `dci_meeting_schedule` rows
only exist for meetings that came through a 1:1 calendar event with a Zoom
ID; group/committee meetings never get a row there at all
(`agent-tick/index.ts:990-994`, explicit comment: "Group meetings... don't
create cos_one_on_one_events"). `extract-zoom-quotes`, like
`generate-meeting-suggestions`, operates at the *transcript* granularity via
`cos_zoom_transcripts`, which does cover group meetings.

The correct, already-established dedup mechanism is the same one
`extract-zoom-quotes` uses for `cos_member_quotes` and
`generate-meeting-suggestions` uses for `dci_suggested_tasks`: a
**per-transcript marker column** (`quotes_extracted_at`, already present on
`cos_zoom_transcripts` per
`supabase/migrations/20260612000300_add_quotes_extracted_at.sql`) plus an
**exact-match existence check** before each insert. `extract-zoom-quotes`
already does the marker part (`index.ts:236-239`) and already does existence
checks for `cos_member_quotes` (`index.ts:210-218`); it just needs the same
existence check added for `inbox_items` (see §4).

## 3. `source_ref` shape for `meeting_insight` items

`inbox_items.source_ref` is untyed jsonb; the frontend's `SourceRef` type
(`src/types/inbox.ts:58-61`) currently only declares
`'zoom_recording' | 'dci_brief' | 'dci_weekly_brief' | 'calendar' | 'manual'`
with a single optional `id`. That's too thin for meeting_insight — clicking
through needs to jump to a specific quote inside a specific recording, not
just "some recording."

Proposed shape (extends `SourceRef`, all fields besides `type`/`id` optional
so other `source_ref` producers are unaffected):

```ts
interface SourceRef {
  type: 'zoom_recording' | 'dci_brief' | 'dci_weekly_brief' | 'calendar' | 'manual';
  id?: string;
  // meeting_insight-specific fields:
  recording_id?: string;      // cos_zoom_recordings.id — click-through target
  transcript_id?: string;     // cos_zoom_transcripts.id — for re-extraction/debugging
  quote_id?: string;          // cos_member_quotes.id, when the speaker matched a
                               // known member (lets the UI also show the 1:1 hero
                               // card link); null for unmatched speakers
  speaker_name?: string;      // raw speaker string from the transcript — always
                               // present, even when quote_id is null
  meeting_topic?: string;     // cos_zoom_recordings.topic, denormalized for display
                               // without a join
  said_on?: string;           // YYYY-MM-DD, denormalized from the recording start time
  context?: string;           // the "context" field Gemini already returns per quote
}
```

For a `meeting_insight` row, `source_ref.type` is set to `'zoom_recording'`
and `source_ref.id` is set to the same value as `recording_id` (keeps the
existing single-`id` consumers working; new fields are additive). Click-
through in the UI resolves via `recording_id` to whatever the
recording-detail view already uses (the `InboxMeetingsView` panel already
lists recordings, per `src/pages/Inbox.tsx:751-761`) — this plan does not
require building a new recording viewer, just linking to the existing one
with `recording_id` and optionally deep-linking to `transcript_id`/`quote_id`
if that view supports it (needs a quick check during implementation; if it
doesn't, the click-through falls back to opening the recording without
scrolling to the specific quote — acceptable for v1).

## 4. Triage UI design

### Where it renders

**Inline on `InboxItemRow.tsx`, scoped to `item.type === 'meeting_insight'`
— not a drawer.** Rationale:

- The row already branches heavily on `item.type` for icon/accent/background
  (`InboxItemRow.tsx:47-76`) and already has one precedent for a type-scoped
  inline action: the `agent_question` CTA button rendered only when
  `item.type === 'agent_question' && item.agent_payload?.action_required`
  (`InboxItemRow.tsx:436-444`), right-aligned via `gridColumn: '-1'`. The
  triage buttons for `meeting_insight` should use the exact same slot/pattern
  — same grid column, same conditional render — so the row layout code stays
  in one place.
- A drawer (`InboxAssistantPanel.tsx`) is the wrong altitude for a one-tap
  triage action: the existing drawer is a chat/detail surface you deliberately
  open (`openDrawer`, `src/pages/Inbox.tsx:217`), whereas Confirm/Save/Dismiss
  needs to be doable directly from the stream without a click-to-open step,
  matching the "one-tap triage" requirement in the idea brief. Row actions
  the user can act on without leaving the list is also the existing mental
  model for `onAcceptSuggestion`/`onDismissSuggestion` on tag suggestions
  (`InboxItemRow.tsx:227-252`).
- The drawer still opens on click-through (existing `onOpenDrawer` behavior
  is unchanged) and can show the full quote + speaker + "said on" context
  there for items that need more room — but the triage action itself is a
  row-level affordance. `InboxAssistantPanel.tsx` already has a precedent
  for type-conditional detail blocks (the `brief_item`-only
  `<BriefItemDetail>` render, lines 273-284, and the always-present
  `agent_payload.rationale`/`source_ref.type` History section, lines
  366-384) — a `meeting_insight`-only block following that same pattern
  (full quote text + speaker + "said on" date + link to the recording) is a
  reasonable v1.5 addition to the drawer, but is not required to ship the
  triage buttons themselves.

### Visual placement

Three small buttons (icon + label, collapsing to icon-only on narrow
viewports the way the sort/prioritize toggles already do —
`src/pages/Inbox.tsx:690-719` pattern) in the same right-aligned CTA slot
`agent_question` uses:

```
[Confirm → Task]  [Save → Note]  [Dismiss]
```

- Rendered only while `item.status === 'open'` (matches how the
  `agent_question` CTA is conditional on `action_required`, not on some new
  triaged flag — see below for why no new column is needed).
- After any of the three actions the row disappears from the current filter
  the same way `archive`/`markDone` already do
  (`useInboxItems.ts:203-206`, `190-201`) — no special-case animation needed,
  reuse the existing "filter out of `items` state" behavior.

### What happens to `status`/`type` on each action

No new `inbox_items` column is needed. `status` (already
`open|done|archived|snoozed`) is sufficient to mark a `meeting_insight` row
as triaged; a separate "already triaged" boolean would be redundant with
`status !== 'open'`, and the CHECK constraint on `status` already excludes
"invalid" values at the DB layer.

- **Confirm → convert to task.** Do **not** flip `type` on the existing row.
  Instead: (a) insert a **new** `inbox_items` row with `type: 'task'`,
  `text` seeded from the quote (e.g. `"Follow up: <quote text>"` truncated to
  the existing task-length validation in `validateItemText`), tags copied
  from the insight's own tags if any (there won't usually be any, since
  `meeting_insight` rows are agent-created), and `source_ref` set to the same
  meeting_insight source_ref shape from §3, so the new task is still
  traceable to its origin meeting; (b) mark the original insight row
  `status: 'done'`, `done_at: now()`. Rationale for creating a new row rather
  than mutating `type` in place: `task` and `meeting_insight` render
  completely differently (checkbox-driven vs. video-icon informational card,
  `InboxItemRow.tsx:47-76`) and have different semantics for `workflow_status`
  cycling (`cycleWorkflowStatus` — `InboxItemRow.tsx:340-357` — is gated on
  `item.type !== 'brief_item'` but assumes task-like semantics); mutating
  `type` in place on a row your UI, your realtime subscriptions, and your
  `counts` memo (`src/pages/Inbox.tsx:392-403`) have already rendered as one
  shape risks stale-shape bugs. A fresh row is the same pattern
  `dci_suggested_tasks`'s "accepted" flow already uses conceptually (a
  suggestion becomes a *new* commitment, the suggestion itself just changes
  status) — see `20260630000000_dci_inbox.sql:26` comment: "accept → converts
  to a commitment; dismiss → hides it."
- **Save → convert to note.** Same shape as Confirm, but insert
  `type: 'note'` instead of `'task'`, with `body` set to the full quote +
  context (a note is expected to carry more detail than a task title) and
  `text` set to a short label (e.g. the quote's `context` field, or first ~8
  words of the quote). Original insight row: `status: 'archived'`,
  `archived_at: now()` — "saved to notes" reads as archived-from-the-insight-
  stream, not done-as-a-task, since nothing about it needs follow-through.
- **Dismiss → archive.** No new row. Original insight row:
  `status: 'archived'`, `archived_at: now()`. Reuses the existing `archive()`
  mutation in `useInboxItems.ts:203-206` as-is — no new hook logic required
  for this branch.

All three actions are implementable as thin wrappers around
`addItem`/`updateItem`/`archive`, already exported by `useInboxItems`
(`src/hooks/useInboxItems.ts:337-356`) — no new mutation primitives needed
in the hook, just new call sites in `InboxPage`/`InboxItemRow` (see §5).

## 5. Files to change / create

### Edge functions
- `supabase/functions/extract-zoom-quotes/index.ts` — **modify**.
  - Add the service-role + `x-supabase-user-id` auth branch
    (mirror `generate-meeting-suggestions/index.ts:258-271`).
  - In the per-quote loop (`index.ts:180-233`): after the `cos_member_quotes`
    insert (matched speakers) or in an added `else` branch (unmatched
    speakers), insert an `inbox_items` row per §3/§4, with an existence
    check first (see dedup below).
  - Add a per-transcript cap on inserted insights (see §6 — recommend 2 per
    transcript even though up to 3 quotes may be extracted, or reuse
    the existing 1-3 extraction cap as the insight cap directly — see risk
    discussion).
- `supabase/functions/agent-tick/index.ts` — **modify**.
  `postMeetingCheck()` (around line 1055-1077): add a third `fetch` call to
  `extract-zoom-quotes`, same pattern as the existing
  `generate-meeting-suggestions` call, after `zoom-recordings-sync` succeeds.
  Gate it the same way (`if (zoomSyncOk)`), and don't let its failure block
  the existing suggestions call or vice versa (wrap independently in
  try/catch, matching the existing per-handler try/catch style used
  elsewhere in this file, e.g. lines 253-262).

### Database
- New migration, e.g.
  `supabase/migrations/20260720000000_meeting_insight_dedup_index.sql`:
  add a unique or lookup-friendly index to make the existence check in
  §4/§6 cheap:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_inbox_items_meeting_insight_source
    ON inbox_items (user_id, ((source_ref->>'transcript_id')), ((source_ref->>'speaker_name')))
    WHERE type = 'meeting_insight';
  ```
  (Expression index on jsonb fields — avoids a full-text scan per insert
  when checking "did we already create an insight for this transcript +
  speaker + quote".) No new columns needed on `inbox_items` — confirmed in
  §4, `status` is sufficient.

### Frontend types
- `src/types/inbox.ts` — **modify**. Extend `SourceRef` with the new optional
  fields from §3.

### Frontend components
- `src/components/inbox/InboxItemRow.tsx` — **modify**. Add the
  Confirm/Save/Dismiss button group, scoped to
  `item.type === 'meeting_insight' && item.status === 'open'`, in the same
  grid slot as the existing `agent_question` CTA (`index.ts:436-444` — note:
  the two conditions are mutually exclusive by `type`, so no layout conflict).
  New props: `onConfirmInsight`, `onSaveInsight`, `onDismissInsight` (or a
  single `onTriageInsight(item, action)` — prefer the single-callback form to
  avoid three near-identical prop threadings through `InboxGroupedView.tsx`
  and `InboxByProjectView.tsx`, matching how `onAcceptSuggestion`/
  `onDismissSuggestion` are already threaded as pairs).
- `src/components/inbox/InboxGroupedView.tsx` and
  `src/components/inbox/InboxByProjectView.tsx` — **modify**. Thread the new
  `onTriageInsight` prop down to `InboxItemRow`, same as the existing
  `onAcceptSuggestion`/`onDismissSuggestion` threading (`InboxGroupedView.tsx:46,63,112` etc.)
- `src/pages/Inbox.tsx` — **modify**. Add a `handleTriageInsight` callback
  (alongside the existing `handleItemDone`, `handleSubmit` etc., §4's logic:
  branch on action, call `addItem` + `updateItem`/`archive` from
  `useInboxItems`), pass it down to both view components.
- `src/hooks/useInboxItems.ts` — **no changes required** per §4 (reuses
  `addItem`, `updateItem`, `archive`). If code review prefers a single
  encapsulated `triageInsight(item, action)` hook method instead of composing
  it in `InboxPage`, add it here mirroring the shape of the existing
  `syncBriefItem` composite mutation (`useInboxItems.ts:243-301`) — optional,
  not required for v1.

### Tests (see §7 for full coverage list)
- `supabase/functions/extract-zoom-quotes/index.test.ts` — **create** (no
  existing test file for this function today — confirm during implementation
  whether Deno-native tests or a fixture-driven Vitest harness is the
  project's edge-function testing convention; none was found for sibling
  functions in this pass, so this may be a net-new pattern to establish).
- `src/components/inbox/InboxItemRow.test.tsx` or equivalent — **create/extend**
  if a testing convention exists for this component today (needs a quick
  check at implementation time; not confirmed in this research pass).
- `e2e/` — new Playwright spec for the triage flow (see §7).

## 6. Risks and edge cases

1. **Duplicate insights from re-processed transcripts.** `quotes_extracted_at`
   prevents a transcript from being reprocessed at all once set
   (`index.ts:236-239`), so this is mostly moot *unless* someone manually
   re-triggers extraction for a specific `transcript_id` (the function
   supports this via the `transcript_id` body param, `index.ts:80-102`,
   e.g. for debugging or a "re-extract" button). Mitigation: the existence
   check in §5's dedup index must run regardless of the
   `quotes_extracted_at` gate, keyed on `(user_id, transcript_id,
   speaker_name, quote_text)` — not just transcript_id — since a manual
   re-run should be idempotent, not just blocked outright (blocking outright
   would break a legitimate "re-extract with an improved prompt" workflow).
2. **Low-quality/noisy quotes flooding the inbox.** The extraction prompt
   (`index.ts:33-48`) already asks for "insightful, inspiring, funny, or
   strong leadership/ownership" quotes and caps at 1-3 per transcript, but
   there's no quality gate before insertion — anything Gaussian-shaped JSON
   Gemini returns gets inserted as long as `speaker` and `quote` are
   non-empty (`index.ts:181`). Meeting-insight rows have no user-facing way
   to say "stop showing me quotes like this" today. Mitigation options
   (recommend doing #1 for v1, defer #2/#3):
   1. Reuse the existing per-transcript cap (max 3, already enforced by the
      prompt) as the de facto insight cap — do not raise it.
   2. Add a lightweight negative-feedback loop later: dismissing 3+ insights
      from the same meeting series in a rolling window could down-rank or
      suppress future extraction for that series (mirrors the adaptive
      nudge-timing logic already in `agent-tick/index.ts:274-301` — same
      shape, different signal). Out of scope for v1.
   3. Track a `cos_agent_feedback`-style thumbs-down per insight (table
      already used for nudge feedback, `agent-tick/index.ts:278-282`) — out
      of scope for v1.
3. **Volume control / cap per meeting.** Recommend **hard cap of 2 inbox
   insights per transcript**, even though up to 3 quotes may be extracted
   and written to `cos_member_quotes` (that table has a different, lower-
   stakes consumption model — a hero card slot, not a task stream). Rationale:
   `inbox_items` is explicitly a "triage stream, not a permanent dump" per
   the idea brief; capping the *inbox* surface below the *extraction* surface
   keeps the two consumers' volume tolerances independent without touching
   the (already-tuned) extraction prompt.
4. **Unmatched speakers.** Fixed as a side effect of this work (§2) — an
   unmatched speaker still gets an `inbox_items` row (with `source_ref.
   quote_id` left null and `speaker_name` populated raw), just skips the
   `cos_member_quotes` insert as it does today. Risk: raw transcript speaker
   labels are sometimes garbage (e.g. "Unknown" or a phone number for dial-in
   participants) — add a minimal filter (skip if `speaker` matches
   `/^(unknown|guest|\+?\d{7,})$/i`) before inserting the inbox row, so
   external/anonymous dial-ins don't produce insight noise attributed to
   nobody.
5. **`agent-tick` failure isolation.** `extract-zoom-quotes` must be wrapped
   in its own try/catch in `postMeetingCheck`, independent of the
   `generate-meeting-suggestions` call — a Gemini outage or malformed
   response in one should never block the other from running (matches the
   file's existing philosophy of per-handler try/catch, e.g.
   `agent-tick/index.ts:253-262`, `304-313`, etc.)
6. **`extract-zoom-quotes` currently only accepts user-JWT auth.** Until the
   service-role auth branch (§2, §5) is added, `agent-tick` cannot call it at
   all — this isn't an edge case so much as a hard blocker for step 1 of the
   implementation order below.
7. **Notification noise.** `agent-tick` sends a Slack DM when
   `generate-meeting-suggestions` finds action items
   (`agent-tick/index.ts:1116-1131`). Decide explicitly whether meeting
   insights also warrant a Slack ping, or whether they should be silent
   (inbox-only) until the user opens the app — recommend **silent for v1**
   to avoid doubling notification volume per meeting; revisit after seeing
   real triage-rate data.

## 7. Incremental steps and effort estimate

Target: 2-3 weeks total, sized for one engineer already familiar with this
codebase.

**Step 1 — Plumbing: service-role auth + agent-tick wiring (2-3 days)**
- Add `x-supabase-user-id` override auth branch to `extract-zoom-quotes`.
- Wire `agent-tick`'s `postMeetingCheck` to call it, with independent
  try/catch and logging (`logAgentEvent`, matching existing conventions).
- No inbox writes yet — verify via `cos_member_quotes` inserts and
  `cos_agent_log` events that the call actually fires end-to-end from a real
  (or fixture) transcript.

**Step 2 — Insight insertion into `inbox_items` (3-4 days)**
- Extend `SourceRef` type.
- Implement the per-quote `inbox_items` insert (matched + unmatched
  speakers), the dedup existence check + index, the per-transcript cap
  (§6.3), and the noise filter for garbage speaker labels (§6.4).
- Verify via manual insert + the existing `InboxItemRow` rendering (it
  already knows how to draw a `meeting_insight` row with no code changes —
  confirm this renders sanely with real quote text/length before building
  triage UI on top of it).

**Step 3 — Triage UI (4-5 days)**
- Add `onTriageInsight` prop and button group to `InboxItemRow`.
- Thread through `InboxGroupedView`/`InboxByProjectView`.
- Implement `handleTriageInsight` in `InboxPage` (Confirm/Save/Dismiss
  branches per §4).
- Manual QA pass across both sort modes (`byProject`/`grouped`) and mobile
  breakpoint (buttons must collapse sanely — reuse the icon-collapse pattern
  already used by the sort/prioritize toggles).

**Step 4 — Tests (3-4 days, can partially overlap Step 3)**
- Edge function tests with fixture VTT transcripts (§ below).
- Triage UI interaction tests.
- One e2e happy-path spec.

**Step 5 — Onboarding & user education (2-3 days, overlaps Step 3)**
- Empty-state copy update (`Inbox.tsx` `emptyStateFor`) — only fires the
  first time this ships, but must land before Step 6 rollout.
- First-card contextual intro treatment on `InboxItemRow.tsx` /
  `InboxAssistantPanel.tsx` (see §9).
- Tooltips on the three triage buttons and the source_ref link.
- "What's new" callout copy (see §9) — placement TBD pending confirmation
  that no changelog surface exists yet (§9 flags this as net-new).

**Step 6 — Rollout guardrails (1-2 days)**
- Feature-flag or config gate (reuse the `agent_config` pattern already on
  `cos_settings` — e.g. an `enable_meeting_insights` boolean, defaulting
  `false`, checked before the `extract-zoom-quotes` call in `agent-tick`) so
  this can be enabled per-user/gradually rather than flipping on for every
  `agent_config.enabled` user simultaneously.
- Monitor `cos_agent_log` volume and dismiss-rate manually for the first
  cohort before wider rollout.

Total: ~15-21 engineering days ≈ 3-4 weeks with review/QA buffer — this
pushes slightly past the original 2-3 week target once Step 5 (onboarding
copy, tooltips, first-run treatment) is included as a first-class deliverable
rather than an afterthought; see §9 for why this was folded in rather than
treated as later polish. Also biased slightly over if Step 4's testing
harness needs to be built from scratch (no existing edge-function test
convention was found in this codebase during research — see §5 note).

## 8. Test coverage

**Edge function unit tests (`extract-zoom-quotes`)** — fixture-driven, using
small synthetic VTT transcripts:
- Happy path: one transcript, 2 quotes, both speakers match known
  `cos_team_members` → 2 `cos_member_quotes` rows + 2 `inbox_items` rows with
  correct `source_ref` shape.
- Unmatched speaker: quote from a name not in `cos_team_members` → no
  `cos_member_quotes` row, but an `inbox_items` row is still created with
  `quote_id: null` and `speaker_name` populated.
- Garbage speaker label ("Unknown", a phone number) → no `inbox_items` row
  created at all (§6.4 filter).
- Per-transcript cap: Gemini returns 3 quotes → only 2 `inbox_items` rows
  created (§6.3 cap), all 3 still go to `cos_member_quotes` (matched ones).
- Re-run idempotency: calling with the same `transcript_id` twice (simulating
  a manual re-extract before `quotes_extracted_at` naturally blocks it, or
  after a forced reset) does not create duplicate `inbox_items` rows for the
  same (user, transcript, speaker, quote) tuple.
- Malformed Gemini JSON response → function degrades gracefully (existing
  `catch` at `index.ts:167-173`), zero rows written, no crash.
- Gemini API failure (500/timeout) → transcript is *not* marked
  `quotes_extracted_at` (must remain eligible for retry on the next tick) —
  confirm this matches current behavior (`continue` on `!geminiRes.ok`,
  `index.ts:153-156`, before the marker update at the end of the loop) —
  and add a regression test since this is easy to accidentally break in step 2.

**Edge function tests (`agent-tick`)**:
- `postMeetingCheck` calls `extract-zoom-quotes` after a successful
  `zoom-recordings-sync`, using the service-role + `x-supabase-user-id`
  pattern (assert the actual fetch call shape, mock the network layer).
- `extract-zoom-quotes` failure does not prevent `generate-meeting-suggestions`
  from running and vice versa (independent try/catch).
- Feature flag off (`enable_meeting_insights: false` or absent) → the call is
  skipped entirely.

**UI tests (component-level, InboxItemRow)**:
- Confirm/Save/Dismiss buttons render only for `type: 'meeting_insight'` and
  only while `status === 'open'` — not for other types, not after triage.
- Clicking Confirm calls the triage callback with the correct action and the
  row is optimistically removed from the current filtered view (matching
  existing `archive`/`markDone` removal behavior).
- Buttons collapse to icon-only at mobile breakpoint without overlapping
  other row content (regression risk given how tightly the grid columns are
  already tuned per the comments in `InboxItemRow.tsx:142-151, 330-339`).

**Integration/e2e (Playwright)**:
- Seed a `meeting_insight` inbox item via direct DB insert (fixture), load
  `/inbox`, verify the row renders with video icon + blue background and the
  triage buttons.
- Click Confirm → assert a new `task`-type row appears (via API check or by
  switching the filter) and the original insight is gone from the "All" open
  view but appears under an "Archive"/"Done" filter as `status: done`.
- Click Save → assert a new `note`-type row appears with body containing the
  quote text, and the original insight is `status: archived`.
- Click Dismiss → assert the insight is `status: archived` with no new rows
  created.
- Full pipeline smoke test (may need to be a guarded/manual test rather than
  CI, given it depends on real Zoom + Gemini calls): trigger
  `zoom-recordings-sync` → `extract-zoom-quotes` → confirm an
  `inbox_items` row appears in the UI within the polling/realtime window.

## 9. Onboarding & User Education

The engineering plumbing in §§1-8 gets a `meeting_insight` card to render.
None of it, on its own, tells a first-time user *why* a card that isn't a
task they typed is suddenly asking them to make a decision, or reassures
them that ignoring it costs nothing. This section is a first-class part of
the build, not post-launch polish — folded into §7's ordered steps as
Step 5, sized and estimated like any other step.

Grounding check: no changelog / "what's new" / release-notes surface exists
anywhere in `src/components` or `src/pages` today (confirmed by search — see
implementation note below). Every touchpoint proposed here either extends an
existing pattern (`title` tooltips, `emptyStateFor`, the drawer's
type-conditional detail blocks) or is flagged as net-new so the estimate
accounts for it honestly.

### 9.1 First-run / empty-state copy

**Where:** `emptyStateFor()` in `src/pages/Inbox.tsx:125-190`. This function
already branches per filter/tag to give tailored empty-state copy (e.g. the
`asap` case, `waiting` case, the default "This is where accountability
lives" illustration case at lines 182-189). It has no branch today for "the
user has never seen a `meeting_insight` item" — that's the gap.

**Problem this solves:** a `meeting_insight` card is unlike every other row
type in the stream — it isn't something the user typed, isn't a task they
own yet, and structurally looks like a to-do item (checkbox-adjacent, sits
in the same list) while behaving like a proposal. Without an explicit
explanation, "why is this here and why do I need to pick one of three
buttons" is a real point of confusion, especially since this is new
behavior for existing users whose inbox previously never contained this
type.

**Concrete change:** rather than (or in addition to) an empty-state branch
(which only fires when the list is empty, and a `meeting_insight` card by
definition means the list is *not* empty), add a **first-card-only inline
intro row** rendered directly above the first `meeting_insight` card a user
ever sees, gated on a one-time flag (see implementation note below on where
that flag lives). Concretely: a dismissible banner-style row, same visual
weight as the `WeekendBanner` component already used at the top of the inbox
(`src/pages/Inbox.tsx:660`, `src/components/WeekendBanner.tsx`) — reuse that
pattern rather than inventing a new one.

Draft copy for the intro row:

> **New: Meeting insights** — We caught something worth acting on in a
> recent recording. Review it below, then **Confirm** to turn it into a
> task, **Save** to keep it as a note, or **Dismiss** if it's not useful.
> Nothing happens until you choose. [Got it]

**Implementation note (net-new mechanism):** there's no existing "has the
user seen X" flag in the schema. Cheapest option: a boolean on
`cos_settings` (e.g. `seen_meeting_insight_intro`, mirroring how
`agent_config` already lives as a jsonb blob on that same table per
`agent-tick/index.ts:19-46` — this could be a sibling top-level column or a
key inside a similar settings blob). Set it the first time
`InboxPage` renders a `meeting_insight` item and the flag is unset; the
"Got it" dismissal also sets it early so a user who dismisses without
reading isn't shown it again. This is new schema surface not previously
scoped in §5 — added to the file list below.

**Per-card origin clarity (every card, not just the first):** independent of
the one-time intro, every `meeting_insight` card's own text must make the
source obvious without requiring the user to already know what this feature
is. Currently `InboxItemRow.tsx` just renders `item.text` — for this type,
`text` should be authored at insert time (in `extract-zoom-quotes`, per §5)
as something like:

> "Marcus said: 'We're not going to hit Q3 unless we cut scope now.'" —
> *from* Product Sync, Jul 3

i.e. the row's own primary text already carries speaker + quote + meeting
name, so a user scanning the list never has to open anything to know where
it came from. This is a copy/prompt-shaping requirement on the
`EXTRACT_PROMPT` / insert logic in `extract-zoom-quotes/index.ts`, not a
UI-only fix — flagged here so it isn't dropped when §5's insert logic is
implemented.

### 9.2 Inline hovers / tooltips

**Where:** `InboxItemRow.tsx`, on the same Confirm/Save/Dismiss button group
described in §4/§5. The existing row already uses bare `title="..."`
attributes for this kind of thing (e.g. `title="Click to change status"` on
the workflow chip, `InboxItemRow.tsx:343`; `title={fixedDueDate ? ... :
'Pick a due date'}` on the date-picker trigger, `InboxItemRow.tsx:406`) —
plain native tooltips, no Radix `Tooltip` component in use at the row level
today. Two options: keep that lightweight `title`-attribute convention for
consistency with the rest of this row, or upgrade to the existing
`src/components/ui/tooltip.tsx` (Radix-based) primitive for richer
multi-line copy, since "what exactly happens on Confirm" needs more than a
one-line native tooltip can comfortably show. **Recommendation: use the
Radix `Tooltip` primitive here** — this is the one place on this row where
the explanation genuinely needs 2-3 lines, and native `title` tooltips
render slowly and inconsistently across browsers for that much text.

Draft tooltip copy per button:

- **Confirm → Task** — *"Turns this into a task on your list. The original
  quote stays linked so you can always trace it back to the meeting."*
- **Save → Note** — *"Keeps the full quote as a note — no follow-up
  expected, just saved for reference."*
- **Dismiss** — *"Not useful? Dismiss it — this just clears it from your
  inbox, nothing is held against you and it won't come back."*

This directly answers "does the original quote stay linked" (yes — see §3's
`source_ref` propagation onto the newly-created task/note row) and
"is Dismiss punishing me for ignoring it" (no — reinforced again in §9.4).

**Source_ref click-through affordance:** today `InboxItemRow.tsx` has no
visible per-item link into `source_ref` at all — the only way to reach
context is via `onOpenDrawer` (click the row text, opens
`InboxAssistantPanel`). For a `meeting_insight` card specifically, add a
small inline affordance — a `Video` icon (already imported and used as the
type icon, `InboxItemRow.tsx:52`) rendered as a clickable link next to the
meeting-name portion of the row text, or as a distinct small "Watch"/"Jump
to moment" pill styled like the existing fixed-due-date tag
(`InboxItemRow.tsx:293-302` is the closest existing pattern for a small
inline pill with an icon + label). Label copy: **"View in recording"** —
avoid "Watch" alone, since per §3 the v1 click-through may only open the
recording without seeking to the exact timestamp (deep-linking to
`transcript_id`/`quote_id` is explicitly unconfirmed — §3, open question 4);
"View in recording" doesn't over-promise a seek-to-quote experience if that
capability isn't there yet.

### 9.3 "What's new" callout / changelog entry

No changelog surface exists in this codebase today (confirmed by searching
`src/components`/`src/pages`/`src/hooks` for changelog/release-notes/
announcement patterns — none found). This plan does **not** propose building
a general-purpose changelog system as a dependency of shipping meeting
insights — that would be a scope explosion disproportionate to this one
feature. Instead, recommend the lightest viable vehicle already available:

- Reuse the 9.1 first-card intro banner as the "announcement" — it already
  carries "New:" framing and fires exactly once, which functionally *is* a
  changelog entry scoped to this feature, without needing a persistent
  changelog list/archive.
- If the team wants a durable, user-visible changelog entry beyond the
  one-time banner (e.g. for users who dismiss it before reading, or for
  a shared "what shipped this month" surface across all 9 planned features),
  that is a separate, cross-cutting piece of infrastructure this plan
  explicitly flags as **out of scope** for this feature's build — it should
  be scoped once, centrally, and reused by all 9 plans rather than each one
  inventing its own mechanism. Recommend raising this as a standalone
  infra decision before all 9 plans reach implementation, rather than
  duplicating a bespoke solution 9 times.

Draft copy, sized for either the banner or a future shared changelog entry:

> **Meeting insights are here**
> Before: decisions made in meetings vanished into a transcript nobody
> reopened. Now: they land here for you to confirm, save, or skip — no
> more digging through recordings to remember who committed to what.

### 9.4 Volume/noise framing — "why am I suddenly seeing more cards"

This is the most important education gap to get right, because it's the one
most likely to drive a bad first impression: a user who has never seen a
`meeting_insight` card before will, starting on rollout day, begin seeing
1-2 new cards per transcribed meeting (§6.3's cap) with no context for why
their inbox just got busier. Two things must both land together, not
separately:

1. **Explain the "why now."** The 9.1 intro banner and the row copy in
   9.1's "per-card origin clarity" together are the primary mechanism —
   every card visibly says it came from a specific meeting, so the pattern
   reads as "my meetings are now being watched for follow-ups" rather than
   unexplained inbox clutter.
2. **Explicitly de-risk Dismiss.** This is a distinct message from "here's
   what Dismiss does" (§9.2's tooltip) — it's a reassurance about
   *consequences*, not mechanics. Users who are unsure whether ignoring/
   dismissing an AI-generated item will be held against them (e.g. "will
   the agent stop trying to help me if I dismiss too much?") tend to
   either over-triage out of anxiety or avoid the feature entirely. Add
   this as a second line in the first-run intro banner (9.1), not buried in
   a tooltip — reassurance about safety needs to be seen at the moment
   volume first appears, not discovered later by hovering:

   > *Dismissing is always safe — it just means "not useful," not "stop
   > showing me these." You can turn meeting insights off entirely in
   > Settings if they're not for you.*

   This second sentence also surfaces a real product requirement that
   doesn't otherwise appear anywhere else in this plan: **a per-user
   on/off control for this feature that is discoverable in Settings**, not
   just the internal `enable_meeting_insights` rollout flag from §7 Step 6
   (that flag is an engineering rollout mechanism, gated by the team, not a
   user-facing preference). If the intro copy promises a Settings toggle,
   one must actually exist — this is a small but real scope addition:
   expose `agent_config.post_meeting_check`-adjacent control (or a new
   sibling boolean) as a visible toggle in whatever settings panel already
   surfaces agent behavior toggles today. Flagged here as a dependency the
   copy creates, not assumed away.
3. **Don't let volume drift silently.** If the per-transcript cap (§6.3,
   open question 2) is later raised from 2 to 3, or extraction quality
   degrades and low-value cards start appearing more often, there's
   currently no mechanism (per §6.2, deliberately deferred) to detect or
   respond to a spike in dismiss rate. This isn't a v1 build item, but it
   is a monitoring commitment that should be explicit: the manual
   dismiss-rate check already planned in §7 Step 6 should have a stated
   threshold ("if >70% of insights for a cohort are dismissed within 24h,
   pause rollout and revisit extraction quality before continuing") rather
   than being an unstructured "keep an eye on it."

### Additional files (education-specific, on top of §5's list)

- `src/pages/Inbox.tsx` — extend `emptyStateFor` context or add a new
  first-card intro banner component call (reusing `WeekendBanner`'s
  pattern); add the one-time "seen" check.
- `src/components/inbox/InboxItemRow.tsx` — add `Tooltip`/`TooltipContent`
  (from `src/components/ui/tooltip.tsx`) wrapping each triage button; add
  the "View in recording" inline affordance.
- `supabase/functions/extract-zoom-quotes/index.ts` — shape inserted
  `text` to include speaker + quote + meeting name per 9.1 (this is a
  change to the insert logic already being modified per §5, not an
  additional file).
- New migration for the one-time "seen intro" flag (can be combined with
  §5's dedup-index migration into a single migration file, or kept
  separate — team's call at implementation time).
- Settings UI location TBD (needs a quick check at implementation time for
  where `agent_config` toggles are currently surfaced to users, if
  anywhere today) — for the new user-facing on/off control from §9.4.2.
- `src/components/WeekendBanner.tsx` — read (not modified) as the pattern
  reference for the first-run banner's implementation.

## Open questions for approval

1. Should meeting insights trigger a Slack notification (like action-item
   suggestions do) or stay silent in-app for v1? (Recommendation: silent —
   §6.7.)
2. Is a 2-per-transcript inbox cap (vs. the existing 3-per-transcript
   extraction cap) the right number, or should product want all 3 surfaced
   and rely on triage/dismiss to manage volume?
3. Should this ship behind a per-user feature flag (recommended, §7 Step 6)
   or roll out to all `agent_config.enabled` users at once?
4. Confirm the recording click-through target: does `InboxMeetingsView` (or
   any other existing view) support deep-linking to a specific
   transcript/quote, or is "open the recording" (without scrolling to the
   quote) an acceptable v1 experience?
5. §9.4 proposes a user-facing Settings toggle to turn meeting insights off
   entirely, distinct from the internal rollout flag. Should this ship as
   part of this feature, or is "the intro banner promises a toggle" copy
   that should be softened until a dedicated Settings toggle is scoped?
6. §9.3 recommends against building a dedicated changelog/"what's new"
   surface for this feature alone, since none exists today and 8 more
   feature plans are coming. Should a shared changelog mechanism be scoped
   as standalone infra before these plans reach implementation, or should
   each plan (including this one) rely on its own one-time intro banner?
