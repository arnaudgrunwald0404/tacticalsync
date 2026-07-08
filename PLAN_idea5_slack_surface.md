# Plan: Idea #5 — Slack as a Second Surface for the Inbox

Status: **PLANNING ONLY — no feature code written.** This document is for human review/approval before any implementation begins.

## 0. Ground truth (corrects the prior investigation)

The prior investigation flagged "no migration table for storing Slack OAuth tokens was found by grep" as a verification gap. **That gap is now closed: token storage already exists and is solid.** This changes the shape of the plan significantly — there is no blocking prerequisite to build a new connections table. The plan below is additive to existing infrastructure, not a bootstrap.

### What already exists (verified by reading full file contents)

| Piece | File | Status |
|---|---|---|
| Slack OAuth token storage | `supabase/migrations/20260612100000_slack_credentials.sql` | `user_slack_credentials` table: `user_id` (PK, FK to `auth.users`), `access_token`, `scope`, `slack_team_id`, `slack_team_name`, `slack_user_id`, `slack_email`, `sync_channels text[]`, sync status columns. RLS-locked; token-free public view `user_slack_credentials_public` exposes only a `connected` boolean to the client. |
| OAuth code exchange | `supabase/functions/exchange-slack-token/index.ts` | Full `oauth.v2.access` exchange, resolves `authed_user.id` (not the bot's id — correctly commented as a common bug), fetches email via `users.info`, upserts into `user_slack_credentials`. `verify_jwt = true`. |
| Slack → app message ingestion | `supabase/functions/slack-add-suggestion/index.ts` | **This is effectively a working prototype of "Slack message → inbox item."** It's a slash-command handler (`/add-to-my-lists`) that: verifies `X-Slack-Signature`/`X-Slack-Request-Timestamp` via HMAC-SHA256 with replay-window check (5 min skew), resolves `slack_user_id → user_id` via `user_slack_credentials`, and inserts into `dci_suggested_tasks` (not `inbox_items` — different table, from a parallel "Chief of Staff" suggestions feature). `verify_jwt = false` (correctly, since Slack calls this directly). |
| Interactive button handler (edge function copy) | `supabase/functions/agent-slack-action/index.ts` | Handles `block_actions` payloads for `mark_done:`, `snooze:`, `dismiss_escalation:`, `feedback:` action ids against `cos_meeting_actions` / `cos_agent_log` / `cos_agent_feedback` — **not** `inbox_items`/`inbox_delegations`. `verify_jwt = false`. **Gap found: this file does NOT verify the Slack request signature at all**, unlike `slack-add-suggestion`. That's an existing security hole, not a hypothetical one — see Risks §4. |
| Interactive button handler (Socket Mode copy) | `slack-bot/index.js` | A **second, independent implementation** of the same button handlers (`action_overflow:`, `feedback:`, `dismiss_escalation:`) using Slack Bolt in Socket Mode, plus `/checkin` and `/ask` slash commands and a `node-cron`-based scheduled DM poster. This appears to be a standalone Node process (not a Supabase edge function), likely for local dev or an alternate deployment path. **It duplicates `agent-slack-action`'s logic against the same tables.** Needs reconciliation — see Risks. |
| Slack message sync (read-only ingestion for 1:1 prep) | `supabase/functions/slack-messages-sync/index.ts` | Pulls DMs + selected channels via `conversations.history`, matches Slack users to `cos_team_members` by email/name, stores into `cos_slack_messages`. Supports both user-JWT and cron/service-role (`x-supabase-user-id` header) invocation. Unrelated to inbox items directly, but establishes the Slack API calling pattern. |
| DM-sending helper | `supabase/functions/agent-tick/index.ts` (`sendSlackDM`, ~line 121) | Existing, reusable: looks up `user_slack_credentials`, calls `conversations.open` then `chat.postMessage` with optional `blocks`. This is exactly the primitive the morning digest needs — **no new "send a Slack message" code should be written from scratch.** |
| Slack app manifest | **Not found in repo.** | No `manifest.json`/`manifest.yml` for the Slack app exists in this codebase. Scopes are inferred only from `slack-bot/README.md` (`commands`, `chat:write`, `app_mentions:read`, `users:read.email`) and from what `exchange-slack-token`/`slack-messages-sync` actually call (`oauth.v2.access`, `auth.test`, `users.info`, `users.list`, `conversations.list`, `conversations.history`, `conversations.open`, `chat.postMessage`). The Slack app is presumably managed by hand in the Slack API dashboard — **there is no source-of-truth manifest to diff against**, which is its own small risk (see §4). |
| `inbox_items` schema | `supabase/migrations/20260713000001_inbox_tables.sql` | `type` enum includes `agent_nudge`; `agent_payload jsonb` (`{ source, rationale, action_required, cta_label, cta_action }`); `source_ref jsonb` (freeform `{ type, id }`); `status` enum `open/done/archived/snoozed`, plus `snoozed_until`. This is the target table for the new Slack-originated items. |
| `inbox_delegations` schema | `supabase/migrations/20260713000003_inbox_delegations.sql` | Status enum `ramping_up/clarifying/planning/getting_it_done/seeking_approval/done/cancelled`. This is the target for a "Delegate" button action. |
| Signature verification reference implementation | `slack-add-suggestion/index.ts` lines 30–64 | Working `safeEqual` + HMAC-SHA256 v0 signature check with 5-minute skew window. **Reuse this exact code**, don't reinvent it. |

### Correction to the brief's framing

The brief's "Important verification gap" is resolved: token persistence is not a blocker. What actually needs building is:
1. A **webhook receiver for `reaction_added` events / message shortcuts** (nothing currently listens for these — `slack-add-suggestion` only handles a slash command, and `slack-messages-sync` only pulls history on demand, it doesn't react to live events).
2. **New interactive button action ids that target `inbox_items`/`inbox_delegations`** (the existing ones target `cos_meeting_actions`, a different, older feature's table).
3. A **morning digest scheduled function** (no digest function exists today; `daily-prep-batch` is the closest analog but serves a different feature).
4. Reconciling the **duplicate button-handling logic** between `agent-slack-action` (edge function) and `slack-bot/index.js` (Socket Mode) so the new Inbox actions aren't implemented a third time or built on top of the wrong one.

---

## 1. Prerequisite decision (not a build item, a decision item)

Before writing code, confirm with whoever owns Slack app config: **is `agent-slack-action` (HTTP Request URL / Events API) or `slack-bot/index.js` (Socket Mode) the system of record for interactivity going forward?** They currently coexist and both claim to handle the same action ids against different tables. Recommendation: standardize on the **edge function** (`agent-slack-action`) because:
- It's stateless, deploys with the rest of the Supabase functions, and doesn't require a persistently-running Node process.
- It already has the `verify_jwt = false` + public URL pattern Slack needs.
- Socket Mode (`slack-bot/index.js`) requires an always-on process outside Supabase's infra, which is an operational liability for a feature meant to be reliable enough for managers to trust.

If Socket Mode is kept for other reasons (e.g., `/checkin`), the new Inbox button logic should **still** live in the edge-function family for consistency, and `slack-bot/index.js` should not grow a second copy. This decision doesn't block starting migrations/webhook work but must be made before Step 3 (interactive buttons) is built, or the team will ship two competing handlers again.

---

## 2. Feature design

### 2a. Emoji reaction / message action → inbox item

**Slack event type:** Use **`reaction_added`** (Events API) as the primary trigger (✅ emoji, per the brief) plus a **message shortcut** ("Add to TacticalSync inbox") as a secondary, more discoverable trigger, since reactions are invisible to users who don't know the convention exists.

**Edge function:** New function `slack-inbox-capture` (Events API request URL for `reaction_added`, and the interactivity payload for the message shortcut — Slack requires both event types to hit an HTTP endpoint that responds within 3 seconds, so keep the handler thin and do the actual insert synchronously since it's a single-row write).

Flow for `reaction_added`:
1. Slack POSTs the event (`event.reaction`, `event.item.channel`, `event.item.ts`, `event.user` — the reactor, not the message author).
2. Verify `X-Slack-Signature` (reuse `slack-add-suggestion`'s `verifySlackSignature`).
3. Handle Slack's `url_verification` handshake challenge (required once, on subscribing the Events API — not needed by the slash-command/interactivity endpoints already in place, so this is new).
4. Filter: only act if `event.reaction === 'white_check_mark'` (✅) or whatever emoji is configured — make this configurable via an env var (`SLACK_CAPTURE_EMOJI`, default `white_check_mark`) rather than hardcoded, since teams will want to bikeshed the emoji.
5. Resolve `event.user` (the person who reacted) → `user_id` via `user_slack_credentials.slack_user_id`. If unmapped, silently no-op (can't create an item for an unknown user; do not error back to Slack, which would cause retries).
6. Fetch the reacted-to message via `conversations.history` (channel + `latest=ts`, `inclusive=true`, `limit=1`) using **the reacting user's own token** (not a bot token — this app is user-token-based per `exchange-slack-token`) so permissions match what that user can already see.
7. Build the permalink via `chat.getPermalink` (channel, message_ts) for the `source_ref`.
8. Insert into `inbox_items`:
   - `type = 'task'` (a reaction is a "make this actionable" signal, not an agent nudge)
   - `text` = first ~120 chars of the Slack message text (truncated, ellipsized)
   - `body` = full message text
   - `source_ref = { type: 'slack_message', channel_id, message_ts, permalink, team_id }`
   - `agent_payload = null` (this is user-originated, not agent-originated)
9. Respond `200` immediately regardless of outcome (Slack retries on non-2xx and on timeout; both are undesirable for a fire-and-forget capture).

Flow for the message shortcut ("Add to TacticalSync inbox") is identical from step 5 onward, except the trigger payload already contains the full message (`payload.message`), so no `conversations.history` call is needed, and Slack expects a `trigger_id`-based ack — for a simple capture (no modal), just ack with `{}` and optionally `chat.postEphemeral` a confirmation.

**Why both triggers:** Reactions are the brief's ask and are fast/frictionless, but only work for people who know the emoji exists and doesn't get accidentally triggered by someone reacting for an unrelated reason (e.g., someone else already used ✅ to mean "agreed", which would now double as "capture this"). The message shortcut is explicit and self-documenting, and costs little extra to add in the same function. **Recommend defaulting to the message shortcut as primary and treating the emoji reaction as opt-in per user** (a boolean on `user_slack_credentials`, e.g. `capture_via_reaction boolean default false`) to avoid silently capturing messages that happened to get a ✅ for other reasons. Flag this design choice for explicit sign-off — it changes scope slightly from the brief's "✅ or message action" framing to "message action by default, ✅ opt-in."

### 2b. Interactive buttons on nudge messages (Done / Snooze / Delegate)

**Where nudges are already sent:** `agent-tick/index.ts` already builds Block Kit messages and calls `sendSlackDM`. This is presumably where `agent_nudge`-type `inbox_items` get pushed to Slack today, or would be extended to do so — confirm which `inbox_items` (type `agent_nudge`) currently get mirrored to Slack, since the file reviewed builds blocks around `cos_meeting_actions`, not `inbox_items`. **This needs its own confirmation step during implementation**: grep `agent-tick/index.ts` end-to-end (only lines around the helpers and message-building were read here) to see if it already sends `inbox_items`-sourced nudges, or only `cos_meeting_actions`-sourced ones. If it's the latter, this plan's Step 4 includes extending `agent-tick` (or a new sender) to push `inbox_items` where `type = 'agent_nudge'` and `status = 'open'`.

**New Block Kit action ids** (namespaced to avoid colliding with the existing `mark_done:`/`snooze:`/`dismiss_escalation:`/`feedback:` ids that target `cos_meeting_actions`):
- `inbox_done:<item_id>`
- `inbox_snooze:<item_id>:<hours>` (offer 1h / 4h / tomorrow-9am as three buttons or one overflow menu — reuse the overflow-menu pattern already in `agent-slack-action`)
- `inbox_delegate:<item_id>`

**Handler:** Extend `agent-slack-action/index.ts` (per the Step 1 decision to standardize there) with a new branch per action id:
- `inbox_done:` → `UPDATE inbox_items SET status = 'done', done_at = now() WHERE id = :item_id AND user_id = :resolved_user_id` (the `AND user_id` guard is essential — this is exactly the kind of horizontal-privilege-escalation bug the existing `cos_meeting_actions` handlers already guard against, e.g. `.eq('user_id', userId)`, so mirror that pattern exactly).
- `inbox_snooze:` → `UPDATE inbox_items SET status = 'snoozed', snoozed_until = now() + interval '<hours> hours' WHERE id = :item_id AND user_id = :resolved_user_id`.
- `inbox_delegate:` → two-step: (1) immediately ack with an ephemeral "Delegating…" message so the 3-second Slack timeout isn't at risk, (2) fire-and-forget POST to `delegate-inbox-task` with `{ action: 'start', item_id, user_id }` (exactly the existing contract), matching the "don't block the response" pattern `delegate-inbox-task` itself already uses internally for `rampUp`. Optionally follow up with a second ephemeral message once `inbox_delegations.status` reaches `seeking_approval` — that would require either polling (bad) or a Postgres trigger/webhook back to Slack (better, but out of scope for v1 — start with "Delegated — check the app for the plan" as the immediate ack and revisit real-time follow-up later).

All three branches must resolve `slack_user_id → user_id` via `user_slack_credentials` exactly as the existing branches do, and must verify the Slack request signature — this handler currently has **no signature verification at all** (see §0 table and §4 Risks), so adding signature verification to `agent-slack-action` is a **prerequisite sub-task of this step**, not optional hardening tacked on later.

### 2c. Morning digest DM

**Trigger:** New pg_cron job, modeled directly on the `daily-prep-batch-hourly` pattern (`supabase/migrations/20260703000000_fix_daily_prep_batch_cron.sql`): schedule hourly, have the function itself filter to users whose local morning-digest hour matches their configured send time (reuse the `currentHourInTimezone` helper pattern from `daily-prep-batch/index.ts` rather than trying to schedule per-timezone cron jobs).

**New table:** `user_slack_digest_prefs` (or add columns to `user_slack_credentials` — recommend a new table to keep opt-in state separate from OAuth state, consistent with how `cos_prep_schedule` is presumably a separate table from calendar credentials):
```sql
CREATE TABLE user_slack_digest_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  send_hour_local integer NOT NULL DEFAULT 8 CHECK (send_hour_local BETWEEN 0 AND 23),
  timezone text NOT NULL DEFAULT 'America/New_York',
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: users manage their own row (mirror inbox_tags policy style)
```
Default `enabled = false` — **opt-in, not opt-out**, since an unsolicited daily DM is exactly the kind of thing that makes people distrust an agent feature. Surface the opt-in toggle in the existing Slack settings panel (`src/components/cos/CosSlackSyncPanel.tsx` — confirmed to exist) alongside the existing "connected" state and channel sync settings.

**New edge function:** `slack-morning-digest`, cron-invoked (no JWT, following `daily-prep-batch`'s `verify_jwt = false` + service-role-or-no-auth convention), for each user with `enabled = true` and matching `send_hour_local`:
1. Skip if `last_sent_at` is within the last 20 hours (guards against duplicate sends if the cron fires twice near an hour boundary, same defensive pattern implied by the hourly-cron + per-user-hour-match design).
2. Query `inbox_items` for that user: counts of `status = 'open'` by `type`, plus up to 5 most urgent/oldest open items and any `snoozed_until <= now()` items that just became due.
3. Build a Block Kit summary (counts + top items, each item a short line, no interactive buttons required for v1 — keep it read-only to avoid the complexity of digest-message button state going stale).
4. Send via the existing `sendSlackDM` helper (extract it from `agent-tick/index.ts` into `_shared/slackDm.ts` so both `agent-tick` and `slack-morning-digest` import the same implementation instead of copy-pasting it — this is a small refactor worth doing as part of this work, not scope creep, since duplicating that ~40-line function a third time is how the `agent-slack-action`/`slack-bot` duplication happened in the first place).
5. Update `last_sent_at`.

**Content shape (example):**
> **Good morning! Here's your inbox:**
> 3 open tasks · 1 agent nudge · 2 snoozed items now due
> • Follow up with Dan on pricing (opened 2d ago)
> • Review Q3 SI checkin draft
> • [agent] Approve delegated summary for "Vendor contract renewal"
> _Open the inbox → tacticalsync.com/workspace_

---

## 3. Files to change or create

### New files
- `supabase/functions/slack-inbox-capture/index.ts` — reaction/shortcut → `inbox_items` insert (§2a)
- `supabase/functions/slack-morning-digest/index.ts` — cron digest sender (§2c)
- `supabase/functions/_shared/slackSignature.ts` — extracted `verifySlackSignature`/`safeEqual` from `slack-add-suggestion/index.ts`, reused by `slack-inbox-capture` and (newly added to) `agent-slack-action`
- `supabase/functions/_shared/slackDm.ts` — extracted `sendSlackDM` from `agent-tick/index.ts`, reused by `agent-tick` and `slack-morning-digest`
- `supabase/migrations/2026XXXXXXXXXX_user_slack_digest_prefs.sql` — new table (§2c)
- `supabase/migrations/2026XXXXXXXXXX_slack_capture_reaction_opt_in.sql` — adds `capture_via_reaction boolean default false` to `user_slack_credentials` (§2a)
- `supabase/migrations/2026XXXXXXXXXX_slack_morning_digest_cron.sql` — pg_cron registration for `slack-morning-digest`, modeled on `20260703000000_fix_daily_prep_batch_cron.sql`

### Modified files
- `supabase/functions/agent-slack-action/index.ts` — add signature verification (currently absent — hard blocker, §4); add `inbox_done:`/`inbox_snooze:`/`inbox_delegate:` branches targeting `inbox_items`/`inbox_delegations` with `user_id` guards
- `supabase/functions/agent-tick/index.ts` — refactor `sendSlackDM` to import from `_shared/slackDm.ts`; confirm and, if needed, extend to push `agent_nudge`-type `inbox_items` as Slack DMs with the new `inbox_*` action ids in Block Kit buttons
- `supabase/config.toml` — add `[functions.slack-inbox-capture]` with `verify_jwt = false` (public Slack endpoint, same rationale as `slack-add-suggestion`); add `[functions.slack-morning-digest]` with `verify_jwt = false` (cron-invoked, same as `daily-prep-batch`)
- `src/components/cos/CosSlackSyncPanel.tsx` — add UI for: (a) digest opt-in toggle + send-hour picker, (b) reaction-capture opt-in toggle
- `src/hooks/useRCDO.ts` or a new `src/hooks/useSlackSettings.ts` — data-fetching hook for the new prefs (per CLAUDE.md convention: components never query Supabase directly)
- Slack app configuration (external, not a repo file — but document the required additions since no manifest exists in-repo): subscribe to `reaction_added` bot event; add a message shortcut "Add to TacticalSync inbox"; ensure OAuth scopes include `reactions:read`, `channels:history`/`groups:history`/`im:history` (as applicable) for reading reacted-to messages, and confirm `chat:write` (already implied) covers digest DMs.

### Files to read further before implementation (not fully covered by this investigation)
- `supabase/functions/agent-tick/index.ts` in full (only ~180 of its lines were read) — to confirm whether it already sources nudges from `inbox_items` or only from `cos_meeting_actions`, which determines whether Step 4 below is "extend" or "build new."
- `src/components/cos/CosSlackSyncPanel.tsx` in full — to match existing UI conventions before adding new toggles.
- Slack app's actual configured scopes/event subscriptions in the Slack API dashboard (external system, not in repo) — since no manifest exists, this must be checked by whoever has dashboard access, not inferred from code.

---

## 4. Risks

1. **Signature verification (hard security requirement, non-negotiable).** `agent-slack-action/index.ts` currently has `verify_jwt = false` and **no signature verification code** — meaning any internet client can POST a forged `block_actions` payload with an arbitrary `slack_user_id` and mutate that user's `cos_meeting_actions` today, before this feature even ships. This must be fixed as part of this work (not deferred) because the new `inbox_*` actions would inherit the same hole. `slack-add-suggestion` already has the correct reference implementation to copy. **Do not ship any new public Slack webhook endpoint without signature verification wired in from the first commit.**
2. **Slack API rate limits.** `slack-morning-digest` will call `chat.postMessage`/`conversations.open` once per enabled user per send hour — fine at current scale, but `slack-inbox-capture`'s `conversations.history`/`chat.getPermalink` calls are per-reaction and use **the reacting user's own OAuth token**, so rate limits are per-user (Slack Tier 3/4 methods, ~50-100+ req/min per token) and unlikely to be an issue unless someone scripts mass-reacting. No mitigation needed beyond standard error handling (treat 429s as soft failures, don't retry-storm).
3. **Multi-workspace support.** `user_slack_credentials` has a `slack_team_id` column but `slack_user_id` is not scoped by team in lookups (`.eq('slack_user_id', slackUserId)` alone, e.g. in `slack-add-suggestion` and `agent-slack-action`). If a Slack user ID could collide across two different workspaces both connected to this app (Slack user IDs are workspace-scoped and effectively unique per user-per-workspace pairing, so a true collision is unlikely but not architecturally prevented), the lookup could resolve to the wrong account. **Recommend adding `slack_team_id` to the lookup `WHERE` clause everywhere `slack_user_id` is used** (a small hardening change, cheap to include alongside the signature-verification fix in Step 1, since both touch the same functions). Full multi-workspace support (one TacticalSync team connecting multiple Slack workspaces) is out of scope for this plan — flag as a non-goal.
4. **Duplicate/competing button-handler implementations.** `agent-slack-action` (edge function) and `slack-bot/index.js` (Socket Mode) both claim to handle the same interactive actions today. Building new `inbox_*` actions without resolving which system is authoritative (§1) risks a third fork, or the new buttons silently not firing if Slack's interactivity Request URL points at the other implementation than the one that gets updated.
5. **Reaction-capture false positives.** Emoji reactions are frequently used for purposes unrelated to "capture this" (agreement, acknowledgment, humor). Defaulting reaction-capture to **opt-in** (§2a) mitigates this; shipping it as default-on for all connected users would generate noisy, unwanted inbox items and erode trust quickly.
6. **3-second Slack ack window.** All interactive/event webhook handlers must respond within 3 seconds or Slack shows the user an error and/or retries. The `inbox_delegate:` button in particular kicks off an LLM-backed multi-step process (`delegate-inbox-task`) — the plan already accounts for this by acking immediately and firing the delegation call without awaiting it, but this must be tested explicitly (see Testing §6), since a naive implementation that `await`s the delegation call before responding would intermittently fail.
7. **No Slack app manifest as source of truth.** Since scopes/event subscriptions live only in the Slack API dashboard, there's no code-reviewable diff when this feature requires new scopes (`reactions:read`, history scopes) or new event subscriptions. Recommend exporting the current app manifest into the repo (e.g., `slack-bot/manifest.yml` or a new `supabase/functions/_shared/slack-app-manifest.yml` for documentation purposes) as a small side-task, so future changes are reviewable. Not a blocker, but worth doing early in Step 1 so the "what scopes do we have" question has a durable answer.
8. **`agent-tick` nudge-sourcing uncertainty.** As noted in §2b/§3, whether `agent-tick` already sends `inbox_items`-backed nudges to Slack, or only `cos_meeting_actions`-backed ones, wasn't fully confirmed (only a partial read of the file). This affects whether Step 4 (below) is scoped as "add buttons to an existing message" or "build the nudge-to-Slack send path from scratch." Resolve this in the first 1-2 days of implementation before committing to a specific effort estimate for that step.

---

## 5. Incremental steps and effort estimates

Total: **~4.5 weeks**, sequenced so each step ships something independently testable/demoable, consistent with the doc's 3-5 week guidance.

**Step 0 — Security hardening + decision lock-in (3-4 days)**
- Add signature verification to `agent-slack-action/index.ts` (extract shared helper from `slack-add-suggestion`)
- Add `slack_team_id` to all `slack_user_id` lookups
- Confirm with the team: edge function vs. Socket Mode as system of record (§1)
- Read `agent-tick/index.ts` in full to resolve the §4 risk #8 uncertainty
- Export/document current Slack app scopes into a manifest file for review
- *This step is a prerequisite for everything else and fixes a live security gap regardless of whether the rest of the feature ships.*

**Step 1 — Message shortcut → inbox item (5-6 days)**
- New `slack-inbox-capture` function: signature verification, `url_verification` handshake, message-shortcut handling only (defer `reaction_added` to Step 2)
- `source_ref` shape, permalink fetch, `inbox_items` insert
- Manual Slack app config: register the shortcut, required scopes
- Basic ephemeral confirmation reply

**Step 2 — Emoji reaction capture (opt-in) (2-3 days)**
- Extend `slack-inbox-capture` to also handle `reaction_added`
- `capture_via_reaction` opt-in column + settings UI toggle
- Configurable emoji via env var

**Step 3 — Interactive buttons on nudges (6-7 days)**
- Extend `agent-slack-action` with `inbox_done:`/`inbox_snooze:`/`inbox_delegate:` branches
- Extend (or build, pending Step 0 finding) the nudge-send path in `agent-tick` to include these buttons in Block Kit messages for `agent_nudge`-type `inbox_items`
- Wire `inbox_delegate:` to `delegate-inbox-task` with fire-and-forget + ephemeral ack
- This is the largest step because it touches the nudge-generation path, not just the webhook receiver

**Step 4 — Morning digest (4-5 days)**
- `user_slack_digest_prefs` table + RLS
- `slack-morning-digest` function + cron registration
- Extract `sendSlackDM` into `_shared/slackDm.ts`, refactor `agent-tick` to use it
- Settings UI: opt-in toggle + send-hour picker

**Step 4.5 — Onboarding & Education (3-4 days)** — see §7 for full copy drafts and touchpoints
- App Home / first-DM onboarding message + one-time-send gating
- Ephemeral confirmation copy for message-shortcut and reaction-capture paths, including inline opt-out link
- Settings panel capability disclosure, reaction-capture tooltip, digest opt-in and first-run framing
- "What's new" changelog entry (placement pending confirmation of an existing changelog mechanism)

**Step 5 — Testing, polish, staged rollout (3-4 days)**
- Full test suite (§6), including the onboarding/confirmation copy paths added in Step 4.5
- Staged rollout: enable for a small internal group first (feature-flag via the digest/reaction opt-ins already being per-user)
- Monitoring: log volume of captures/button-clicks/digests sent for the first week to catch runaway loops early

---

## 6. Testing requirements

**Non-negotiable: webhook signature verification tests**, for every new/modified public Slack endpoint (`slack-inbox-capture`, `agent-slack-action`):
- Valid signature + fresh timestamp → request processed
- Invalid signature (tampered body or wrong secret) → 401, request NOT processed
- Valid signature but stale timestamp (>5 min skew) → rejected (replay protection)
- Missing signature header entirely → rejected
- Signature computed over the wrong raw body (e.g., a re-serialized/re-parsed body instead of the exact raw bytes Slack sent) → rejected — this specifically guards against a common implementation bug where someone parses the body before verifying, breaking the HMAC input

**Slack event/action handling:**
- `url_verification` challenge handshake returns the challenge token correctly (required once per Events API subscription, easy to get wrong)
- `reaction_added` for the configured emoji, from a mapped user → creates exactly one `inbox_items` row with correct `source_ref`
- `reaction_added` for an unconfigured emoji → no-op, no error surfaced to Slack
- `reaction_added` from an unmapped Slack user (no `user_slack_credentials` row) → no-op, 200 response (no retry storm)
- Message shortcut invocation → creates item with full message text as `body`
- Duplicate reaction (user removes and re-adds ✅ on the same message) → decide and test explicit behavior: either dedupe by `(channel_id, message_ts)` or allow duplicates — recommend deduping via a unique constraint or existence check, and test that a second reaction doesn't create a second item
- `inbox_done:` button → `inbox_items.status` becomes `done`, `done_at` set, and **only for the row matching the resolved `user_id`** (test that a forged `item_id` belonging to a different user is rejected/no-ops, not just that the happy path works)
- `inbox_snooze:` button with each offered duration → correct `snoozed_until` computed
- `inbox_delegate:` button → responds within the 3-second window (test with a deliberately slow/mocked `delegate-inbox-task` call to confirm the ack doesn't block on it) and creates/starts a delegation
- Button click from a Slack user with no `user_slack_credentials` mapping → graceful ephemeral error, no crash
- Overflow-menu vs. direct-button payload shapes both parse correctly (mirroring the existing `action_overflow:` prefix-stripping logic)

**Morning digest:**
- User with `enabled = false` → never receives a digest, even if cron fires at their `send_hour_local`
- User with `enabled = true` → receives exactly one digest at the hour matching their `timezone`-adjusted `send_hour_local`, not at UTC hour
- `last_sent_at` guard prevents a double-send if cron fires twice within the same hour window
- Digest content accuracy: counts and item list match actual `inbox_items` state at send time, including correctly surfacing items whose `snoozed_until` just passed
- User with zero open items → digest still sends (with a "nothing pending" message) or is skipped — decide and test the chosen behavior explicitly, since silently skipping could look like a bug to the user

**Integration/regression:**
- Existing `cos_meeting_actions`-targeting actions (`mark_done:`, `snooze:`, `dismiss_escalation:`, `feedback:` — without the new `inbox_` prefix) continue to work unchanged after `agent-slack-action` is modified — regression-test these explicitly since they share the same file
- `slack-add-suggestion` (untouched by this work) continues to pass its own signature checks — confirm the shared signature-verification extraction didn't change behavior
- RLS: a user cannot read/update another user's `inbox_items`, `inbox_delegations`, or `user_slack_digest_prefs` rows via any new code path (test via direct Supabase client calls with a second user's session, not just through Slack)

---

## 7. Onboarding & User Education

This feature is invisible by construction — the whole point is that it works *inside Slack*, away from the app the user is used to looking at for guidance. That makes it the easiest of the nine feature plans to ship technically correct and have nobody discover or trust. This section is not a polish pass; treat it as part of the feature's definition of done, same as the webhook signature verification in §0/§4.

### 7a. Discovery: how does a user find out this exists at all?

Two moments matter — connection time and first-use time. Neither can rely on the user reading a changelog.

**Trigger 1 — Slack App Home tab, shown once per user after they connect Slack (`exchange-slack-token` succeeds).**
Post a one-time message to the user's App Home / first DM from the bot, since there is no existing App Home surface in this codebase to extend (`slack-messages-sync`/`exchange-slack-token` don't currently post anything after connecting — this is new). Use the existing `sendSlackDM` helper (`_shared/slackDm.ts`, per §3) for delivery so it's the same code path as every other DM this app sends.

Draft copy:
> :wave: **You're connected to TacticalSync.**
> A few things you can do right from Slack, starting now:
> • React :white_check_mark: to any message to send it to your TacticalSync inbox — or right-click a message → *More actions* → **Add to TacticalSync inbox**
> • When TacticalSync nudges you about something here, you can hit **Done**, **Snooze**, or **Delegate** right on the message — no need to open the app
> • Want a daily summary of what's in your inbox? Turn on the *Morning digest* in Settings → Slack
> Reply `help` anytime to see this again.

Implementation touchpoint: send this from `exchange-slack-token/index.ts` (or a follow-up call it triggers) immediately after the credentials upsert succeeds — gate it with a new boolean, e.g. `onboarding_dm_sent_at` on `user_slack_credentials`, so re-connecting/re-authing doesn't resend it every time.

**Trigger 2 — first-ever use of the message shortcut or emoji reaction.**
The ephemeral confirmation itself doubles as onboarding reinforcement — see 7a-confirmation below. No separate "first time" branch is needed for this one; a good confirmation message every time is sufficient and simpler than tracking a "have they done this before" flag.

**Confirmation copy after using the message shortcut ("Add to TacticalSync inbox"):**
> :inbox_tray: Added to your TacticalSync inbox.
> <https://tacticalsync.com/workspace|Open inbox>

**Confirmation copy after the ✅ emoji-capture (opt-in) fires:**
> :white_check_mark: Got it — that's in your TacticalSync inbox now.
> <https://tacticalsync.com/workspace|Open inbox>  ·  <https://tacticalsync.com/settings/slack|Turn off reaction capture>

The reaction-capture confirmation **must** include a way to turn the feature off inline, since (per §4 risk #5) reactions are used for lots of things unrelated to "capture this," and a user who gets surprised by unwanted captures needs a one-click way out, not a trip through Settings to find the toggle. Deliver this via `chat.postEphemeral` (visible only to the reacting user, doesn't spam the channel) — this requires the emoji-capture handler to know the originating channel, which it already does from the `reaction_added` event payload (§2a step 3).

### 7b. In-app settings copy (privacy-relevant — pair with the signature-verification requirement)

The existing Slack settings panel (`src/components/cos/CosSlackSyncPanel.tsx`) currently communicates connection status and channel-sync scope. It must be extended to disclose the new *inbound* capability this feature adds: **Slack can now write into TacticalSync, not just be read from.** That's a meaningfully different trust boundary than "we read your DMs for 1:1 prep" (the existing `slack-messages-sync` framing), and users who connected Slack under the old framing haven't consented to the new one implicitly.

Add a distinct, non-collapsed panel section (not a tooltip buried in an overflow menu — this needs to be seen, not discovered):

> **What Slack can do in TacticalSync**
> • Reacting :white_check_mark: to a message or using the *Add to TacticalSync inbox* shortcut creates an inbox item from that message's text
> • Buttons on TacticalSync's Slack messages (Done / Snooze / Delegate) can update or close out items in your inbox
> • Every action is verified as genuinely coming from your Slack workspace before anything changes in your account
>
> [Reaction capture] Off ⚪ — react :white_check_mark: to messages to add them to your inbox
> [Morning digest] Off ⚪ — see §7d

The third bullet ("every action is verified...") is the plain-language translation of the signature-verification requirement from §0/§4 risk #1 — surfacing it here is not just reassuring copy, it's the honest answer to "how do you know it was really me clicking that button in Slack," and should only ship once that verification is actually in place (Step 0), not before. Don't write a security promise into the UI ahead of the code that makes it true.

Hover/tooltip on the "Reaction capture" toggle specifically (since it's the more surprising of the two capabilities):
> Tooltip: "When on, reacting ✅ to any Slack message you can see will copy it into your TacticalSync inbox. Off by default because ✅ is used for lots of things in Slack that aren't 'save this.'"

### 7c. "What's new" changelog entry

Draft, in the same before/after voice the coordinator specified:

> **Slack is now a second inbox.**
> Before: your inbox only worked if you opened the app — anything that happened in Slack stayed in Slack.
> Now: react ✅ to a message (or use *Add to TacticalSync inbox* from the `•••` menu) and it lands in your inbox automatically. When TacticalSync nudges you in Slack, hit **Done**, **Snooze**, or **Delegate** right on the message. And if you'd rather get one clean summary than watch the inbox all day, turn on the morning digest DM in Settings → Slack.

Placement: wherever this app's existing "what's new" mechanism lives (not identified in this investigation — needs a follow-up grep for an existing changelog/announcement component before implementation; if none exists, the minimum viable placement is a dismissible banner on `/workspace` gated by a `localStorage`/user-preference flag, consistent with how a first-run banner would typically be built in this stack).

### 7d. Morning digest opt-in clarity (the highest spam-risk touchpoint)

An unsolicited daily DM is the single easiest way for this whole feature to read as "the app is now nagging me in a second place." Two copy moments need to earn trust, not just disclose the feature.

**Opt-in prompt** (surfaced in Settings → Slack, `CosSlackSyncPanel.tsx`, next to the toggle from §7b — this is a settings toggle, not a modal interrupt, consistent with `enabled = false` default from §2c):
> **Morning digest**
> Get one DM each morning with what's open in your inbox — counts, anything overdue, and anything an agent needs your OK on. Nothing else. You choose the time.
> [ Off ⚪ ]  Send at: [ 8:00 AM ▾ ] (your timezone: America/New_York)

Key restraint in that copy: "Nothing else" is doing real work — it pre-empts the fear that opting in also opts them into more Slack notifications generally. This should stay true in the implementation (§2c step 3 already scopes the digest to a single read-only summary message, no buttons, no follow-ups).

**First digest message framing** — the first time this fires for a given user, it should acknowledge that it's new, not just look like it's always been there:
> :sunny: **Your first morning digest.** You'll get this every day at 8:00 AM — reply `stop` anytime, or turn it off in Settings → Slack.
> 3 open tasks · 1 agent nudge · 2 snoozed items now due
> • Follow up with Dan on pricing (opened 2d ago)
> • Review Q3 SI checkin draft
> • [agent] Approve delegated summary for "Vendor contract renewal"
> <https://tacticalsync.com/workspace|Open inbox>

Subsequent digests drop the first line and use the plain content block already drafted in §2c. Implementation touchpoint: this is a one-bit check (`last_sent_at IS NULL` on `user_slack_digest_prefs`) inside `slack-morning-digest`, cheap to add to the function already being built in Step 4.

The `reply "stop"` affordance implies the digest function's DM channel should also be checked for a `stop`/`unsubscribe` message and auto-disable `enabled` — this is a small addition to whichever function handles incoming DMs (`slack-bot/index.js`'s generic message handler today, per §0's ground-truth table, pending the Step-0 decision on which system owns Slack interactivity going forward). Flag this as a nice-to-have that should not block Step 4 shipping if the reconciliation from §1 isn't finished yet — the Settings toggle is the guaranteed off-switch either way.

### 7e. Effort estimate and step placement

**Effort: 3-4 days**, added as a new **Step 4.5 — Onboarding & Education**, sequenced immediately after Step 4 (Morning digest) and before Step 5 (Testing/rollout), since it depends on copy for all three capabilities (capture, buttons, digest) existing and stable, and its own confirmation/onboarding messages need to be included in Step 5's test pass rather than bolted on after. Breakdown:
- 1 day: App Home / first-DM onboarding message + `onboarding_dm_sent_at` gating column and send logic in `exchange-slack-token`
- 1 day: Ephemeral confirmation copy wired into `slack-inbox-capture` (both shortcut and reaction paths), including the inline "turn off reaction capture" link
- 1 day: Settings panel additions (`CosSlackSyncPanel.tsx`) — capability disclosure section, reaction-capture tooltip, digest opt-in copy and first-run framing logic
- 0.5-1 day: changelog/"what's new" entry, placement pending a quick check for an existing changelog mechanism (not found in this investigation)

This pushes the total plan estimate from 4 weeks to **~4.5 weeks**, still within the doc's 3-5 week guidance.

---

## 8. Summary of scope decisions requiring explicit sign-off

1. **Reaction capture defaults to opt-in**, not on-by-default, diverging slightly from a literal reading of the brief. Message shortcut is the default/primary capture mechanism.
2. **Standardize interactivity handling on the edge-function path** (`agent-slack-action`), not Socket Mode (`slack-bot/index.js`), for all new Inbox actions.
3. **Digest is read-only in v1** (no interactive buttons inside the digest message itself) to avoid stale-button-state complexity — buttons the user needs live on individual nudge messages instead.
4. **Security hardening of the existing `agent-slack-action` endpoint (missing signature verification) is included as Step 0**, treated as a blocking prerequisite rather than a separate ticket, since shipping new actions onto an unverified endpoint would be irresponsible.
5. Total estimate: **4.5 weeks** (4 weeks of engineering + 3-4 days of onboarding/education work per §7), within the doc's 3-5 week guidance, assuming one engineer and no major surprises from the unresolved `agent-tick` nudge-sourcing question (§4 risk #8) — if that turns out to require building the nudge-to-Slack send path from scratch rather than extending it, add ~1 week to Step 3.
6. **Onboarding is not optional polish** (§7): the App Home/first-DM message, ephemeral confirmations, settings disclosure, changelog entry, and digest opt-in framing are treated as part of this feature's definition of done, not a follow-up ticket.
