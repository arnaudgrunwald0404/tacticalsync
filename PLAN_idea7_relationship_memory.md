# Plan: Idea #7 — Relationship Memory (Person Pages + Pre-1:1 Briefs)

Status: **Implemented** (approved by human reviewer; idea #1 Unified Funnel confirmed live on a separate branch). Embedding pipeline (§1.3) deferred per this plan's own §1.2 recommendation — v1 ships on the non-embedding, big-context pattern instead. See the "Implementation notes" section at the end of this document for what shipped, what was deferred, and test results.

---

## 0. TL;DR for the reviewer

The original idea brief assumed a greenfield build: person-tags → person pages, backed by a new embedding index, with a scheduled job writing a pre-1:1 brief into the inbox.

Verification against the actual codebase changes the plan substantially:

1. **No pgvector / embedding infrastructure exists anywhere in `supabase/migrations/`.** Confirmed by grep — the only "vector" hits are false positives (`to_tsvector`, a PostgREST comment using the word "embedding" to mean foreign-key relationship embedding, nothing to do with ML embeddings). Only `pg_cron` and `pg_net` extensions are installed. **This part of the original idea is correctly scoped as a hard prerequisite.**
2. **A parallel, already-shipped "relationship memory" system exists in the `/chief-of-staff` (`cos_*`) module**, built without embeddings at all:
   - `cos_relationship_topics` + `cos_prep_topic_mentions` — extracted topics per person, with full-text search (`tsvector`/`gin`), sentiment, status (active/resolved/stale/recurring), mention counts.
   - `cos_relationship_documents` — a single rolling markdown brief per person (or per group meeting), incrementally consolidated by the `consolidate-relationship-doc` edge function every time new signal arrives (new prep note, new Zoom summary, new topics).
   - `query-relationship-history` edge function — answers free-text questions about a person by pulling *all* their prep notes, topics, actions, and the rolling doc into one large Claude prompt with `cache_control: ephemeral`, rather than doing vector retrieval. This is a "big-context RAG" pattern, not embedding-based RAG.
   - `agent-tick` + `cos_settings.agent_config` (`nudge_timing_hours: 24`, `pre_stage_prep`) — a cron-driven job that already computes "meeting is tomorrow" via `dci_meeting_schedule` and pre-stages 1:1 prep 24 hours ahead, including `meetingDayLabel()` logic for today/tomorrow/weekday labeling and quiet-hours suppression.
   - `cos_forgotten_commitments` view — already surfaces exactly the "open items, overdue, forgotten" concept the idea describes, computed from `cos_meeting_actions`.
3. **The inbox module (`inbox_items`/`inbox_tags`/`inbox_item_tags`) is a separate, newer, parallel system** ("parallel experiment alongside /chief-of-staff" per its own migration comment) that does not yet talk to any of the above. `inbox_tags` of `type = 'person'` do link to `cos_team_members.id` via `member_id`, so the join the idea describes (inbox items → tag → member) is real and already possible today.
4. **`brief_item` already exists as a live, working inbox item type** with UI (`InboxItemRow`, `InboxItemDrawer`, `InboxAssistantPanel`) and an idempotent upsert helper (`useInboxItems.syncBriefItem`) keyed on `source_ref: { type, id }`. Today it's used only for daily/weekly DCI briefs, not per-person pre-1:1 briefs — but the plumbing pattern to extend is proven and should be reused verbatim rather than re-invented.

**Net effect on scope:** this is not a build-from-scratch. It is (a) a genuinely new embedding pipeline (prerequisite, real net-new infra), (b) a new UI surface (person page) that aggregates data that already has almost every read path built in the `cos_*` module, and (c) a new cron-triggered write path into `inbox_items` that can closely mirror the existing `agent-tick` → prep-staging → `syncBriefItem` pattern instead of inventing new scheduling logic. This plan explicitly recommends **reusing the `cos_*` read paths and `agent-tick` scheduling primitives** rather than re-deriving "is there a 1:1 tomorrow" logic a second time in the inbox module, and reserves genuinely new work for the embedding pipeline and the person-page UI.

A **fork-vs-consolidate decision is required before implementation** (see §4a) because building the person page purely off `inbox_items`/`inbox_tags` while the richer signal (topics, sentiment, rolling doc, forgotten commitments) lives in `cos_*` tables means the "person page" would be worse than the chief-of-staff module's existing relationship view unless it also reads from `cos_*`.

---

## 1. Embedding infrastructure — verification and minimal scope

### 1.1 Verification (done)

```
grep -rli "vector\|embedding" supabase/migrations/
→ 20251120095000_fix_rc_links_created_by_fk.sql   (false positive: PostgREST "relationship embedding" comment)
→ 20260620000000_relationship_memory_agent_foundation.sql (false positive: to_tsvector(...))

grep -rn "pgvector\|CREATE EXTENSION.*vector|vector(" supabase/migrations/
→ no matches

grep -rn "CREATE EXTENSION" supabase/migrations/
→ pg_cron, pg_net only (in 20260620000000_relationship_memory_agent_foundation.sql)
```

Confirmed: **no embedding/vector infrastructure exists.** This is a hard prerequisite, exactly as flagged in the source doc.

### 1.2 Do we even need embeddings, given the `cos_*` precedent?

Worth surfacing to the approver directly: the existing `query-relationship-history` function gets good results *without* embeddings, by stuffing full history into a cached Claude context window. For a single person's history (a few dozen prep notes, topics, actions), this fits comfortably in context and is simpler to build, debug, and keep fresh than a vector index (no re-embedding triggers, no staleness, no similarity-search tuning).

**Recommendation: do not build a vector/embedding index for v1.** Instead:
- Reuse the big-context pattern for "the agent can query" — i.e., the person page's Q&A/brief-generation feature calls Claude with the full assembled context (inbox items + tags + `cos_relationship_topics` + `cos_relationship_documents` + `cos_one_on_one_prep`), same as `query-relationship-history` does today.
- Add `pgvector` and a real embedding table **only if/when** a person's history grows large enough that full-context stuffing becomes slow/expensive/token-limited (rough threshold: >150 discrete items or >30K tokens of raw content per person), or when idea #1 (Unified Funnel) materially increases item volume per person (see §4). Until then, this is deferred, not skipped — the schema below is designed so it can be added later without a data migration of existing content.

### 1.3 If/when the embedding pipeline is needed (deferred, but scoped now so the schema doesn't paint us into a corner)

- **Extension:** `CREATE EXTENSION IF NOT EXISTS vector;` (pgvector, available on Supabase).
- **New table:** `inbox_item_embeddings`
  - `id uuid PK`, `item_id uuid REFERENCES inbox_items(id) ON DELETE CASCADE`, `user_id uuid`, `member_id uuid REFERENCES cos_team_members(id)` (denormalized for fast filtered ANN search), `content_hash text` (to detect stale embeddings without re-embedding unchanged text), `embedding vector(1536)`, `model text`, `created_at timestamptz`.
  - Index: `CREATE INDEX ON inbox_item_embeddings USING hnsw (embedding vector_cosine_ops);` plus a btree on `(member_id)` for pre-filtering before ANN.
- **What triggers re-embedding:** a Postgres trigger on `inbox_items` (AFTER INSERT OR UPDATE OF text, body) that enqueues a row into a lightweight `embedding_jobs` queue table (avoid embedding synchronously inside the write transaction — network call to an embedding API must not block user-facing writes). A `pg_cron` job (5-minute cadence, matching the existing `agent-tick` cadence) drains the queue and calls the embedding API in batches.
- **Embedding model/API:** use Voyage AI (Anthropic's recommended embedding partner) or OpenAI `text-embedding-3-small` — either works; pick based on what other ClearCompany infra already calls (grep found no existing embedding API usage in this repo, so this would be a first integration). Store the model name per-row so future model upgrades can coexist during a re-embedding migration.
- **What gets embedded:** `inbox_items.text + body` for items tagged to a person, plus `cos_relationship_topics.topic + context_snippet`, plus `cos_one_on_one_prep.content` chunks (rolling doc is likely to need chunking past ~2-3K tokens). Do **not** embed `cos_relationship_documents` (the rolling brief) itself as a first-class source — it's a derived summary, embedding it risks the agent citing a summary-of-a-summary instead of primary content.

---

## 2. Person page — UI design

### 2.1 Route

New route: **`/inbox/person/:memberId`** (nested under the existing `/inbox` route tree, consistent with `/inbox/meetings/*`). Lazy-loaded like other page components per `src/App.tsx` convention.

Entry points: clicking a `person`-type `InboxTag` chip anywhere in the inbox UI (`InboxItemRow`, tag picker, filters) navigates here instead of just filtering the current view. Filtering-in-place should still work (existing behavior via `InboxFilterState`) — the person page is an additional destination, reachable via a "View person page" affordance on the tag, not a replacement for tag-filtering.

### 2.2 What it aggregates

Given the fork-vs-consolidate decision in §4a, the recommended design reads from **both** `inbox_*` and `cos_*` tables:

| Section | Source | Notes |
|---|---|---|
| Header (name, role, relationship type, last 1:1 date) | `cos_team_members` via `inbox_tags.member_id` | Already the join path described in the grounding; `inbox_tags.member_id → cos_team_members.id`. |
| Open items both directions | `inbox_items` JOIN `inbox_item_tags` JOIN `inbox_tags` WHERE `tag.member_id = X AND status = 'open'` | This is the net-new value the idea promises once idea #1 lands (see §4). |
| Rolling relationship brief | `cos_relationship_documents` WHERE `team_member_id = X` | Reuse as-is; already consolidated incrementally. Render as a collapsible "AI summary" card, not the primary feed. |
| Topic map (recurring themes, sentiment, resolved/stale) | `cos_relationship_topics` WHERE `team_member_id = X` | Reuse `useRelationshipTopics.ts` hook directly — already built, already has a `RelationshipTimeline.tsx` component (494 lines) and `CoverageMap.tsx` in `src/components/cos/` that render a very similar view for the chief-of-staff module. **Evaluate reusing/adapting these components rather than building new ones.** |
| Forgotten/overdue commitments | `cos_forgotten_commitments` view filtered by `member_id` | Direct reuse, zero new backend work. |
| Meeting insights | `inbox_items` WHERE `type = 'meeting_insight' AND source_ref->>'id'` matches a meeting the person attended (join via `dci_meeting_schedule.attendees` or `cos_zoom_recordings`) | Attendee matching is by name/email string array today (`dci_meeting_schedule.attendees text[]`) — there is no normalized attendee-to-member-id join table. This is a real gap: matching "attendee text matches this cos_team_members row" needs either a stored `member_id` on meeting-insight items at creation time, or fuzzy name/email matching at query time. Recommend resolving `member_id` at insight-creation time (cheap, one-time) rather than at every person-page load. |
| 1:1 prep history | `cos_one_on_one_prep` WHERE `team_member_id = X` | Direct reuse. |

### 2.3 Component reuse assessment

Before building new components, an implementer should read `src/components/cos/RelationshipTimeline.tsx`, `src/components/cos/CoverageMap.tsx`, and `src/hooks/useRelationshipTopics.ts` in full — they already render a "everything about this person" view for the `/chief-of-staff` surface. The person page may be substantially a re-skin of `RelationshipTimeline.tsx` with an added "open inbox items" section, rather than a from-scratch build. This should be scoped as a spike (0.5 day) at the start of implementation, not assumed.

---

## 3. Pre-1:1 brief generation — design

### 3.1 Real meeting-time source (verified)

`dci_meeting_schedule` (migration `20260701000000_dci_meeting_schedule.sql`) is the normalized, per-user, per-meeting table: `start_time`, `end_time`, `attendees text[]`, `zoom_meeting_id`. This is the "real meeting-time source" the task asked to locate. It already has a partial index for "meetings ending recently and unprocessed" (`idx_dci_meeting_schedule_pending`), and a per-user daily index.

There is no direct `attendees[] → cos_team_members.id` resolution stored today — attendee identity is by raw string (name or email). For "does this meeting = a 1:1 with member X," the existing `agent-tick` code already has to solve an equivalent problem (`meetingQualifiesForPrep`, checking attendee count ≤ 1 for auto-qualifying 1:1s). The pre-1:1 brief job should reuse that same qualification logic rather than reimplementing "is this a 1:1" detection.

### 3.2 Recommended design: extend `agent-tick`, do not build a new cron job

The existing `agent-tick` function already:
- Runs on a cron schedule (pg_cron, confirmed via `20260620000001_agent_cron_schedule.sql`).
- Reads `cos_settings.agent_config.nudge_timing_hours` (default 24) and quiet-hours suppression.
- Computes `meetingDayLabel()` (today/tomorrow/weekday) for meetings in `dci_meeting_schedule`.
- Has a `pre_stage_prep` flag already gating "generate `cos_one_on_one_prep` 24h ahead" behavior.

**Recommendation:** add a new agent_config flag, `pre_stage_inbox_brief: boolean` (default false, feature-flagged rollout), and extend `agent-tick`'s existing "meeting is ~24h out" branch to additionally:
1. Assemble brief content: query `inbox_items` open items tagged to the member (both directions — items the user owes the person, and vice versa, distinguished by a convention such as `agent_payload.owed_by: 'me' | 'them'` that does not yet exist on `inbox_items` and would need to be added, see §5), `cos_relationship_topics` (what changed since last time — compare `last_mentioned_at` against the last 1:1 date), and `cos_forgotten_commitments` for that member.
2. Generate 3 suggested talking points via a Claude call (same pattern as `consolidate-relationship-doc` / `query-relationship-history` — cached system prompt, small `max_tokens`).
3. Write an `inbox_items` row with `type: 'brief_item'`, using the **same idempotent upsert pattern as `useInboxItems.syncBriefItem`**: `source_ref: { type: 'pre_1on1_brief', id: '<meeting_id or date+member_id>' }` as the dedup key, so re-runs of `agent-tick` don't duplicate the brief. This should be done server-side (in the edge function, via a direct upsert) rather than requiring the client to call `syncBriefItem`, since this is a background job with no client session.
4. Tag the new item with the person's existing `person`-type `inbox_tags` row (`inbox_item_tags` insert) so it surfaces on the person page and in tag-filtered views.

This avoids: a second cron schedule, a second "is a meeting coming up" detector, and duplicated quiet-hours/timezone logic — all real bugs waiting to happen if built independently.

### 3.3 Why `brief_item` fits

Confirmed: `inbox_items.type` enum already includes `'brief_item'`, and the type has working UI treatment (icon, border color, background, drawer rendering, auto-pin behavior via `isAutoPinnedItem`). No enum migration needed. The only schema gap is that `agent_payload` for existing brief items has a `brief_priorities: BriefPriority[]` shape designed for daily/weekly summaries — the pre-1:1 brief needs a distinct payload shape (open items both directions, "what changed," 3 talking points). This should be a new optional field on the existing `AgentPayload` type (`src/types/inbox.ts`), e.g. `person_brief?: { member_id, open_items_mine, open_items_theirs, changes_since_last, talking_points }`, not a new item type.

---

## 4. Dependency on Idea #1 (Unified Funnel)

The source doc's own dependency note is correct and should be taken seriously, not just acknowledged. Specifics of what breaks if this ships before #1:

- **Incompleteness of "every inbox item... about a given person":** today, tagging an `inbox_item` with a person tag is a manual/suggested action (`suggest-inbox-tags` function exists, confirmed). Only items that made it into `inbox_items` in the first place — and were then tagged — show up. If idea #1 (Unified Funnel) is what makes *all* signal (Slack messages, emails, Zoom action items, Salesforce notes, etc.) actually land in `inbox_items` in the first place, then before #1 ships, the person page is only as complete as whatever narrow set of sources currently write into `inbox_items`. Concretely: **the person page would under-represent the relationship** — it would look like less was discussed with someone than actually was, which is the opposite of the trust-building goal of the feature ("no tool maintains a memory of what was discussed"). A sparse, visibly-incomplete person page is worse for trust than no person page, because it implies completeness it doesn't have.
- **Low-value pre-1:1 briefs:** "open items both directions, what changed since last time" is only informative if "both directions" genuinely captures cross-channel commitments (a Slack promise, a Salesforce follow-up, not just inbox-native tasks). Pre-#1, the brief would only reflect whatever narrow slice of interactions already flow into `inbox_items`, which today appears to be primarily DCI-brief-adjacent and manually created items — real commitments made in Slack/email/Zoom that never get manually captured as inbox items would be invisible, producing a brief that's confidently wrong by omission.
- **Practical recommendation:** it is reasonable to build the **person page UI shell and the embedding-deferral groundwork now** against current (incomplete) data, *if* the team wants UI/UX validation early — but the pre-1:1 brief generation job (§3) should not be turned on for real users (`pre_stage_inbox_brief: true`) until #1 ships, because a wrong or incomplete brief actively damages trust in the exact way the feature is meant to build it. Gate the brief-generation rollout behind both the `agent_config` flag and a check that the user's workspace has #1's ingestion sources connected.

---

## 4a. Fork-vs-consolidate decision (blocking, needs a decision before implementation starts)

Two real options exist and an approver should pick one:

**Option A — Person page reads across both `inbox_*` and `cos_*` (recommended above).** Pros: reuses everything already built (topics, rolling doc, forgotten commitments, prep history) instead of re-deriving it in the inbox schema; ships faster. Cons: couples the "parallel experiment" inbox module back to the chief-of-staff module it was explicitly built apart from (see the `20260713000001_inbox_tables.sql` migration comment: "parallel experiment alongside /chief-of-staff"); if `/chief-of-staff` is eventually deprecated in favor of `/inbox`, this creates a migration debt.

**Option B — Person page is inbox-native only** (only `inbox_items`/`inbox_tags`/`inbox_item_tags`, ignoring `cos_*` entirely). Pros: keeps the inbox module self-contained, consistent with its "parallel experiment" design intent. Cons: ships a materially worse feature at launch — no topic extraction, no rolling brief, no forgotten-commitments detection, all of which already exist and work in `cos_*`; would require re-building topic extraction and sentiment tracking from scratch as new inbox-native infra, which is a large chunk of the 8-12 week estimate the source doc already assumes is enough.

This plan assumes **Option A** in its designs above because Option B roughly doubles the effort for a strictly worse v1. Flag this explicitly to the approver rather than silently deciding — it's a call about the long-term direction of two parallel modules, not just an implementation detail.

---

## 5. File/migration inventory

### 5a. Prerequisite infra (embedding pipeline) — deferred per §1.2, scoped here for completeness

- New migration: `supabase/migrations/<ts>_inbox_embeddings.sql` — `CREATE EXTENSION vector`, `inbox_item_embeddings` table, `embedding_jobs` queue table, HNSW index, RLS policies.
- New edge function: `supabase/functions/embed-inbox-items/index.ts` — drains `embedding_jobs`, calls embedding API, writes `inbox_item_embeddings`.
- New migration: `supabase/migrations/<ts>_embedding_jobs_cron.sql` — `pg_cron` schedule + trigger function on `inbox_items` (AFTER INSERT/UPDATE) that enqueues jobs.
- New env var: `EMBEDDING_API_KEY` (Voyage or OpenAI), added to `.env.example` and Supabase function secrets.

### 5b. Person page UI

- New file: `src/pages/InboxPersonPage.tsx` (lazy-loaded route target).
- Edit: `src/App.tsx` — add `/inbox/person/:memberId` route.
- New hook: `src/hooks/usePersonPage.ts` — composes `useInboxItems` (filtered by tag/member), `useRelationshipTopics` (reuse existing), a new thin query for `cos_relationship_documents` and `cos_forgotten_commitments` scoped by `member_id`, and `cos_one_on_one_prep`.
- Possible edit (pending the reuse spike in §2.3): adapt `src/components/cos/RelationshipTimeline.tsx` and `src/components/cos/CoverageMap.tsx` to be usable from both `/chief-of-staff` and `/inbox/person/:memberId`, or extract shared sub-components.
- Edit: wherever person-type `InboxTag` chips render (`InboxItemRow.tsx`, tag picker components) — add a "View person page" link/click-through.
- Edit: `src/types/inbox.ts` — no new item type needed; optionally add `person_brief` shape to `AgentPayload` (see §3.3).
- New migration: `supabase/migrations/<ts>_cos_settings_person_memory_consent.sql` — add `person_memory_consent_seen_at timestamptz` to `cos_settings` (§7a.4).
- Edit: `src/components/inbox/InboxItemDrawer.tsx`, `src/components/inbox/InboxAssistantPanel.tsx` — add tooltip copy inside the new `person_brief` branch (§7a.2).
- New component (or reuse of an existing modal primitive): consent/expectations modal (§7a.4), triggered on first person-page view or first received `person_brief` item.
- Edit: existing changelog/what's-new surface, or a new dismissible banner on `/inbox` if no such surface exists yet (§7a.3) — flag as a dependency to confirm during the Week 1 spike (§7) if no existing mechanism is found.

### 5c. Pre-1:1 brief generation job

- Edit: `supabase/functions/agent-tick/index.ts` — add the `pre_stage_inbox_brief` branch described in §3.2.
- New migration: `supabase/migrations/<ts>_agent_config_inbox_brief_flag.sql` — add `pre_stage_inbox_brief boolean NOT NULL DEFAULT false` to `cos_settings.agent_config` JSONB default, and optionally a `member_id`-resolution column on `inbox_items` for meeting-insight attendee matching (see §2.2 gap) — e.g. `ALTER TABLE inbox_items ADD COLUMN attendee_member_ids uuid[]` populated at insight-creation time.
- Edit: wherever `meeting_insight`-type inbox items are created today (search for the creation call site — likely in a Zoom-processing or DCI function) — populate the new `attendee_member_ids` column at write time by resolving `dci_meeting_schedule.attendees` strings against `cos_team_members` (name/email match), so the person page doesn't need to do fuzzy matching at read time.
- Edit: `src/types/inbox.ts` — add `owed_by: 'me' | 'them'` (or similar) convention if "open items both directions" needs to be explicit rather than inferred, and the `person_brief` `AgentPayload` shape from §3.3.
- No new cron job, no new edge function — deliberately reuses `agent-tick`'s existing schedule per §3.2.

---

## 6. Risks

- **Embedding cost/latency at scale:** deferred in this plan (§1.2), but if later triggered by growth from idea #1: embedding API calls add per-item latency and cost that must not block the write path — mandatory async queue (`embedding_jobs`), not a synchronous call inside the `inbox_items` insert transaction. At scale, re-embedding on every edit of a long-lived item (e.g., a note edited repeatedly) could generate needless API calls; debounce or hash-compare (`content_hash`) before re-embedding.
- **Staleness of embeddings vs. live data:** even with the queue approach, there's a window where a newly-tagged or newly-edited item hasn't been embedded yet and would be invisible to any embedding-based query. Any embedding-based feature must clearly degrade to "was recently added, not yet searchable" rather than silently omitting the item; the big-context-window approach recommended for v1 sidesteps this entirely since it always reads live rows.
- **Staleness of `cos_relationship_documents` (rolling brief):** it's already an async-consolidated summary (fire-and-forget from `generate-1on1-prep`); the person page and pre-1:1 brief must not treat it as ground truth for "what changed since last time" — cross-check against raw `cos_relationship_topics.last_mentioned_at` and raw `inbox_items.created_at`, not just the prose summary, since the summary could lag.
- **Privacy of aggregating sensitive interpersonal notes:** a person page is, by design, a dossier — `context_notes`, sentiment-tagged topics ("negative" sentiment on a named person), and prep notes in one place raises the stakes of any RLS bug far above a single inbox item leaking. Every new query path (person page hook, pre-1:1 brief job) must be audited to confirm it filters by `user_id = auth.uid()` (or, for the service-role edge function, an explicit `user_id` parameter tied to the authenticated caller) — a single missed filter here exposes one manager's private notes about a direct report to another user. Given `cos_agent_log` already exists as an audit trail pattern, extend it to log person-page access and brief generation for auditability, especially before this is exposed to any admin/HR-adjacent view.
- **Cold start (little/no history):** a new hire or a person with only 1-2 tagged items produces an empty-looking person page and a pre-1:1 brief with nothing to say. Design explicit empty states (not just "no data" — prompt the user to tag more items, or suppress the pre-1:1 brief entirely below some minimum signal threshold rather than emitting a near-empty, low-value inbox item that trains users to ignore `brief_item` rows).
- **Alert fatigue / duplicate brief risk:** if the `agent-tick` extension and the existing daily/weekly brief sync both fire for the same day, a user could see multiple `brief_item` rows competing for attention. The `source_ref` dedup key must be distinct and the UI should visually differentiate "daily brief" from "pre-1:1 brief" (different icon/label), not rely on users reading `agent_payload` internals to tell them apart.
- **Fork-vs-consolidate risk (§4a):** whichever option is picked, the other module's future direction (is `/chief-of-staff` being sunset in favor of `/inbox`, or vice versa?) materially affects whether this is throwaway work. This should be resolved at the org/roadmap level, not just at the engineering level, before work starts.

---

## 7. Incremental steps and effort estimates

Overall estimate: **9-11 weeks**, assuming Option A (§4a) and deferring the embedding pipeline (§1.2) — still at or under the source doc's 8-12 week estimate because reusing `cos_*` read paths and `agent-tick` scheduling removes a meaningful chunk of net-new work, even after folding in the +1 week for onboarding/education (§7a.6). If the embedding pipeline must be built immediately rather than deferred, add 2-3 weeks back (top of the original range).

1. **Week 1 — Spike + decision gate.** Resolve §4a (fork vs. consolidate) with the approver. Spike component reuse (§2.3): read `RelationshipTimeline.tsx`/`CoverageMap.tsx` in full, produce a short reuse-vs-rebuild recommendation. Confirm idea #1's rollout timeline with its owner to set the brief-generation feature-flag gate (§4) realistically.
2. **Weeks 2-3 — Person page UI (read-only aggregation), Option A.** Build `/inbox/person/:memberId`, `usePersonPage.ts`, wire up open-items-by-tag query, reuse/adapt `cos_*` components for topics/rolling-brief/forgotten-commitments/prep-history. Add "View person page" entry points from tag chips. No new backend beyond a couple of scoped queries.
3. **Week 4 — Meeting-insight attendee resolution.** Add `attendee_member_ids` column, backfill logic for existing rows, update insight-creation call sites to populate it going forward. This unblocks the "meeting insights this person was part of" section cleanly.
4. **Weeks 5-6 — Pre-1:1 brief generation (behind flag, off by default).** Extend `agent-tick` per §3.2, add `pre_stage_inbox_brief` config flag, build the Claude-call-based brief content generator (open items both directions, changes since last time, 3 talking points), server-side idempotent upsert into `inbox_items`. Ship dark (flag off) to internal/dogfood users only.
5. **Week 7 — `AgentPayload` schema + UI rendering for person briefs, plus onboarding copy (§7a).** Add `person_brief` shape, render it distinctly from daily/weekly briefs in `InboxItemRow`/`InboxItemDrawer`/`InboxAssistantPanel`. Run in parallel: empty-state copy (§7a.1), inline tooltips (§7a.2), and the consent modal build (§7a.4) — same components, same week, per §7a.6's effort estimate (+1 week folded in here, not sequential).
6. **Week 8 — Privacy/audit hardening + cold-start handling.** RLS audit of every new query path (§6), extend `cos_agent_log` for person-page/brief audit trail, build empty states, add minimum-signal threshold to suppress low-value briefs. **Gate:** verify the consent modal's "who can see it" claim (§7a.4) against the completed RLS audit before the modal ships to any real user — this is a hard dependency, not a parallel task.
7. **Week 9 — What's-new publish + dogfood.** Publish the changelog/what's-new entry (§7a.3) to internal users alongside the dogfood rollout of the pre-1:1 brief.
8. **Weeks 10-11 — Testing, staged rollout, and gating on idea #1.** Full test pass (§8), including the acceptance criteria in §7a.5. Turn on `pre_stage_inbox_brief` only for workspaces where idea #1's ingestion is confirmed live, per §4. Monitor `cos_agent_log`/brief-generation logs for a cohort before wider rollout.
9. **Deferred / not in the 9-11 week estimate:** the embedding pipeline (§1.2, §5a) — revisit once real usage data shows big-context stuffing is hitting token/latency limits, likely only after idea #1 substantially increases item volume per person.

---

## 7a. Onboarding & User Education

This feature fails quietly if it's not explained: a sparse person page reads as "broken," a talking-point suggestion with no explanation reads as "creepy black box," and a brief that references sensitive interpersonal notes with no warning reads as "who else can see this." Each of the four touchpoints below is scoped to a specific file and given its own line in the effort estimate (§7) rather than treated as a documentation afterthought.

### 7a.1 First-run / empty-state copy (cold-start person page)

Applies to: `src/pages/InboxPersonPage.tsx` (new), specifically the empty states for the "Open items," "Topic map," and "Rolling brief" sections identified as a cold-start risk in §6.

The failure mode to design against: a manager opens the person page for someone they just started managing, or someone with only one or two tagged items, sees mostly blank sections, and concludes the feature doesn't work. The copy has to frame sparseness as "early," not "empty."

**Draft copy — page-level banner, shown when a person has fewer than ~5 tagged items or no `cos_relationship_documents` row yet:**

> **This page is just getting started.**
> As you tag items, take 1:1 notes, and meet with [Name], this page fills in automatically — recurring topics, open commitments, and a running brief. Nothing to do right now except keep using your inbox and 1:1 prep as normal.

**Draft copy — per-section empty states:**

- Open items (both directions) empty: *"No open items with [Name] yet. Tag a task or note with their name and it'll show up here."*
- Topic map empty: *"Recurring themes will appear here once you've had a couple of tagged conversations or 1:1s with [Name]."*
- Rolling brief empty: *"[Name]'s relationship summary builds itself after your first 1:1 prep or Zoom-recorded conversation — check back after your next meeting."*
- Forgotten commitments empty (this one should read as good news, not absence): *"Nothing overdue. You're caught up with [Name]."*

Design note: do not show a generic "No data" state anywhere on this page — every empty state names what specific action fills it in, per the pattern above. This is a copy-review checklist item, not just a nice-to-have (see acceptance criteria in §7a.5).

### 7a.2 Inline hovers/tooltips (explaining "what changed" and "suggested talking points")

Applies to: the `person_brief` rendering block in `src/components/inbox/InboxItemDrawer.tsx` and `src/components/inbox/InboxAssistantPanel.tsx` (both already have `item.type === 'brief_item'` branches per the grounding in §5b/§5c — the tooltips are added inside the new `person_brief` sub-branch).

The goal is a one-line, plain-language explanation reachable via an info icon (existing pattern: check for an existing `<Tooltip>`/info-icon component used elsewhere in the inbox UI, e.g. near `tag_suggestions`, and reuse that component rather than introducing a new tooltip primitive) — not a modal, not a settings-page essay. Users should be able to ignore it entirely if they don't care how it works.

**Draft copy — "What changed since last time" section header tooltip:**

> Compares what's been tagged to [Name] since your last 1:1 — new topics, closed items, and anything overdue.

**Draft copy — "Suggested talking points" section header tooltip:**

> Pulled from open items, recent notes, and topics you and [Name] have discussed — not a script, just a starting point.

**Draft copy — if a talking point cites a specific past item (recommended: make each suggested talking point a clickable reference back to its source item, not just prose)** — this both builds trust ("I can verify this") and satisfies part of the black-box concern without adding UI chrome: each talking point shows a small "from: [item text/date]" caption rather than requiring a hover at all. Treat this as the primary mechanism; the tooltip is the fallback explanation for the feature as a whole, not for each individual point.

Explicitly avoid: language like "AI-detected," "algorithm," "embedding," or confidence scores/percentages. The tooltip should describe *what it looked at*, not *how the model works* — that's the "light explanation... without over-explaining the ML mechanics" bar the ask set.

### 7a.3 "What's new" callout / changelog entry

Applies to: wherever the app's existing changelog/what's-new surface lives (check for an existing pattern — e.g. a `WhatsNew` component, a Slack announcement template, or a release-notes modal triggered on first login after a deploy; if no such mechanism exists yet, this becomes a small dependency to flag rather than assumed to exist) and, as a fallback if that pattern doesn't exist, an in-app banner on `/inbox` itself gated on a `localStorage`/`user_settings` "seen" flag.

**Draft changelog entry:**

> **New: Every 1:1 now starts with a brief.**
> Before: you had to remember or scroll back through old notes to recall what you discussed with Alex.
> Now: 24 hours before your 1:1, a brief lands in your inbox — what's open on both sides, what's changed since you last talked, and a few suggested talking points. Click any person's name tag to see their full history in one place.
> [View Alex's person page →]

The bracketed example name should be templated to a real person/tag the viewing user already has, if the changelog surface supports dynamic content (deep-linking to the user's own first `person`-type tag) — a generic screenshot with a fake name is noticeably weaker at conveying "this works with your actual data" than a live link into the user's own inbox.

**Draft copy — shorter Slack/email announcement variant** (for teams that pair in-app changelogs with a Slack bot post, given the existing `slack-add-suggestion`/`agent-slack-action` functions in this codebase suggest Slack is already a notification channel):

> 🧠 **New in your inbox: relationship memory.** Every 1:1 now starts with a brief — open items, what's changed, and talking points, generated 24h ahead. No setup needed; it uses the tags and notes you're already creating.

### 7a.4 First-run consent / expectations moment

This is the highest-stakes copy in this section given §6's privacy risk (sentiment-tagged notes about named people, aggregated into one dossier-like view). Recommend a **one-time modal**, not a buried settings toggle, shown the first time any user either (a) opens a person page or (b) receives their first pre-1:1 brief — whichever comes first. Gate it with a new boolean, e.g. `cos_settings.person_memory_consent_seen_at timestamptz`, alongside the existing `agent_config` JSONB (same table already used for `pre_stage_inbox_brief` in §5c, so this is one additional column, not new infra).

**Draft copy — consent/expectations modal:**

> **About person pages and 1:1 briefs**
>
> This page pulls together everything you've tagged to [Name] — notes, tasks, meeting insights, and 1:1 prep — plus a running summary and pre-1:1 briefs generated from that history.
>
> **What feeds it:** items you tag to [Name], your 1:1 prep notes, and (if connected) Zoom summaries from meetings you both attended.
>
> **Who can see it:** only you. This is your private working memory of the relationship — [Name] and other teammates cannot see this page, your notes, or your briefs.
>
> **Your call:** keep tagging items and this gets more useful over time. You can turn off pre-1:1 briefs anytime in [Settings → Agent].
>
> [Got it]  [Manage settings]

Two things this copy deliberately commits to, which should be verified as true before shipping rather than assumed:
1. **"Only you can see it"** — this must be confirmed against the actual RLS policies (§6, §8's RLS test section) before this exact sentence ships; if there is *any* path where a person's own manager, an HR admin view, or a shared-workspace feature can see this data, the copy must say so instead. Do not ship reassurance copy that the RLS test suite hasn't verified.
2. **A visible off-switch is named in the same breath as the data description** — per the ask's framing ("propose a first-run consent/expectations moment"), this is presented as an expectations-setting moment the user must acknowledge, not a GDPR-style hard consent gate that blocks usage; the "Got it" action should not require legal review to word correctly, but the accuracy of the "who can see it" claim does require an engineering sign-off pass.

### 7a.5 Acceptance criteria for this section

- No section of the person page shows a bare "No data" or blank state — every empty state names the action that populates it (§7a.1).
- Every `person_brief` inbox item has a discoverable (not mandatory-to-notice) explanation of both "what changed" and "suggested talking points," reachable in ≤1 click/hover, containing no ML/algorithm jargon (§7a.2).
- A what's-new entry exists and links directly into the feature (ideally the user's own data, not a generic screenshot) before the feature is enabled for any non-dogfood workspace (§7a.3).
- The consent/expectations modal has shipped and been shown to 100% of users before their first person-page view or first received brief — not after — and its privacy claims have been verified against the RLS test suite in §8, not just written and assumed (§7a.4).

### 7a.6 Effort estimate

**+1 week**, run in parallel with Week 7 (§7's "AgentPayload schema + UI rendering" step) rather than sequentially after it, since the tooltip and empty-state copy live in the same components being built that week. Breakdown: 2 days copywriting + UX review (empty states, tooltips, changelog, consent modal draft), 2 days implementation (tooltip component wiring, consent modal + `person_memory_consent_seen_at` column/migration, changelog entry publish), 1 day verification that the "who can see it" claim in §7a.4 matches the actual RLS behavior confirmed in §8's security tests — this verification step is a hard gate on shipping the consent copy as-is.

---

## 8. Test coverage

**Unit tests:**
- `inboxValidation.ts` changes (if `owed_by` or `person_brief` payload shapes are added): validation of new `AgentPayload` fields, `isAutoPinnedItem` still correctly includes person briefs.
- `usePersonPage.ts`: correct aggregation across `inbox_items`/`inbox_tags`/`cos_*` sources; correct behavior when a member has zero items in one or more sources (cold start); correct handling when `member_id` is null (a person tag with no linked `cos_team_members` row, which the schema allows).
- `agent-tick` brief-generation branch: meeting-qualifies-as-1:1 logic reused correctly (no drift from `meetingQualifiesForPrep`); quiet-hours suppression applies to the new brief path too; idempotent upsert does not duplicate a brief on repeated ticks for the same meeting.
- Attendee-to-member-id resolution: exact match, case-insensitive email match, no-match (should not throw, should leave `attendee_member_ids` empty rather than guessing).

**Integration tests (Vitest, hitting a local Supabase instance):**
- End-to-end: create a person tag, tag several inbox items to it (mix of `task`/`note`/`meeting_insight`), assert the person page query returns the correct aggregated set filtered correctly by `user_id` (critical: assert a *different* user's items with the same `member_id` value never leak — this is the RLS-adjacent risk from §6).
- `cos_relationship_documents`/`cos_relationship_topics`/`cos_forgotten_commitments` joins: assert person page correctly surfaces existing chief-of-staff data without requiring any write to those tables (read-only integration).
- Brief generation: seed a `dci_meeting_schedule` row 24h out with a single other attendee resolvable to a `cos_team_members` row; run the `agent-tick` brief branch; assert exactly one `brief_item` inbox row is created, tagged to the correct person, with a `source_ref` that prevents duplication on a second run.
- Feature-flag gating: assert brief generation does not fire when `pre_stage_inbox_brief` is false (default), and does not fire during configured quiet hours.

**RLS / security tests (critical given §6):**
- Two-user test: user A tags items to a person; user B (different account, potentially even a different `cos_team_members.id` that collides in some other way) must get zero rows from every new query path (person page hook, brief-generation job) for user A's data. Explicit negative tests, not just happy-path.
- Service-role edge function (`agent-tick` extension): assert the brief-writing code path always scopes by the specific `user_id` being ticked, never a cross-user query, even though it runs with service-role credentials that bypass RLS.

**E2E tests (Playwright):**
- Navigate to a person page from a tag chip click; assert all sections render (or show correct empty states for a cold-start person).
- Simulate a pre-1:1 brief appearing in the inbox (seed data); assert it renders with the distinct visual treatment from daily/weekly briefs and that clicking it opens the correct drawer content (`person_brief` payload rendering, not `brief_priorities`).
- Regression: existing daily/weekly `brief_item` flows (`Inbox.tsx` sync logic) continue to work unaffected by the new payload shape being optional/additive.

**Manual/exploratory testing:**
- Cold-start UX review with a real "low-history" person to confirm the empty states read as helpful rather than broken.
- Dogfood the pre-1:1 brief for a week with a handful of internal users before flipping the flag broadly, specifically watching for "brief was wrong/incomplete because idea #1 hasn't shipped" complaints — this is the concrete signal that should gate wider rollout per §4.

---

## Appendix: key files referenced during grounding

- `supabase/migrations/20260419000000_create_cos_tables.sql` — `cos_team_members`
- `supabase/migrations/20260423000000_create_cos_one_on_one_prep.sql` — `cos_one_on_one_prep`
- `supabase/migrations/20260620000000_relationship_memory_agent_foundation.sql` — `cos_relationship_topics`, `cos_prep_topic_mentions`, `cos_agent_log`, `cos_forgotten_commitments`, `cos_settings.agent_config`
- `supabase/migrations/20260714000002_relationship_documents.sql` — `cos_relationship_documents`
- `supabase/migrations/20260701000000_dci_meeting_schedule.sql` — `dci_meeting_schedule`
- `supabase/migrations/20260713000001_inbox_tables.sql` — `inbox_items`, `inbox_tags`, `inbox_item_tags`, `inbox_views`
- `supabase/functions/agent-tick/index.ts` — cron-driven agent orchestration, `meetingQualifiesForPrep`, `meetingDayLabel`, quiet hours
- `supabase/functions/query-relationship-history/index.ts` — big-context (non-embedding) relationship Q&A pattern
- `supabase/functions/consolidate-relationship-doc/index.ts` — incremental rolling-brief consolidation pattern
- `src/hooks/useInboxItems.ts` (`syncBriefItem`) — idempotent brief-item upsert pattern to reuse server-side
- `src/hooks/useRelationshipTopics.ts`, `src/components/cos/RelationshipTimeline.tsx`, `src/components/cos/CoverageMap.tsx` — existing "everything about this person" UI to evaluate for reuse
- `src/types/inbox.ts`, `src/lib/inboxValidation.ts` — `InboxItem`/`AgentPayload` types and validation to extend

---

## Implementation notes (post-approval)

Implemented in this pass, in a single compressed session against the estimate in §7:

- **Prerequisite infra:** confirmed via the live Supabase project (`pxirfndomjlqpkwfpqxq`) that `pgvector` (`vector` extension, v0.8.0) is available but not installed. Per §1.2's own recommendation, the embedding pipeline (§1.3, §5a) was **deferred rather than built** — v1 uses the existing big-context Claude-prompt pattern (`generate-person-brief`) instead. Idea #1 (Unified Funnel) was confirmed complete on a separate branch (`worktree-agent-aaab64a8277b6473e`, real migrations wiring `cos_meeting_actions`/`meeting_action_items` into `inbox_items` with two-way sync) — not merged into this branch, but its existence changes the volume assumption in §6/§7's rollout gating.
- **Person page (§2, §5b):** `/inbox/person/:memberId` route added to `src/App.tsx`, rendered through the existing `InboxPage` (same pattern as `/inbox/meetings`). `src/hooks/usePersonPage.ts` aggregates `cos_team_members`, open `inbox_items` via `inbox_tags`/`inbox_item_tags`, `cos_relationship_documents`, and `cos_one_on_one_prep`; reuses `useRelationshipTopics`/`useForgottenCommitments` as-is rather than duplicating them (per §2.3's reuse note). `src/components/inbox/PersonPage.tsx` renders all sections plus the existing `PersonContextWidget`. A "View page" entry point was added to `PersonContextWidget`/`InboxAssistantPanel`.
- **Pre-1:1 brief generation (§3, §5c):** `supabase/functions/generate-person-brief/index.ts` (new) assembles open items, relationship-topic deltas, and forgotten commitments, asks Claude (haiku) for 3 grounded talking points, and idempotently upserts a `brief_item` inbox row. `supabase/functions/agent-tick/index.ts` gained a `prestageInboxBriefs()` branch (mirroring `prestagePreps`'s shape, reusing `meetingQualifiesForPrep`) gated by a new `pre_stage_inbox_brief` config flag (default **false**, per §4's gating recommendation) — the real meeting-time source turned out to be `cos_one_on_one_events` (calendar-synced, already `team_member_id`-resolved), not `dci_meeting_schedule` as originally guessed in §3.1; the plan's dependency reasoning held, the specific table cited did not.
- **Onboarding & User Education (§7a):** cold-start empty states and copy (§7a.1) shipped in `PersonPage.tsx`; info-icon tooltips with "from:" source captions on talking points (§7a.2) shipped in the new `PersonBriefDetail.tsx`; a dismissible what's-new banner (§7a.3) shipped as `WhatsNewPersonMemoryBanner.tsx` since no existing changelog surface was found in this codebase (the plan's own fallback); the first-run consent/expectations modal (§7a.4) shipped as `PersonMemoryConsentModal.tsx` + `usePersonMemoryConsent.ts`, gated on a new `cos_settings.person_memory_consent_seen_at` column.
- **Data model corrections found during implementation:** `cos_relationship_documents` (migration `20260714000002`) and `cos_settings.person_memory_consent_seen_at` were missing from the committed `src/integrations/supabase/types.ts` (newer than the last type regen). Rather than a full regen — which would have reverted against the live project's actual (older) deployed schema — these were hand-added, cross-checked against their migrations.

**Testing:**
- `src/test/migrations/personMemoryRls.test.ts`: static verification (matching this repo's existing migration-test convention) that every table the person page/brief touch enforces `auth.uid() = user_id`, and that `cos_forgotten_commitments` is a plain (non-`SECURITY DEFINER`) view so it inherits that scoping rather than bypassing it.
- `e2e/inbox/personMemoryPrivacy.spec.ts`: live two-user RLS isolation test (written, matching the existing `e2e/critical/security.spec.ts` pattern) — **not executed** in this session. Local Supabase failed to start (a `storage-api` image tag mismatch, and its DB port was already bound by another running project on this shared machine); stopping that other project's containers to force a port free felt too disruptive to do unilaterally, so this is flagged as an explicit follow-up rather than silently skipped.
- `src/test/components/inbox/PersonPage.test.tsx`, `PersonBriefDetail.test.tsx`, `src/test/hooks/usePersonMemoryConsent.test.ts`: component/hook tests covering the §7a.5 acceptance criteria directly (named empty states, no-jargon check, consent modal gating).
- Full suite: `npm run lint` — 0 errors (81 pre-existing warnings, none in new files). `npm run db:validate` — 200 migrations valid. `npx vitest run` (with a valid `.env.local`) — 43/43 files, 547 passed, 4 skipped, 0 failed.

**Follow-ups for a human to pick up:**
1. Run `e2e/inbox/personMemoryPrivacy.spec.ts` for real against a local Supabase once the port conflict is resolved, and treat it as a merge-blocking check, not optional — the static test only proves the policies are *declared*, not that Postgres *enforces* them.
2. Resolve §4a (fork-vs-consolidate) explicitly with the team — this implementation took Option A (read across `inbox_*` and `cos_*`) as the plan recommended, but that's a standing architectural coupling, not a one-time decision.
3. The "open items both directions" (`owed_by: 'me' | 'them'`) is currently an approximation (tagged inbox items = mine, forgotten commitments = theirs) rather than an explicit field — noted inline in `generate-person-brief/index.ts`; revisit once real usage shows whether this is good enough.
4. `pre_stage_inbox_brief` ships **off by default** everywhere — turning it on for real users should follow §4/§7's staged-rollout guidance (confirm idea #1's ingestion is actually live for that workspace first), not be flipped globally.
