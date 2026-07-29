# Plan: Idea #10 — Meeting Intelligence Enrichment (Soundbites + Sentiment/Talk-Time)

Status: **PLANNING ONLY — no feature code written.** This document is for review/approval before implementation begins.

---

## 0. TL;DR

Two Fireflies.ai-inspired ideas, bundled because they extend the same pipeline (`zoom-recordings-sync` → `cos_zoom_transcripts` → `extract-zoom-quotes` → `cos_member_quotes`/`inbox_items`):

1. **Soundbites** — let a user *play* the audio behind an already-extracted featured quote, not just read it.
2. **Sentiment & talk-time** — compute per-meeting talk-time ratios and an overall sentiment signal from data already ingested (`cos_zoom_transcripts.content`, VTT), no new ingestion required.

**Both ideas are buildable, but neither is a small add-on to existing code — each has a real prerequisite gap:**

- **Soundbites is blocked on timestamps.** `extract-zoom-quotes/index.ts` strips VTT timestamps *before* the transcript ever reaches Gemini (`stripVtt()`, line 18), and the Gemini prompt explicitly instructs the model to **clean up filler words** ("um", "uh") from quotes (`EXTRACT_PROMPT`, line 173). Neither the extraction output shape (`ExtractedQuote { speaker, quote, context }`, line 62) nor the `cos_member_quotes` schema has any timestamp column. So even after fixing the prompt to *see* timestamps, a returned quote is **not a verbatim substring of the transcript** — you cannot `indexOf()` it back into the VTT to find when it was said. This needs a real alignment step, not just a schema column (§2.1).
- **Talk-time is buildable today with no blockers**, purely from parsing `cos_zoom_transcripts.content` VTT cues client- or server-side — the format already carries per-cue timestamps and (when Zoom detects it) a `<v Speaker Name>` voice tag per cue. The only soft gap is attributing a raw transcript speaker string to a `cos_team_members` row, which reuses the exact same fuzzy name-matching heuristic `extract-zoom-quotes` already has (line 358-377) — and inherits its exact same ambiguity/no-match failure modes.
- **Sentiment has a working precedent to copy, not invent**: `generate-1on1-prep/index.ts` already runs an LLM classification pass (Claude Haiku 4.5) over generated prep content to produce `cos_relationship_topics.sentiment ∈ {positive, negative, neutral, mixed}` and rolls it into a 0-10 relationship health score (§2.4). A meeting-level (not topic-level) sentiment signal can follow the same pattern applied directly to a transcript.
- **This plan's privacy risk is structurally the same one already flagged and left open in `docs/SPECIFICATION.md` §7.9 / §13 item 9**: relationship-memory sentiment is shown only to the manager, with the direct report having no visibility or opt-out. Surfacing a *specific person's* sentiment/talk-time signal without their knowledge is the same open policy gap, applied to a new surface — not a new problem to solve independently (§5).

---

## 1. Grounding — the pipeline as it exists today

### 1.1 Ingestion: `zoom-recordings-sync/index.ts`

- Lists recordings via `GET /v2/users/me/recordings` (`ZoomRecording.recording_files[]` — line 19-40), each file having `file_type` (`MP4`, `M4A`, `TRANSCRIPT`, `CHAT`, etc.), `download_url`, `recording_type`.
- The Zoom response type also declares `participant_audio_files` (line 35-39, **per-participant, presumably speaker-isolated audio tracks**) — parsed into the `ZoomRecording` interface but **never read, stored, or used anywhere** (confirmed: zero other matches for `participant_audio_files` in the whole repo). This is a real, unused Zoom capability that would be far better suited to clean per-speaker soundbite extraction than slicing a mixed-track MP4/M4A, and is worth flagging as a design option even though it's out of scope to build against blind (needs a live check of which Zoom accounts/plans actually populate it).
- The only file type the code currently downloads is the `TRANSCRIPT` one (`f.file_type === 'TRANSCRIPT' || f.recording_type === 'audio_transcript'`, lines 355-357, 411-413) — its bytes go straight into `cos_zoom_transcripts.content`. **No MP4/M4A audio/video bytes are ever fetched or stored** — only their `download_url` inside the raw `recording_files` jsonb blob that gets upserted verbatim (line 371: `recording_files: meeting.recording_files ?? []`).
- `cos_zoom_recordings.share_url` (added later, in `20260730000002_add_source_url_to_suggested_tasks.sql:3` — a migration named for an unrelated change) stores Zoom's shareable *web viewer page* link, not an embeddable media URL — irrelevant to in-app clip playback.
- Zoom cloud recording `download_url`s require the connecting user's OAuth **Bearer token** on every fetch (see every `fetch(transcriptFile.download_url, { headers: { Authorization: 'Bearer ...' }})` call site, e.g. line 418-420) — they cannot be set directly as a `<audio src="...">` from the client, and they are also subject to Zoom's account-level cloud-recording retention/trash policy, so a URL captured today is not guaranteed to resolve indefinitely.

### 1.2 `cos_zoom_transcripts` — VTT format and what's actually preserved

Schema (`20260612000200_zoom_transcripts.sql`): `content text NOT NULL`, `content_type text DEFAULT 'vtt'`. **The raw VTT — including cue-level timestamps and voice tags — is stored exactly as downloaded, unmodified.** Timestamp stripping only happens transiently, inside `extract-zoom-quotes`, as an in-memory transform before the Gemini call (`stripVtt()`, never persisted back to the table). This is the single most important grounding fact for this plan: **the raw transcript still has everything needed for both Soundbites and talk-time — the information loss happens downstream, in extraction, not at ingestion.**

Zoom's standard cloud-recording VTT shape (not literally present as a fixture anywhere in this repo — no `.vtt` sample or test fixture exists to quote verbatim, confirmed by search — but implied by `stripVtt()`'s filtering logic and Zoom's documented transcript format):
```
WEBVTT

1
00:00:00.000 --> 00:00:04.500
<v Jane Smith>Hello everyone, thanks for joining.</v>

2
00:00:04.600 --> 00:00:08.200
<v John Doe>Happy to be here.</v>
```
`stripVtt()` (line 18-31) filters out the `WEBVTT` header line, blank lines, bare-numeric index lines, and `-->` timing lines, and `NOTE` lines — but it does **not** strip the `<v Name>...</v>` voice-span tags, meaning Gemini currently receives lines like `<v Jane Smith>Hello everyone...</v>` as literal text and has to parse the speaker out of that markup itself (undocumented, implicit reliance on model capability, not a deterministic parse). For talk-time computation this is actually good news: a dedicated VTT parser (not an LLM call) can reliably extract `(speaker, startSeconds, endSeconds)` per cue directly via a `<v ([^>]+)>` regex plus the `-->` timing line, with no LLM involved and no cost.

**Caveat found while tracing this**: whether every cue reliably carries a `<v Name>` tag depends on Zoom's speaker-identification succeeding for that segment — the codebase's own `isNoisySpeakerName()` guard (`NOISY_SPEAKER_RE`, extract-zoom-quotes line 41-49: `/^(unknown|guest\s*\d*|\+?\d{7,})$/i`) exists specifically because **raw transcript speaker labels are known to sometimes be anonymous dial-ins or placeholder names** — so talk-time-per-speaker will have the same "unattributable segment" edge case quote extraction already works around, not a new one.

### 1.3 `extract-zoom-quotes/index.ts` — no timestamps in, no timestamps out

- Input to Gemini: `stripVtt(transcript.content)`, i.e. speaker-tagged but timestamp-free text (line 292-294).
- `EXTRACT_PROMPT` (line 171-199) asks for `{ "quotes": [{ "speaker", "quote", "context" }], "commitments": [...] }` — no timestamp field requested, and explicitly instructs cleanup: *"Each quote must be a direct, verbatim phrase (clean up filler words like 'um', 'uh', 'you know')"* (line 175). This single instruction is the reason a later "just re-find this string in the VTT" approach won't work reliably — the returned text is a **cleaned paraphrase**, not a literal substring.
- `cos_member_quotes` schema (`20260611100000_create_member_quotes.sql`): `id, user_id, team_member_id, quote, said_on, source, source_ref, featured` — **no timestamp/offset column of any kind exists today.**
- `meeting_insight` inbox rows carry a richer `source_ref` (per `PLAN_idea3_meeting_insights.md` §3, already shipped): `recording_id`, `transcript_id`, `quote_id`, `speaker_name`, `meeting_topic`, `said_on`, `context` — still **no timestamp field**. `PLAN_idea3` itself flagged this exact gap as an open question at the time ("open question 4") and shipped anyway with an explicit fallback: *"the click-through may only open the recording without seeking to the exact timestamp (deep-linking to transcript_id/quote_id is explicitly unconfirmed)... acceptable for v1"* (`PLAN_idea3_meeting_insights.md:643-649`). That fallback is exactly where the pipeline still stands today, two ideas later — this plan is the first one that actually needs to close it.

### 1.4 Where quotes surface in the UI today

Two places, both text-only, confirmed by grep — **no `<audio>`/`<video>` element exists anywhere in `src/` today** (zero matches, checked explicitly):
- **1:1 hero card** — `src/components/cos/OneOnOnesView.tsx`. `MemberQuote` type (line 66-70: `{ quote, said_on, source }` — note: doesn't even carry `id`, so today's hero card can't deep-link to the underlying `cos_member_quotes` row, let alone a timestamp). Rendered inside `UpNextHeroEvent`'s "Inspiring quote" block (line 787-790: a `bg-white/10` card showing `"{quote}"` + formatted date, no interactivity beyond display).
- **Meeting-detail "Past 1:1s" tab** — `src/components/inbox/MeetingDetailPanel.tsx`. The `zoomRecs` query (line 164-168) selects only `id, topic, start_time, duration_minutes, has_transcript, ai_summary` from `cos_zoom_recordings` — **it doesn't even select `recording_files` or `share_url`**, so today's recording-list cards (line 397-428) have literally nothing to link out to; they show date/duration/AI-summary text only, with a static "Transcript captured" badge, no play/download affordance of any kind.
- `meeting_insight` inbox rows (the third quote-surfacing site, in the main Inbox list) are plain text rows per `PLAN_idea3`; no audio affordance was built there either.

**Conclusion: there is currently zero media-playback UI anywhere in this app.** Soundbites is not "add a play button to an existing player" — it is building the first audio-player component TacticalSync has ever had, from scratch, plus a proxy layer for the Zoom-authenticated fetch.

### 1.5 Existing sentiment precedent — copy this pattern, don't invent a new one

- `rc_checkins.sentiment` (`20251112000000_create_rcdo_tables.sql:111`) is a **manual, human-entered** integer (`-2..2`) on RCDO check-ins — unrelated domain, not AI-computed, not usable as precedent for automated inference.
- The real precedent is `cos_relationship_topics.sentiment` (`20260620000000_relationship_memory_agent_foundation.sql:34-35`: `CHECK (sentiment IN ('positive','negative','neutral','mixed'))`), populated by an **LLM classification pass** inside `generate-1on1-prep/index.ts`:
  - Runs a second Claude call (`claude-haiku-4-5-20251001`, line 928) over the *already-generated prep brief text* (not the raw Zoom transcript directly — the brief synthesizes Zoom/Slack/email first), asking for `{ topic, category, sentiment, snippet }` per extracted topic (prompt at line 933-938).
  - Sentiment values get weighted (`positive: 2, neutral: 1, mixed: 0.5, negative: 0`, line 1145-1146) and averaged into a `sentimentScore` component of a 0-10 relationship health score (line 1150-1152), alongside cadence/resolution/forgotten-item scores.
  - This is **topic-level sentiment aggregated over time**, not a **single meeting's overall sentiment** — a materially different shape than what "Idea #10" asks for (a per-meeting signal), but the mechanism (LLM classification prompt, Claude Haiku for cost) is directly reusable.
- No sentiment computation exists anywhere in `agent-tick/index.ts` or `generate-meeting-suggestions/index.ts` (confirmed, zero matches for "sentiment" in either file).
- No talk-time / talk-ratio computation of any kind exists anywhere in the codebase today (confirmed, zero matches for "talk_time"/"talk time"/"talktime").

---

## 2. Blockers (read before scoping either sub-feature)

### 2.1 Soundbites: quote text is not a substring of the transcript it came from

This is the load-bearing blocker for the entire feature, not an implementation detail:

- **Today's pipeline actively destroys the information needed.** `stripVtt()` removes timestamps before Gemini ever sees the transcript, and the prompt tells Gemini to clean up disfluencies. Both must change for Soundbites to be possible at all — this isn't "add a column," it's "change what the model is given and what it's asked to preserve."
- **Even after fixing the prompt, alignment is a real algorithmic step, not a lookup.** Two options, both real work:
  1. **Prompt change: ask Gemini to also return the cue index/timestamp of the *first* VTT line the quote draws from**, by re-numbering the (still-stripped-of-`-->`-syntax-for-readability, but timestamp-annotated) transcript before sending it — e.g. prefix every cue with `[cue 14 | 00:03:12]` so Gemini can cite it back. Risk: an LLM citing a line number it read is meaningfully more reliable than fuzzy string-matching a paraphrase, but still not guaranteed exact — Gemini can hallucinate a plausible-looking but wrong cue reference, especially for a quote that was assembled by combining two adjacent utterances.
  2. **Fuzzy-match the returned (cleaned) quote text back against the original (verbatim) VTT cues** using a substring/edit-distance search over a sliding window of concatenated cue text, then take the matched window's start/end timestamps. More robust to Gemini not being asked to change behavior at all, but adds a real matching algorithm (and its own false-positive risk if the same phrase appears twice, or filler-word removal moves the match boundary by a few words).
  - **Recommendation: start with option 1** (ask for a cue citation directly) since it's the smaller prompt change and matches the "trust the model, verify narrowly" pattern already used elsewhere in this pipeline, but budget for option 2 as a fallback/cross-check — cite the cue number from option 1, then verify the cited cue's text has reasonable string overlap with the returned quote before trusting the timestamp, falling back to "no clip available" (never a wrong clip) if verification fails.
- **This blocker must be resolved and explicitly re-scoped before any UI work starts** — building a clip player against a timestamp that's frequently wrong is worse than not having one (a soundbite that plays the wrong 15 seconds of a 1:1 is a trust-eroding failure mode, not a minor bug).

### 2.2 Soundbites: authenticated, time-limited source media

- Zoom `download_url`s require a Bearer token that belongs to the *connecting user's* Zoom OAuth session — they cannot be exposed directly to a browser `<audio>`/`<video>` tag, and definitely cannot be put in a "Playlist" that's meant to be shareable with people who aren't the connected Zoom user. Any playback needs a **server-side proxy** (a new edge function) that holds the token and streams bytes to the authenticated TacticalSync user — this is a new category of edge function for this codebase (everything today is either JSON-in/JSON-out, or a one-shot download-then-store like the transcript fetch; nothing streams binary media back to the client).
- Zoom's cloud recording retention is account-configurable and often time-limited (commonly 30-90 days before auto-delete to trash, then permanent deletion after a further retention window) — a "Soundbites playlist" implies some notion of durability, but the underlying source file is not guaranteed to still exist by the time someone replays a saved bookmark. If clips need to outlive Zoom's own retention window, the only way is to **download and persist the sliced audio into Supabase Storage** at extraction time — a materially bigger scope addition (storage costs, a new bucket + RLS policy, an actual audio-slicing step) that should be called out as a separate, explicit decision, not assumed.
- Zoom's HTTP file download does support standard byte-range requests, but audio time-position does **not** map to a fixed byte offset for compressed formats (M4A/AAC) without decoding — there's no way to ask Zoom's API for "give me the bytes from 3:12 to 3:27" directly. The only two real options are: (a) serve the whole file through the proxy and let the browser's native `<audio>` element seek via `currentTime` (simplest, no server-side audio processing, but downloads/proxies the full recording just to play 15 seconds of it), or (b) actually transcode/slice server-side (ffmpeg or similar) before serving — real infrastructure this codebase has never needed before (every edge function today is Deno + `fetch`, no media-processing dependency exists anywhere in `supabase/functions/`). **Recommend (a) for v1** — accept "seek within the full download" as the mechanism, defer server-side slicing to a later phase if playback bandwidth/cost becomes a real problem.
- **The unused `participant_audio_files` field** (§1.1) is worth a follow-up spike: if Zoom's plan/account settings actually populate per-participant audio tracks for these meetings, a soundbite could pull a clean, speaker-isolated track instead of a mixed-room recording — meaningfully better UX (no cross-talk in the clip) — but this needs to be verified against a real Zoom account/plan before committing to it in a spec; do not assume it's populated.

### 2.3 Sentiment & talk-time: no blocker on data availability, but real blockers on framing/attribution

- **No blocker on raw data** — VTT cues already carry everything needed (§1.2). This sub-feature could start today.
- **Speaker-to-person attribution blocker (soft, shared with Soundbites' cousin problem in idea9)**: talk-time-per-speaker is only useful if "Speaker: Jane Smith, 340s" can be resolved to a specific `cos_team_members` row. The only existing mechanism for this is `extract-zoom-quotes`'s fuzzy name matcher (line 358-377: exact match → unambiguous first-name match → unambiguous last-name match), which is a **manager-side, best-effort heuristic** — the same free-text, unverified-identity limitation flagged as the core blocker in `PLAN_idea9_manager_signals.md` §2.1 (`cos_team_members` has no FK to a real `auth.users`/identity row). Talk-time inherits this exactly: it can bucket seconds-spoken by a *name string* reliably, but "is this actually the same Jane Smith as `cos_team_members.id = X`" is exactly as fuzzy as it already is elsewhere in this codebase — not a new gap, but worth stating plainly rather than implying new precision that doesn't exist.
- **Sentiment-signal framing blocker is the real one**: a per-meeting "sentiment: negative" badge attached to a specific person's name is a much sharper, more legible surveillance signal than the existing topic-sentiment-rolled-into-a-health-score pattern (§1.5) — a health score is an abstraction several steps removed from "this specific 1:1 with this specific person scored negatively," whereas a raw per-meeting sentiment badge is not. This is not a schema/engineering blocker, it's the same open product/privacy question already on record in `docs/SPECIFICATION.md` §7.9 and flagged unresolved in §13 (Known Issues) item 9 — **do not treat it as solved by analogy to the existing feature; the existing feature's own doc explicitly calls its consent model one-sided and unaddressed.** (§5 below.)

---

## 3. How the two sub-features relate

- **They are independently shippable — no schema dependency between them.** Soundbites needs new timestamp/alignment work in `extract-zoom-quotes` + `cos_member_quotes`; sentiment/talk-time is a separate read-only computation over `cos_zoom_transcripts.content` that doesn't touch quotes at all. Either can ship without the other.
- **They share infrastructure worth building once**: both need a VTT parser that turns raw cue text into `{ speaker, text, startSeconds, endSeconds }[]` — Soundbites needs it for cue-citation verification (§2.1 option 2), talk-time needs it as its entire computation. **Recommend building this parser as a single shared module** (e.g. `supabase/functions/_shared/parseVtt.ts`) consumed by both `extract-zoom-quotes` (for citation verification) and a new talk-time computation function, rather than two independent implementations drifting apart — this mirrors the existing `_shared/` convention (`matchEventToMember.ts`, `retryWithBackoff.ts`, `inboxTriageUtils.ts`).
- **Sequencing recommendation**: ship **sentiment/talk-time first** (Phase A) — it has no blocker, reuses an established LLM-sentiment pattern, and delivers the shared VTT parser as a byproduct. Ship **Soundbites second** (Phase B), building on that parser for its alignment-verification step, once the timestamp-alignment approach (§2.1) has been validated against a sample of real transcripts.

---

## 4. Phased implementation plan

### Phase A — Sentiment & talk-time (schema → backend → frontend)

**A0. Validation spike (before any code) — not part of the estimate below**
- Pull 5-10 real `cos_zoom_transcripts.content` rows from a connected dev account and confirm: (a) `<v Name>` tags are present on most/all cues, (b) cue timing granularity is fine enough to be meaningful, (c) how often `isNoisySpeakerName()`-style unidentified segments occur in practice. This spike should directly inform whether talk-time is worth shipping as a hard percentage or should default to a coarser "mostly X, some Y" framing.

**A1. Schema**
- New table `cos_meeting_analysis` (one row per `cos_zoom_recordings.id`, mirroring the 1:1-per-recording shape of `cos_zoom_transcripts`):
  ```sql
  CREATE TABLE cos_meeting_analysis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id uuid NOT NULL REFERENCES cos_zoom_recordings(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    talk_time_seconds jsonb NOT NULL DEFAULT '{}',  -- { "Jane Smith": 340, "John Doe": 210, "unattributed": 45 }
    overall_sentiment text CHECK (overall_sentiment IN ('positive','negative','neutral','mixed')),
    sentiment_rationale text,  -- 1-sentence LLM justification, for transparency/trust
    analyzed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (recording_id)
  );
  ```
  RLS: identical owner-only pattern as every other `cos_*` table (`auth.uid() = user_id`), following the precedent in every migration cited above — no new RLS shape needed.
  Talk-time is stored keyed by **raw speaker name string**, not `team_member_id` — deliberately, to avoid overclaiming precision the fuzzy-matcher can't back up (§2.3); the hook/UI layer resolves display names against `cos_team_members` at read time, the same way `extract-zoom-quotes` does at write time, so a later improvement to matching doesn't require a backfill.

**A2. Backend — shared parser + new/extended edge function**
- `supabase/functions/_shared/parseVtt.ts` (new, shared): parses raw VTT into `{ speaker: string | null, text: string, startSeconds: number, endSeconds: number }[]`, reusing `isNoisySpeakerName()`'s regex (moved to shared or duplicated with a comment pointing at the original) to mark unattributable cues.
- Talk-time: pure arithmetic over parsed cues (`endSeconds - startSeconds` summed per speaker) — **no LLM call needed**, cheap, can run synchronously inside whichever function computes it.
- Sentiment: one new Claude Haiku call (matching `generate-1on1-prep`'s model choice and prompt style) over the *stripped* transcript text (reuse `extract-zoom-quotes`'s `stripVtt()` or the new shared parser's plain-text join), asking for `{ overall_sentiment, rationale }` for the whole meeting — a much simpler prompt than the existing topic-extraction one since it's a single classification, not an array.
- Where this runs: **extend `extract-zoom-quotes`** (it already loads the transcript, already calls an LLM, already has the `quotes_extracted_at` cursor pattern to avoid reprocessing) rather than standing up a fourth Zoom-pipeline edge function. Add the analysis insert as a second, independent write inside the existing per-transcript loop (mirroring how quotes/commitments already run as two independent passes over one Gemini call today) — though sentiment likely needs its own model call (Claude, not Gemini, to match the existing sentiment precedent) unless a combined single-provider prompt is judged simpler at implementation time; flag this as an implementation-time decision, not pre-decided here.

**A3. Frontend**
- New hook `src/hooks/useMeetingAnalysis.ts` (`.from('cos_meeting_analysis').select('*').eq('recording_id', id).maybeSingle()`), following the thin-view-consumer convention (`useRelationshipTopics.ts`/`useManagerSignals.ts` precedent).
- UI home: `MeetingDetailPanel.tsx`'s existing "Past 1:1s" tab (§1.4) — each recording card (line 397-428) gains a small talk-time bar (two-segment horizontal bar, "You: 62% · Jane: 38%") and a sentiment badge (colored pill, following the existing `Badge variant="outline"` pattern already used for the "Transcript" badge at line 414) next to the existing date/duration line.
- **Framing copy, modeled directly on the guardrails already written for Manager Signals** (`PLAN_idea9_manager_signals.md` §4 — since it shipped, per `docs/SPECIFICATION.md` §7.10, treat its guardrails as the house style, not just a proposal): no bare percentage without a minimum meeting-length floor, no cross-meeting/cross-person leaderboard, sentiment framed as a conversation-quality signal about the meeting, not a verdict on the other person.

### Phase B — Soundbites (schema → backend → frontend)

**B1. Prerequisite gate**: do not start B2+ until §2.1's alignment approach has been prototyped against 10+ real transcripts and shown to produce correct timestamps at an acceptable rate (define a concrete bar, e.g. "≥90% of cited cues, manually checked, actually contain the quoted text or a close paraphrase of it") — this is the Phase-0-style gate `PLAN_idea9` used for its own blocker, applied here.

**B2. Schema**
- `cos_member_quotes` gains two nullable columns (nullable because older, already-extracted quotes have no timestamp and must degrade gracefully, not be backfilled):
  ```sql
  ALTER TABLE cos_member_quotes
    ADD COLUMN IF NOT EXISTS start_seconds numeric,
    ADD COLUMN IF NOT EXISTS end_seconds numeric;
  ```
- Same two columns added to the `meeting_insight` `source_ref` jsonb shape (additive, per `PLAN_idea3`'s own precedent of extending `source_ref` without breaking existing consumers) — no migration needed there since it's jsonb, just a TypeScript type update to `SourceRef` (`src/types/inbox.ts`).
- If clip **persistence beyond Zoom's retention window** is in scope (§2.2) — a separate product decision, not assumed here — a new `cos_soundbite_clips` table plus a Supabase Storage bucket would be needed; deliberately **not spec'd in this document** pending that decision, to avoid over-building against an unconfirmed requirement.

**B3. Backend**
- Extend `extract-zoom-quotes`'s prompt/parsing per §2.1's chosen approach (cue-citation, with the shared VTT parser from Phase A2 used to verify the cited cue's text actually overlaps the returned quote before trusting the timestamp — a fallback to "no clip" is always safer than a wrong clip).
- New edge function `zoom-media-proxy` (or similar) — the first binary-streaming edge function in this codebase (§2.2): authenticates the TacticalSync user, looks up the relevant `recording_files[]` entry's `download_url` + refreshes the Zoom token if needed (reusing the existing refresh logic pattern from `zoom-recordings-sync`), fetches the full file with the Bearer token, and streams it back with correct `Content-Type`/`Content-Length`/Range-passthrough headers so the browser's native `<audio>` element can seek.

**B4. Frontend**
- **First audio-player component this codebase has ever needed** (§1.4) — `src/components/media/ClipPlayer.tsx` (new), a thin wrapper around a native `<audio>` element pointed at the proxy endpoint with `#t=start,end` (or manual `currentTime`/`pause`-at-boundary via `timeupdate`, since `#t=` fragment support for pausing at an end-time isn't universal across browsers — verify at implementation time rather than assume).
- Wire into both existing quote-display sites (§1.4): the 1:1 hero card (`OneOnOnesView.tsx`) gains a small play button on the "Inspiring quote" block when `start_seconds` is present (falls back to today's text-only display when it's null, i.e. every quote extracted before this ships); `MeetingDetailPanel.tsx`'s "Past 1:1s" tab cards gain the same.
- **"Playlist" concept (the Fireflies-inspired framing) is a v2, not v1** — v1 should ship single-clip playback proven correct and trusted before building any collection/reordering/sharing UI around it; recommend treating "playlists" explicitly as a follow-up phase, mirroring how `PLAN_idea9` deferred its least-specified signal (§3.3 "topics that never surface") to a later phase rather than launch-blocking the core feature.

---

## 5. Open questions needing a product decision before building

1. **Sentiment privacy framing — this is the single biggest open question, and it is not new.** `docs/SPECIFICATION.md` §7.9 already states, about the closely related Relationship Memory feature: *"there is currently no mechanism for the direct report... to know about or opt out of this — flagged as an open privacy gap, not yet addressed"* — and §13 (Known Issues) item 9 repeats it as unresolved. A per-meeting sentiment badge tied to a named person is at least as sensitive as that existing gap, arguably more so (it's a snapshot judgment about one specific conversation, not an aggregated multi-source narrative). **Recommend this feature not ship until that existing gap has a product/policy answer**, rather than layering a second unaddressed instance of the same open question on top of the first.
2. **Talk-time framing**: is the intended audience the *user themselves* (self-reflection: "did I talk too much in my own 1:1s?") or a *manager viewing a report's talk-time in meetings with others*? These are very different privacy postures — the former is unambiguously fine (it's the user's own behavior in their own meeting), the latter runs into the exact §5.1 concern. Recommend scoping v1 to **self-reflective framing only** ("your talk-time in this meeting") to sidestep the open question entirely for the initial ship, deferring any other-person-focused framing until §5.1 is resolved.
3. **Clip persistence/durability** (§2.2): is it acceptable for a saved Soundbite to eventually 404 once Zoom's cloud retention window passes, or does this require actually copying audio into Supabase Storage (real infra + cost decision)? Affects whether Phase B ships as "ephemeral clip playback" or "durable soundbite library" — materially different scope.
4. **`participant_audio_files` verification** (§2.2): does the connected Zoom account/plan actually populate per-participant audio tracks? Worth a quick manual check against a real account before Phase B commits to which source file a clip is sliced from.
5. **Alignment approach** (§2.1): cue-citation vs. fuzzy-match-back, or both (citation + verification) — needs to be prototyped against real data (§4, B1) before committing, not decided from first principles in this document.
6. **Where "playlists" (if ever built) should live** — a new top-level surface, or folded into the existing 1:1 hero card / meeting-detail surfaces? Deferred per §4 B4, but worth an explicit product answer before v2 scoping starts.

---

## 6. Files to change / create (summary)

**New files:**
- `supabase/migrations/<timestamp>_meeting_analysis.sql` — Phase A1's `cos_meeting_analysis` table.
- `supabase/migrations/<timestamp>_member_quotes_timestamps.sql` — Phase B2's two nullable columns.
- `supabase/functions/_shared/parseVtt.ts` — shared VTT cue parser (Phase A2/B1).
- `supabase/functions/zoom-media-proxy/index.ts` — Phase B3's authenticated media-streaming proxy.
- `src/hooks/useMeetingAnalysis.ts` — Phase A3.
- `src/components/media/ClipPlayer.tsx` — Phase B4, first audio-player component in the codebase.
- Test files: unit tests for `parseVtt.ts` (cue extraction, speaker-tag parsing, noisy-speaker exclusion) and for the talk-time arithmetic; e2e coverage for clip playback once B ships.

**Modified files:**
- `supabase/functions/extract-zoom-quotes/index.ts` — sentiment/talk-time analysis pass (A2) and timestamp-citation prompt change + verification (B3).
- `supabase/migrations/20260611100000_create_member_quotes.sql`-descended schema — via the new B2 migration, not editing the original file.
- `src/types/inbox.ts` — extend `SourceRef` with `start_seconds`/`end_seconds` (additive, per `PLAN_idea3`'s established pattern for this same type).
- `src/components/cos/OneOnOnesView.tsx` — `MemberQuote` type gains `id`/`start_seconds`/`end_seconds`; hero card gains play affordance (B4).
- `src/components/inbox/MeetingDetailPanel.tsx` — `zoomRecs` query extended to select `recording_files`/`share_url`; cards gain talk-time bar + sentiment badge (A3) and clip play button (B4).

---

## 7. Risks (consolidated)

1. **Wrong-clip risk is the highest-severity risk in this entire plan** (§2.1) — a soundbite playing the wrong moment is a concrete trust failure, worse than no feature at all. The alignment-validation gate (§4, B1) is a hard prerequisite, not a nice-to-have.
2. **Streaming binary media through a Deno edge function is new infrastructure** for this codebase (§2.2, §4 B3) — every existing edge function is small JSON request/response; a full-recording proxy has different timeout/memory/cost characteristics worth load-testing before shipping broadly.
3. **Sentiment/talk-time privacy framing directly overlaps an already-flagged, already-unresolved gap** (§5.1) — shipping without resolving that risks compounding a known open issue rather than fixing it.
4. **Speaker attribution is exactly as fuzzy as it already is elsewhere** (§2.3) — talk-time percentages will look precise (a percent number) while resting on the same free-text name-matching heuristic that idea9 flagged as its core limitation; UI copy must not imply more certainty than the underlying match logic provides.
5. **`participant_audio_files` is an attractive but unverified shortcut** (§2.2, §5.4) — do not architect Phase B around it without confirming it's actually populated for real accounts first.
6. **Zoom cloud-recording retention makes "durable" a real design decision, not a default** (§2.2, §5.3) — must be explicitly decided, not silently assumed either way.
