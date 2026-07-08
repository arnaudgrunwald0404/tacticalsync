# Plan: Idea #4 — Agentic Follow-Through for the Inbox

Status: **Planning only — no code written.** Awaiting human approval before implementation.

## 0. Executive summary — the plan changed after grounding

The original brief assumed we'd be building agentic follow-through mostly from
scratch, with Slack push notifications as an open question. Codebase
verification found that's wrong on both counts:

1. **Slack DM infrastructure already exists and is production-wired.**
   `user_slack_credentials` (migration `20260612100000_slack_credentials.sql`)
   stores a durable bot-less OAuth access token per user, and `agent-tick`
   (`supabase/functions/agent-tick/index.ts`, `sendSlackDM()`, lines 123-175)
   already opens a DM channel and posts `chat.postMessage` with interactive
   Block Kit buttons. This is not a blocking dependency — it's a reusable
   asset.

2. **A near-identical background agent already runs today, just scoped to a
   different table.** `agent-tick` is a pg_cron job (every 30 min, see
   `supabase/migrations/20260620000001_agent_cron_schedule.sql`) that, per
   user, with quiet-hours suppression and a nudge-count ceiling:
   - nudges overdue/aging `cos_meeting_actions` via Slack DM with Mark
     done/Snooze buttons (`nudgeActionItems`)
   - pre-stages 1:1 prep into `cos_one_on_one_prep` ahead of upcoming
     `cos_one_on_one_events` (`prestagePreps`)
   - detects relationship/commitment escalation patterns
     (`agent-escalation`)
   - recommends meeting format based on a scored signal blend

   This is **the exact shape of Idea #4** — it just operates on the legacy
   Chief-of-Staff (`cos_*`) data model, not on `inbox_items`. The two data
   models are not unified: `inbox_items`/`inbox_tags` (person-tags via
   `member_id → cos_team_members.id`) is a newer, parallel surface
   (`supabase/migrations/20260713000001_inbox_tables.sql` says explicitly:
   "parallel experiment alongside /chief-of-staff").

**Conclusion: the highest-leverage, lowest-risk path is to extend
`agent-tick` to also scan `inbox_items`, reusing `sendSlackDM`, the
quiet-hours/nudge-cap/feedback-driven-timing logic, and the
`cos_one_on_one_prep` pre-staging pattern — rather than building a second,
parallel background agent for the inbox.** This cuts the estimated effort
roughly in half versus a from-scratch build, but it also means inbox nudges
inherit `agent-tick`'s existing config surface (`cos_settings.agent_config`),
which was designed around `cos_meeting_actions`/`cos_one_on_one_events`, not
`inbox_items`/`inbox_tags`. Section 3 covers the adaptation needed.

Do **not** confuse this feature with `delegate-inbox-task`
(`supabase/functions/delegate-inbox-task/index.ts`), which is a different
agentic loop: an on-demand state machine (`ramping_up → clarifying →
planning → getting_it_done → seeking_approval`) that does a task *for* the
user when they explicitly delegate it. Idea #4 is about the agent watching
passively and prompting the *human* to act — no overlap in code paths, but
both write to `inbox_items` and both are described loosely as "agentic," so
naming in UI copy should disambiguate ("Assistant is working on this" vs.
"Assistant noticed this").

---

## 1. Slack token storage — verified, NOT a blocker

Grep of `supabase/migrations/*.sql` for `slack` found:

| Migration | What it adds |
|---|---|
| `20260612100000_slack_credentials.sql` | `user_slack_credentials` table: `user_id` (PK), `access_token`, `scope`, `slack_team_id`, `slack_user_id`, `slack_email`, sync status columns. RLS-locked; a `user_slack_credentials_public` view exposes only a `connected` boolean to clients — the token itself never leaves the server. |
| `20260707000000_slack_sync_channels.sql` | Adds `sync_channels text[]` for channel-based sync (unrelated to DMs). |

Edge functions already built on top of it:
- `exchange-slack-token` — OAuth code exchange, populates `user_slack_credentials`.
- `disconnect-slack` — revokes + clears.
- `agent-slack-action` — inbound webhook for Slack interactive Block Kit
  buttons (`mark_done:`, `snooze:`, `dismiss_escalation:`, `feedback:`),
  resolves the Slack user back to a Supabase `user_id` via
  `slack_user_id`.
- `agent-tick` — outbound DMs via `sendSlackDM()`.
- `agent-command`, `generate-1on1-prep`, `generate-dci-brief` — also post to
  Slack.

**Verdict: Slack push notification infrastructure is fully wired and
battle-tested (comment even notes "Slack bot tokens don't expire, so no
refresh flow needed").** The only real gap for Idea #4b (pinging *other*
people, not just the inbox owner) is that `user_slack_credentials` is keyed
by the app's own authenticated user — there's no mechanism to resolve an
arbitrary teammate (tagged via `cos_team_members`) to *their* Slack ID unless
they too have connected Slack to this app. That's a genuine gap, covered in
Section 6 under "blocked on idea #8."

---

## 2. Trigger design: "before your 1:1 with X"

### 2.1 How the system knows a 1:1 with X is upcoming

Already solved by existing infrastructure — reuse it as-is:

- `cos_one_on_one_events` holds calendar-synced 1:1s with a
  `team_member_id` FK to `cos_team_members`.
- `agent-tick`'s `prestagePreps()` (lines 641-781) already queries this table
  for events in the next 12 hours, filters via `meetingQualifiesForPrep()`
  (1:1s always qualify; group meetings only if opted in via
  `cos_prep_schedule.included_group_series`), and checks a per-member
  override (`cos_team_members.agent_overrides.auto_prep === false`) to skip.

The new piece: resolve `team_member_id` → the set of `inbox_tags` of type
`'person'` whose `member_id` matches, then find open `inbox_items` joined
to those tags via `inbox_item_tags`.

```
cos_one_on_one_events.team_member_id
  → cos_team_members.id
  → inbox_tags.member_id (type = 'person')
  → inbox_item_tags.tag_id
  → inbox_items (status = 'open')
```

This is a clean join; no schema change needed for the linkage itself (the
`member_id` column on `inbox_tags` already exists for exactly this purpose
per `20260713000001_inbox_tables.sql`).

### 2.2 How far ahead does it nudge

Match the existing prep-staging window rather than invent a new one:
**12 hours ahead**, same as `prestagePreps`. Rationale: consistency (one
mental model — "prep and nudges both land the morning of / evening before"),
and it reuses the same query window so the two features can share one pass
over `cos_one_on_one_events` instead of two.

Do NOT nudge every tick while the meeting is in the 12-hour window — nudge
**once per event**, gated the same way `prestagePreps` gates
double-staging: a `cos_agent_log` row with `event_type = 'inbox_nudge_sent'`
and `event_id = <event.id>` inserted today. This is copy-paste of the
existing `alreadyStaged` check pattern (lines 688-697).

Edge case: if there are zero open inbox items tagged to that person, send no
nudge at all — silence is correct, not a "nothing to report" message (avoids
noise).

### 2.3 Nudge content

Group by meeting, not by item (mirrors `nudgeActionItems`'s grouping by
member): "You have a 1:1 with Priya tomorrow at 2:00 PM — 3 open items
tagged to her: [...]". Include the same Block Kit overflow pattern
(mark done / snooze) already built for `cos_meeting_actions`, adapted to
operate on `inbox_items.status` instead of `cos_meeting_actions.status`.

---

## 3. Due-date monitoring design

### 3.1 Does `priority_due_at` already cover "due date"?

**No — it's the wrong column semantically, and the plan should not reuse it
as-is.** From `supabase/migrations/20260717000000_inbox_priority_due_at.sql`
and `src/types/inbox.ts`:

> `priority_due_at`: "Informal 'gut feel' due date set via Prioritize mode's
> pills... Not a hard deadline." It **decays** — tier pills (now/1d/3d/.../1m)
> recompute a displayed tier from it over time unless `priority_fixed` is
> true (set via the calendar picker).

Using this column for due-date nudge triggers would mean:
- Items whose tier was set casually via a pill (not `priority_fixed`) would
  trigger nudges based on a decaying "vibe" date the user never confirmed as
  a real deadline — high false-positive risk (see Section 7).
- Items with `priority_fixed = true` (calendar-picked) are a legitimate
  signal — this subset is safe to use.

**Recommendation:** Do not add a new `due_at` column. Reuse
`priority_due_at`, but **only nudge on rows where `priority_fixed = true`**.
This avoids a schema migration and a second due-date concept living
alongside the first (which would confuse the Prioritize-mode UI and any
future reporting). Document this constraint clearly in the nudge query
comment, since `priority_due_at`'s own migration comment doesn't anticipate
this use.

If product later wants nudges on *soft* (pill-based) due dates too, that's a
follow-up decision, not a v1 default — soft dates are casual by design and
nudging on them contradicts their purpose.

### 3.2 Cron/schedule mechanism: extend `agent-tick`, don't create a new function

Extend `agent-tick`'s existing per-user loop with a new handler,
`nudgeInboxDueItems()`, called alongside `nudgeActionItems()` — same
30-minute pg_cron cadence (`agent-tick-30m`), same quiet-hours gate, same
`AgentConfig` object threaded through. Do **not** create a second scheduled
edge function:
- A second cron job scanning the same `user_id` set would double the
  service-role DB load for no benefit.
- `agent-tick` already centralizes the "which users have the agent enabled"
  fan-out (`cos_settings.agent_config.enabled`), the adaptive nudge-timing
  logic (too-early/too-late feedback adjusts `nudge_timing_hours`), and the
  per-tick completion log — all directly reusable.

New query (window mirrors `nudgeActionItems`'s `nudgeWindowMs` pattern):

```sql
select id, text, priority_due_at, user_id
from inbox_items
where user_id = :userId
  and status = 'open'
  and priority_fixed = true
  and priority_due_at is not null
  and priority_due_at <= now() + (:nudge_timing_hours || ' hours')::interval
```

De-dupe and cap using the same `cos_agent_log` event-type pattern already
proven for `cos_meeting_actions` (`nudge_sent` / `nudge_capped`), just with a
distinguishing event_type (`inbox_due_nudge_sent` /
`inbox_due_nudge_capped`) and an `item_id` column analogous to `action_id`
(see Section 6 for the schema change this requires — `cos_agent_log` is
currently keyed to `action_id`/`event_id`/`member_id`, not `item_id`).

---

## 4. Agenda pre-staging design — concrete definition

"Pre-stage the next meeting's agenda from unresolved items" means, concretely:

**Do NOT create a new inbox item.** Instead, append a structured section to
`cos_one_on_one_prep.content` for that `team_member_id`, following the exact
mechanism `prestagePreps()` already uses to write AI-generated prep (it
calls `generate-1on1-prep`, which writes `content`, `source = 'ai_generated'`
... — actually per the migration `source` is constrained to `('cleargo',
'static')`, so this needs verification/possible constraint update before
implementation, flagged below).

Concretely: after (or as part of) `generate-1on1-prep`'s existing prep
generation, inject a new subsection into the prep content:

```markdown
## Open inbox items tagged to Priya
- [ ] Review Q3 roadmap doc (open 12 days)
- [ ] Approve budget line for contractor (due tomorrow)
```

sourced from the same join described in Section 2.1
(`cos_team_members.id → inbox_tags.member_id → inbox_item_tags →
inbox_items where status = 'open'`).

Two implementation options, in order of preference:

**Option A (preferred):** Extend `generate-1on1-prep`'s prompt/context
assembly to pull open inbox items tagged to the person and include them as
a structured section the LLM incorporates into the generated prep narrative
(same call site `agent-tick` → `prestagePreps` already invokes). Pro: one
prep document, one source of truth, agenda items woven in with other
context (topics, escalations) rather than a bolted-on list. Con: requires
opening up `generate-1on1-prep`'s code, which is out of this investigation's
read scope — needs its own read-through before estimating confidently.

**Option B (fallback, less invasive):** After prep generation, a
`appendInboxAgendaSection()` helper does a direct string append to
`cos_one_on_one_prep.content` (read-modify-write, matching the append
pattern already used in `delegate-inbox-task`'s `planPhase` for
`inbox_items.body`, lines 200-209 of that file). Pro: doesn't touch
`generate-1on1-prep` internals. Con: two disjoint writers to the same
`content` field risk clobbering each other's edits; needs an idempotency
marker like the summary-block dedupe already used in `delegate-inbox-task`
(`if (!existingBody.includes(summaryBlock))`).

**Recommendation: start with Option B for v1** (lower blast radius, ships
faster, reuses a proven idempotency pattern), revisit Option A once the
feature has usage data.

**Schema flag:** `cos_one_on_one_prep.source` has a CHECK constraint
`IN ('cleargo', 'static')` — the codebase's own `prestagePreps()` code
queries for `source = 'ai_generated'` (line 706), which **cannot currently
exist under that constraint**. This looks like a pre-existing bug or a
stale/renamed constraint, unrelated to Idea #4, but it directly affects
Option A/B's write path if we key off `source`. Flagging as a pre-existing
inconsistency to resolve (likely as part of implementation, not a new
issue this feature introduces) — confirm the actual live constraint via
`list_tables`/`get_advisors` against the running Supabase project before
writing code.

---

## 5. Onboarding & User Education

This is the most "agentic" and surprising behavior of all nine ideas being
planned: it's the first feature where the product **initiates** contact with
the user (in-app and via Slack DM) rather than responding to something they
did. Every other inbox interaction today is pull (user opens the app, user
types, user taps a nudge composer icon that already exists but has never
fired). Shipping this with a silent config flip is the wrong call — it will
read as the app "knowing too much" (see Section 6's privacy risk) at the
exact moment it's trying to build trust. Education is not a nice-to-have
wrapper here; it **is** the risk mitigation for notification fatigue and
false positives already flagged in Section 6, and it needs its own
implementation slot in Section 7, not a footnote.

### 5.1 Opt-in model: explicit first-run consent, not silent activation

Recommend a **dedicated opt-in moment**, distinct from and in addition to
the blanket `agent_config.enabled` toggle in `AgentSettingsPanel.tsx`. Two
reasons this needs its own moment rather than piggybacking on the existing
toggle:

1. Users who already turned the agent on for `cos_meeting_actions` nudges
   (existing behavior) will otherwise get inbox nudges silently bundled in
   the moment this ships — exactly the "existing users get new behavior for
   free" problem flagged in Section 6. The migration backfill already sets
   `nudge_inbox_items = false` for them (Section 6); this section defines
   what fills that gap: a one-time prompt, not just a quiet opt-out buried
   in settings.
2. A brand-new user connecting Slack for the first time should see this
   framed as a distinct capability ("I can also watch your inbox and nudge
   you") rather than assume it's implied by "connect Slack."

**Concrete mechanism:** the first time `agent-tick` would otherwise send the
*first* inbox-related nudge for a user (either trigger type), instead of
sending it, it inserts a one-time `agent_question`-type `inbox_items` row
(reusing the existing type and its CTA affordance in
`src/components/inbox/InboxItemRow.tsx` line 436-444 — `agent_question` rows
already render a CTA button) that asks for opt-in before any Slack DM is
ever sent for this feature. This guarantees the *first* thing a user sees
about this capability is in-app and asks permission — not a DM that already
assumes yes.

Draft copy for that one-time prompt (`inbox_items.text` /
`agent_payload.rationale` / `cta_label`):

> **Text:** "Want me to flag open items before your 1:1s and as due dates
> approach?"
> **Rationale (shown on hover/expand):** "I noticed you have items tagged to
> people you meet with regularly. I can remind you about those before each
> 1:1, and ping you in Slack as due dates get close — so nothing slips
> through unnoticed. You can turn this off anytime in Settings → Agent."
> **CTA label:** "Turn on nudges" (secondary link/dismiss: "Not now")

Clicking "Turn on nudges" sets `agent_config.nudge_inbox_items = true` (the
flag from Section 6) and only *then* does `agent-tick` begin sending real
nudges — including the one that triggered this prompt, now sent for real on
the next tick. "Not now" dismisses the item (marks it `archived`) without
changing the flag, and — to avoid re-prompting every tick — `agent-tick`
checks for a prior `inbox_items` row with
`agent_payload.source = 'inbox_agent_optin_prompt'` before creating another
one, re-offering only after a cooldown (recommend 14 days, matching the
existing "don't nag" philosophy already baked into `nudge_max_count`).

### 5.2 First-run / empty-state copy for the actual nudge

Once opted in, the first real nudge a user receives — in-app or via
Slack — needs to visibly answer three questions inline, not require a click
to a help doc: *who generated this, why now, how do I control it.*

**In-app (`inbox_items` row, type `agent_nudge`):** The row already renders
with an amber left-border and background (`TYPE_ACCENT`/`AGENT_BG` in
`InboxItemRow.tsx` lines 56-76) and a lightning-bolt icon (`TYPE_ICON`,
line 50) — visually distinct from a self-authored task today, but nothing
currently explains *why* it exists. Add a persistent (not hover-only)
one-line provenance caption under the item text for `agent_nudge` rows,
sourced from `agent_payload.rationale` (a field the type already
supports — see `src/types/inbox.ts`):

> Item text: "3 open items tagged to Priya — 1:1 today at 2:00 PM"
> Provenance caption (small, muted, always visible — not just on hover):
> "Suggested by your agent · based on your 1:1 with Priya today"

For the due-date variant:

> Item text: "Approve budget line for contractor — due tomorrow"
> Provenance caption: "Suggested by your agent · due date approaching"

**Slack DM (first one only):** prepend a one-line explainer that does not
appear on subsequent DMs (tracked via the same `cos_agent_log` event-type
pattern used for de-duping nudges elsewhere in this plan — a
`inbox_nudge_explainer_shown` row per user, checked once):

> :sparkles: *This is a new kind of message from your agent — a heads-up
> about inbox items tied to people or dates, sent automatically before they
> become a problem.*
> *(You can turn this off anytime: Settings → Agent → Inbox nudges. This
> explainer only shows once.)*
>
> [normal nudge content follows, e.g.: "You have a 1:1 with Priya today at
> 2:00 PM — 3 open item(s) tagged to her:"]

This mirrors the existing feedback-button pattern already in
`nudgeActionItems()` (Helpful / Too early / Not helpful, lines 593-615 of
`agent-tick/index.ts`) — reuse those same three buttons on inbox nudges
(Section 6 already scopes this as shared feedback wiring in Step 6) so the
first nudge doubles as a data point for the adaptive timing logic, not just
an announcement.

### 5.3 Inline hovers/tooltips: "why am I seeing this"

Beyond the persistent caption in 5.2 (which handles the *first-run*
explanation), every `agent_nudge` row should carry a hover tooltip with
more specific provenance than the one-line caption has room for — pattern
matches the existing `title={s.reason}` tooltip already used for AI tag
suggestions in the same file (`InboxItemRow.tsx` line 232).

**Touchpoint:** `src/components/inbox/InboxItemRow.tsx`, on the `agent_nudge`
type icon (line 50, currently a bare `<Zap>` with no `title`) — add
`title={item.agent_payload?.rationale}`:

> Tooltip text: "Suggested because you have a 1:1 with Priya today at 2:00
> PM and 3 open items are tagged to her. Adjust cadence in Settings → Agent."

**Settings surface tooltips** — `src/components/cos/AgentSettingsPanel.tsx`
already groups related controls under labeled sections with a `title` prop
(e.g. `title="Activation"` line 178, `title="When it contacts you"` line
363) but doesn't explain individual fields inline beyond their label. This
feature adds a new toggle (`nudge_inbox_items`, Section 6/7) that needs its
own explanatory copy, since "nudge_actions" and "nudge_inbox_items" will
otherwise read as unexplained near-duplicates sitting next to each other:

> **New toggle label:** "Inbox item nudges"
> **Helper text below the switch (small, muted — matches the panel's
> existing style for e.g. the nudge_timing_hours description):** "Get a
> heads-up before 1:1s about open items tagged to that person, and as
> due-dated items approach their date. Uses the same quiet hours and Slack
> settings as your other agent nudges below."

The existing `nudge_timing_hours` / `quiet_hours_start` / `quiet_hours_end`
fields (already rendered somewhere in this panel per the `AgentConfig`
interface, lines 16-29) should get a one-line note added — if not already
present — clarifying that inbox nudges now share these same knobs rather
than having their own separate timing config (a design decision made in
Section 7, Step 6): "Applies to all agent nudges, including inbox items."

### 5.4 "What's new" callout / changelog entry

Draft copy for wherever this app surfaces changelog/release entries today
(no existing changelog/what's-new component was found in
`src/` during this investigation — if one doesn't exist, the minimal
version is a one-time `agent_question`/`brief_item`-style `inbox_items` row
injected for all users on release, which the app already has precedent for
via the daily/weekly `brief_item` sync mechanism referenced in
`src/types/inbox.ts`'s `AgentPayload.brief_kind` field):

> **Headline:** Your agent now watches your inbox, not just your meetings
>
> **Before:** Overdue commitments went unnoticed until someone brought them
> up — in the 1:1 itself, or worse, after it. Tracking who owed you what,
> and by when, was on you.
>
> **Now:** Before a 1:1, your agent flags open items tagged to that person
> so you walk in prepared instead of catching up live. As due dates
> approach, it pings you in Slack — so nothing quietly slips past its
> deadline. It never contacts anyone but you, and you're always one click
> from turning it off.
>
> **CTA:** "Turn on inbox nudges" → deep-links to the Section 5.1 opt-in
> prompt / `AgentSettingsPanel.tsx`'s new toggle.

This copy deliberately does not oversell — it names the exact two triggers
being shipped (pre-1:1, due-date) rather than a vague "smarter agent"
claim, since Section 4's agenda pre-staging is a *silent* enhancement to
existing prep content (no new UI surface) and should not be advertised as a
user-facing feature in this callout until Step 7 ships; a second, smaller
changelog line covers it then:

> **Follow-up entry (after Step 7 ships):** Your 1:1 prep now includes any
> open inbox items tagged to that person automatically — one less thing to
> check before you walk in.

### 5.5 Effort estimate

**1.5 weeks**, sized separately from the engineering steps in Section 7 (it
touches the same files but is a distinct, sequenceable slice of work —
copywriting, the one-time opt-in item/prompt logic, and the tooltip/toggle
UI):

- 2 days — opt-in prompt mechanism (5.1): the one-time `agent_question` row,
  the `inbox_agent_optin_prompt` dedupe/cooldown check in `agent-tick`, and
  gating real nudges behind `nudge_inbox_items` being explicitly turned on
  via that prompt (not just defaulted).
- 2 days — in-app provenance UI (5.2, 5.3): persistent caption under
  `agent_nudge` item text, tooltip on the type icon, sourced from
  `agent_payload.rationale` — both in `InboxItemRow.tsx`.
- 1 day — first-DM explainer banner + de-dupe log check (5.2).
- 2 days — settings panel copy + new toggle wiring in
  `AgentSettingsPanel.tsx` (5.3), including the shared-quiet-hours
  clarification note.
- 1 day — changelog/what's-new entry copy + whatever mechanism the app uses
  to surface it (component if one exists; otherwise the fallback
  `inbox_items` broadcast row described in 5.4).
- 1 day — copy review pass + a short internal dry run (have 2-3 people opt
  in and read the actual rendered copy in context before wider rollout) to
  catch anything that reads as more surveillance-y in practice than it did
  on paper — this is exactly the kind of thing that's hard to judge from
  the copy draft alone given the privacy risk already flagged in Section 6.

**Sequencing:** fold as its own item into the Section 7 step order — see
the renumbered Section 7 below, where this lands as **Step 0 (prerequisite,
before Step 2)** for the opt-in mechanism, and **parallel to Steps 2-3** for
the in-app/Slack copy, since the nudge-sending code and the
explanation-of-the-nudge code need to ship together, not education bolted
on after nudges are already live in the wild.

---

## 6. Files to change/create, by dependency status

### 6.A Safe to build now (no external blockers)

| File | Change |
|---|---|
| `supabase/functions/agent-tick/index.ts` | Add `nudgeInboxItemsForMeeting()` (Section 2) and `nudgeInboxDueItems()` (Section 3) handlers; wire into main loop next to `nudgeActionItems`/`prestagePreps`; extend `AgentConfig` with `nudge_inbox_items: boolean` (default true, so existing users don't silently get new Slack DMs — see Section 7) and reuse `nudge_timing_hours`/`nudge_max_count`. |
| `src/components/inbox/InboxItemRow.tsx` | Add persistent provenance caption + tooltip on `agent_nudge` rows, sourced from `agent_payload.rationale` (Section 5.2, 5.3). |
| `src/components/cos/AgentSettingsPanel.tsx` | Add `nudge_inbox_items` toggle with helper text under the existing "When it contacts you" section (Section 5.3). |
| `supabase/functions/agent-tick/index.ts` (or a shared module) | `appendInboxAgendaSection()` helper (Option B, Section 4). |
| New migration `supabase/migrations/2026XXXXXXXXXX_agent_log_inbox_columns.sql` | `ALTER TABLE cos_agent_log ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES inbox_items(id) ON DELETE SET NULL;` plus extend the `event_type` CHECK constraint (find it — likely in `20260620000000_relationship_memory_agent_foundation.sql` or a later migration) to allow `inbox_nudge_sent`, `inbox_nudge_capped`, `inbox_due_nudge_sent`, `inbox_due_nudge_capped`, `inbox_agenda_staged`. |
| `supabase/functions/agent-slack-action/index.ts` | Extend the Block Kit action-id switch to handle `mark_done:<inbox_item_id>` / `snooze:<inbox_item_id>:<days>` against `inbox_items` (currently only handles `cos_meeting_actions`). Needs a disambiguating prefix, e.g. `inbox_mark_done:` / `inbox_snooze:`, since action IDs are strings without a type tag today — check for collision risk with existing `mark_done:` used for `cos_meeting_actions` UUIDs (UUIDs don't collide across tables, but explicit prefixing is safer and clearer in Slack payload logs). |
| `src/types/inbox.ts` | No change needed — `AgentPayload.source`/`rationale`/`cta_label`/`cta_action` already model what a nudge-generated item needs. Populate `source: 'agent_nudge_before_1on1'` / `'agent_nudge_due_date'` for observability/analytics segmentation. |
| `src/components/inbox/InboxItemRow.tsx`, `AgentBar.tsx` | No change needed — `agent_nudge` rendering (amber icon/background) already implemented; this feature is the first to actually populate it. Verify visually once real nudge items exist (currently untestable because nothing generates them). |
| `supabase/functions/generate-1on1-prep/index.ts` | (If Option A chosen) extend context-gathering to include tagged open inbox items. Needs its own read before scoping — not read in this investigation. |
| Confirm/fix `cos_one_on_one_prep.source` CHECK constraint mismatch (Section 4) | Likely a small migration; verify against live schema first via Supabase MCP `list_tables`. |

### 6.B Blocked on idea #8 (people delegation / cross-user Slack resolution)

Idea #4b as originally scoped — "ping item owners in Slack as due dates
approach" for items **delegated to someone else** — requires knowing who
"the owner" is and resolving *their* Slack identity, not the inbox owner's.
Today:
- `inbox_items` has no `assignee`/`delegated_to_user_id` concept — it's a
  single-user table (`user_id` = the owner who sees it in their own inbox).
- `inbox_tags` person-tags (`member_id → cos_team_members`) represent
  *who the item is about*, not *who owns the follow-up*. `cos_team_members`
  itself has no `user_id` pointing at a Supabase auth user (it's a
  free-text CRM-style row: `name`, `role`, `relationship_type`) — so even if
  a delegation concept existed, there's no join from "person X" to "X's own
  Slack credentials" unless X is also a user of this app with their own
  `user_slack_credentials` row.
- Sending a Slack DM to an arbitrary email (not yet a connected user) is
  technically possible via `users.lookupByEmail` (already used in
  `agent-command/index.ts` line 105) if the *workspace* is shared, but that
  assumes both people are in the same Slack workspace as the OAuth-connecting
  user's token scope, which isn't guaranteed and isn't currently modeled.

**Verdict:** Confirmed blocking dependency, as the brief suspected. Do not
attempt v1 without idea #8 defining: (a) what "delegating an inbox item"
means schema-wise, (b) whether delegates must also connect Slack to this
app or whether cross-workspace lookup-by-email is acceptable, (c) consent —
pinging someone in Slack on another person's behalf needs its own opt-in,
distinct from the inbox owner's own `agent_config.enabled`.

**Scope decision for v1: self-owned items only.** Sections 2-4 of this plan
(nudge-before-1:1, due-date nudge, agenda pre-stage) all operate on the
inbox owner's own items about someone else — never send anything to that
other person. This sidesteps the idea #8 dependency entirely for v1.

### 6.C No blockers found, but flagged as pre-existing gaps to verify before coding

- `cos_one_on_one_prep.source` CHECK constraint vs. `prestagePreps()`'s
  `'ai_generated'` query (Section 4) — confirm live schema state.
- `inbox_items` one-time opt-in prompt (Section 5.1) and first-DM explainer
  de-dupe log check (Section 5.2) — new, small pieces of state, but easy to
  overlook since they don't map to an existing pattern for a *new feature's*
  own onboarding, only to patterns for de-duping steady-state nudges.
- `cos_agent_log.event_type` CHECK constraint — must be extended (5.A) or
  inserts will fail at runtime with a constraint violation (this is exactly
  the kind of silent-until-runtime bug this class of change tends to
  introduce; write the migration test to catch it, see Section 9).

---

## 7. Risks

**Notification fatigue.** `agent-tick` already has a proven design for
this — reuse every knob rather than inventing new thresholds:
- `nudge_max_count` (default 5): stop nudging a stale item after N nudges,
  park it silently (`nudge_capped` log event) rather than nagging forever.
- Adaptive `nudge_timing_hours`: 3+ "too early" feedback events in 30 days
  push the window later; 3+ "too late" pull it earlier.
- Quiet hours (`quiet_hours_start`/`end`, default 18:00-09:00 local).
- A new risk specific to this feature: **stacking**. A user with 5 people
  tagged and meetings back-to-back could get 5 separate Slack DMs in one
  morning (1:1 nudges) plus due-date nudges plus the existing
  `cos_meeting_actions` nudges plus escalations plus format
  recommendations — five *different* notification types from one agent tick.
  Recommend a **per-tick digest cap**: collapse all inbox-related
  notifications for one user into a single Slack message per tick (mirroring
  `nudgeActionItems`'s existing per-member grouping, but one level up —
  group across meeting-nudge + due-date-nudge in the same tick before
  calling `sendSlackDM`). This is a design addition beyond what `agent-tick`
  does today for `cos_meeting_actions` and should be scoped explicitly, not
  left as a "nice to have."
- Add a new `AgentConfig.nudge_inbox_items` toggle defaulting to **true**
  only for users who have never interacted with the inbox agent surface
  before is the wrong default — default it to **false** for existing users
  with `agent_config.enabled = true` today (a migration backfill), and true
  only for newly onboarded users, so this ships without silently changing
  behavior for the existing `cos_meeting_actions` nudge audience. Surface it
  as an explicit opt-in toggle in whatever settings UI exposes
  `agent_config` today.

**False positives.**
- Nudging on `priority_due_at` when `priority_fixed = false` (Section 3.1)
  would nudge on a decaying "vibe" tier, not a real deadline — mitigated by
  restricting to `priority_fixed = true` only.
- A person-tag (`inbox_tags.member_id`) can be stale (person left the team,
  `cos_team_members` row still exists) — nudging "before your 1:1 with
  Priya" when Priya no longer works there, or the recurring meeting was
  cancelled, is a real risk. `meetingQualifiesForPrep()` checks
  `cos_one_on_one_events.status = 'confirmed'`, which covers cancellation,
  but doesn't cover "team member marked inactive" — check if
  `cos_team_members` has an active/inactive flag; if not, that's a gap this
  feature will expose (not introduce).
- Group 1:1s or ambiguous tagging (an item tagged with multiple people) —
  decide whether such an item surfaces in *every* tagged person's
  pre-meeting nudge (likely correct) or gets suppressed as ambiguous
  (probably wrong — under-notifying is worse here than one item appearing
  in two nudges).

**Privacy: agent reading person-tag data to nudge about someone.**
- `inbox_tags`/`cos_team_members` already store free-text `context_notes`
  about real people (performance concerns, personal context) that the
  inbox owner wrote for themselves. This feature's queries only ever touch
  tag *names* and item *text*, not `context_notes` or `cos_relationship_topics`
  sentiment/category fields — confirm the actual implementation never pulls
  those into a Slack message body (Slack DMs are logged/searchable within a
  workspace by admins, unlike this app's own RLS-protected DB).
  **Recommendation: nudge message bodies should reference item text only,
  never `context_notes` or topic sentiment**, even though the join *could*
  technically reach them. Add this as an explicit code-review checklist
  item, not just a convention.
- Because Slack messages are sent to a DM the user's own workspace admins
  can potentially access (per standard Slack admin export policies, not
  something this app controls), nudge content should stay factual/neutral
  ("3 open items tagged to Priya") and never include qualitative judgments
  an LLM might otherwise be tempted to add ("Priya seems to be falling
  behind") — this is a prompt-design constraint if any LLM summarization
  touches the nudge text (the plan above does not require an LLM call for
  nudge text — pure templating is sufficient and safer).

---

## 8. Incremental steps and effort estimates

Total: **7.5-9.5 weeks** for nudges + Slack integration (v1, self-owned
items only, including the onboarding/education work), **+2 weeks** for
agenda pre-staging (Option B) — adjusted upward from the brief's 4-6 week
estimate because (a) reusing `agent-tick` still requires careful surgery on
a live, already-complex scheduled function serving other features, (b) the
digest-cap risk mitigation (Section 7) and the `cos_agent_log`/
`cos_one_on_one_prep` schema fixes (Section 6) are net-new scope the
original estimate didn't anticipate, and (c) the onboarding/education work
(Section 5, 1.5 weeks) is scoped as core v1 work, not a post-launch
polish pass — this is the most surprising/agentic behavior of all nine
ideas and ships with an explicit opt-in moment, not a silent flag flip.

**Step 0 (2 days) — Opt-in prompt mechanism (Section 5.1).**
Build the one-time `agent_question`-type `inbox_items` row that asks for
consent before any inbox-related Slack DM is ever sent, plus the
`inbox_agent_optin_prompt` dedupe/cooldown check in `agent-tick`. This is a
genuine prerequisite, not just an early nice-to-have: Steps 2-3 below must
gate their first real send behind this flag being explicitly set, so the
opt-in mechanism has to exist before either nudge type goes live, even in
a small internal cohort.

**Step 1 (3-4 days) — Schema groundwork.**
Migration: `cos_agent_log.item_id` column + `event_type` CHECK extension.
Verify/fix `cos_one_on_one_prep.source` constraint. Confirm no
`cos_team_members` active/inactive flag exists (decide whether that's
in-scope or a follow-up). No behavior change yet — pure schema + a data
audit query to sanity-check how many real person-tags/items exist in
current data (informs whether nudge volume will be meaningful or trivial).

**Step 2 (1 week + 1 day) — Due-date nudge (`nudgeInboxDueItems`) + its
provenance copy.**
Simplest of the three triggers: no calendar join needed, just
`priority_fixed = true` + `priority_due_at` window query. Add to
`agent-tick`, reuse `sendSlackDM`, cap/dedupe via `cos_agent_log`. Ship
behind `agent_config.nudge_inbox_items` flag, off by default for existing
users, gated behind Step 0's opt-in. The extra day folds in this trigger's
half of Section 5.2/5.3's in-app provenance caption and tooltip work on
`InboxItemRow.tsx` (`agent_payload.rationale` copy for the due-date case)
— ships in the same PR as the trigger itself, not after.

**Step 3 (1.5 weeks + 1 day) — Pre-1:1 nudge (`nudgeInboxItemsForMeeting`)
+ its provenance copy.**
Requires the `cos_team_members ↔ inbox_tags` join and reuse of
`meetingQualifiesForPrep`. Ship in the same tick as Step 2's handler but as
a separate, independently toggleable sub-flag if `agent_config` schema
allows nested config cheaply (else one flag covers both — decide during
Step 1). The extra day folds in this trigger's half of the provenance copy
(5.2/5.3) plus the first-DM explainer banner and its one-time de-dupe check
(5.2) — the explainer needs both trigger types wired up to be meaningful,
so it lands here rather than in Step 2.

**Step 4 (1 week) — Digest-cap mitigation.**
Collapse same-tick inbox notifications into one Slack message per user
(Section 7). This should land before Step 2/3 go to any real users, not
after — sequence it as parallel work with Step 2/3, not a phase-2 cleanup,
or early testers will see the exact notification-fatigue problem this plan
is trying to avoid.

**Step 5 (1 week) — Slack interactive actions for inbox items.**
Extend `agent-slack-action` to handle `inbox_mark_done:` /
`inbox_snooze:` against `inbox_items`. Without this, nudges are read-only
FYIs and the user must switch to the app to act — significantly weaker
value prop, so treat as core v1, not a stretch goal.

**Step 6 (3-5 days + 2 days) — Feedback loop wiring + settings panel
education.**
Reuse the existing `cos_agent_feedback` too-early/too-late/helpful buttons
(already built for `cos_meeting_actions` nudges) on the new inbox nudge
messages, and confirm the adaptive `nudge_timing_hours` logic in
`agent-tick` (lines 274-301) applies uniformly across both nudge types or
needs a per-type timing config (recommend: shared timing config for v1,
split later if data shows people want different cadences for meeting-prep
nudges vs. due-date nudges). The extra 2 days add the `nudge_inbox_items`
toggle + helper text to `AgentSettingsPanel.tsx` and the shared-quiet-hours
clarification note (Section 5.3) — this is the toggle Step 0's opt-in
prompt actually sets, so the settings-panel affordance and the opt-in
mechanism should both exist before any wider rollout (a user who says yes
via the in-app prompt but can't find the toggle to later turn it off is a
worse first impression than shipping neither).

**Step 6.5 (1 day) — "What's new" callout (Section 5.4).**
Ship the changelog/what's-new copy for the pre-1:1 and due-date triggers
once Steps 2-3-6 are live behind the flag. Deliberately excludes agenda
pre-staging (Step 7 below hasn't shipped yet) — the follow-up changelog
line for that ships with Step 7, not bundled in early.

**Step 7 (2 weeks + 0.5 day) — Agenda pre-staging (Option B) + its
changelog follow-up.**
`appendInboxAgendaSection()` with idempotency marker, wired into
`prestagePreps()`'s success path. Includes UI verification that
`cos_one_on_one_prep` content renders the new section correctly wherever
prep is displayed (need to locate that component — not read in this
investigation). The extra half-day ships the Section 5.4 follow-up
changelog entry once this is live — this feature is silent in-product (no
new inbox item, no new UI surface), so the changelog line is the *only*
place a user learns it exists, making it non-optional rather than a nice
finishing touch.

**Sequencing note:** Steps 0-6.5 should ship to a small internal
cohort (e.g., just the requesting user / a feature flag) before wider
rollout, given the notification-fatigue and false-positive risks in
Section 7 are best caught with real usage, not just code review. Do not
let Step 0 (opt-in) slip behind Steps 2-3 (the actual nudges) — building
the trigger logic before the consent mechanism risks the team treating
consent as an afterthought to bolt on right before ship, which is the
exact "silent activation" outcome this plan is trying to avoid.

---

## 9. Testing coverage

**Unit / integration (Vitest, matching `npm run test` conventions):**
- `nudgeInboxDueItems`: item with `priority_fixed=false` never nudges;
  item with `priority_fixed=true` and `priority_due_at` inside the window
  nudges exactly once; a second tick within the same day does not
  re-nudge (de-dupe via `cos_agent_log`); after `nudge_max_count` nudges,
  the item is capped and a `inbox_due_nudge_capped` log row is written
  exactly once.
- `nudgeInboxItemsForMeeting`: no open tagged items → no Slack call at all
  (assert `sendSlackDM` not invoked — silence-is-correct case); event not
  `status='confirmed'` → skipped; per-member `agent_overrides.nudge_actions
  === false` → skipped (reuse the existing suppression pattern test, if one
  exists for `nudgeActionItems` — check `supabase/functions/agent-tick`
  for existing test coverage first, since none was found in this
  investigation's read).
- Digest cap: two nudge types firing in the same tick for the same user
  produce exactly one `sendSlackDM` call, not two.
- `agent-slack-action`'s new `inbox_mark_done:`/`inbox_snooze:` handlers:
  correct `inbox_items.status` transition; wrong/missing
  `user_slack_credentials.slack_user_id` → account not identified, no
  crash.
- Schema constraint test: inserting each new `cos_agent_log.event_type`
  value succeeds (catches the exact class of bug flagged in Section 6.C —
  a CHECK constraint silently rejecting a new event type at runtime).

**Manual / guarded-live (per `pm-ai-shipping` test-coverage conventions
referenced in this repo's tooling):**
- End-to-end: tag a real inbox item to a team member with an upcoming
  calendar 1:1, confirm the Slack DM arrives within the expected window and
  in the right format (grouped, not one-message-per-item).
- Quiet hours: confirm no DM arrives when the tick fires during the user's
  configured quiet window, and the queued nudge fires on the next tick
  after quiet hours end (or is correctly still-eligible, matching the
  windowing logic already used for `nudge_actions`).
- Cross-timezone check: user with `timezone` set to a non-UTC zone gets
  correct day-labeling ("tomorrow" vs. a specific weekday) — reuse/extend
  the existing `meetingDayLabel()` unit tests if present.
- Privacy check (manual code review + a live test): confirm the actual
  Slack message text for a real nudge never contains `context_notes` or
  `cos_relationship_topics` content, only item text and tag/person names.
- Idempotency of agenda pre-staging: run `prestagePreps` twice in the same
  day for the same event, confirm the inbox agenda section is appended
  exactly once (not duplicated) in `cos_one_on_one_prep.content`.
- Load/volume sanity: with the digest cap in place, simulate a user with
  5+ tagged people and overlapping due dates, confirm they get a bounded
  number of Slack messages per tick (target: 1, per Section 7), not N.
- Opt-in gating (Section 5.1): confirm no real Slack nudge is ever sent for
  a user until `nudge_inbox_items` has been explicitly turned on via the
  opt-in prompt — not merely defaulted — and that the one-time prompt itself
  never repeats within its cooldown window.
- Provenance copy (Section 5.2, 5.3): snapshot-test that
  `agent_payload.rationale` is always populated for every nudge-generated
  `inbox_items` row (an empty tooltip/caption is worse than no tooltip at
  all — it looks broken, not intentionally minimal).

**Explicitly out of scope for this feature's test plan:**
- Cross-user Slack delegation (idea #8) — no tests needed until that
  dependency is scoped.
- `delegate-inbox-task`'s existing state machine — untouched by this work,
  no new tests needed there beyond confirming no naming/UI collision in
  Slack message copy (Section 0).

---

## Appendix: key files referenced in this investigation

- `supabase/migrations/20260713000001_inbox_tables.sql` — `inbox_items`,
  `inbox_tags`, `inbox_item_tags` schema.
- `supabase/migrations/20260717000000_inbox_priority_due_at.sql` —
  `priority_due_at`/`priority_fixed` semantics.
- `supabase/migrations/20260612100000_slack_credentials.sql` +
  `20260707000000_slack_sync_channels.sql` — `user_slack_credentials`.
- `supabase/migrations/20260419000000_create_cos_tables.sql` —
  `cos_team_members`.
- `supabase/migrations/20260423000000_create_cos_one_on_one_prep.sql` —
  `cos_one_on_one_prep` (note the `source` CHECK constraint issue,
  Section 4).
- `supabase/migrations/20260620000000_relationship_memory_agent_foundation.sql`
  — `cos_agent_log`, `cos_settings.agent_config`, pg_cron/pg_net setup.
- `supabase/migrations/20260620000001_agent_cron_schedule.sql` — the
  `agent-tick-30m` cron job definition.
- `supabase/functions/agent-tick/index.ts` — the background agent to
  extend (`sendSlackDM`, `nudgeActionItems`, `prestagePreps`,
  `meetingQualifiesForPrep`, `isInQuietHours`).
- `supabase/functions/agent-slack-action/index.ts` — inbound Slack
  interactive-button handler to extend.
- `supabase/functions/delegate-inbox-task/index.ts` — the *different*
  agentic loop (do-the-task-on-demand), not to be confused with this
  feature.
- `src/types/inbox.ts` — `InboxItem`, `AgentPayload`, `InboxTag` types.
- `src/hooks/useInboxItems.ts`, `useInboxTags.ts`, `useInboxDelegation.ts` —
  client-side inbox hooks.
- `src/components/inbox/InboxItemRow.tsx`, `AgentBar.tsx` — existing
  `agent_nudge` UI (amber styling), currently unused by any generator.
- `src/components/cos/AgentSettingsPanel.tsx` — the live settings surface
  for `cos_settings.agent_config` (existing "Activation" / "When it
  contacts you" sections); where the new `nudge_inbox_items` toggle and its
  explanatory copy land (Section 5.3).
