# External Integrations Reference

Source of truth for every external-system integration in this codebase, extracted directly from the implementation (not from specs or intentions). Use this as the pattern library when rebuilding similar integrations elsewhere.

**Scope note:** this codebase has no Gong, Pendo, Aha, Salesforce (direct), or Finance/billing integrations. The only external systems integrated today are **Zoom**, **Slack**, **Google Calendar**, **Gmail**, and **StackOne** (a unified-API gateway that proxies to 200+ HRIS/CRM/ticketing systems — including Salesforce, HubSpot, Jira, BambooHR, Workday — under one contract), plus **ClearGo**, a first-party AI chief-of-staff API. All of these live inside the "Chief of Staff" (CoS) module, feeding 1:1 meeting prep and daily briefs — they are not part of the RCDO strategic-planning module described in `CLAUDE.md`.

All integrations share three architectural conventions worth calling out once:
- **Credential storage**: every OAuth-based integration (Zoom, Slack, Google) has its own `user_*_credentials` table (`user_id` PK) with RLS locked down on the base table and a `_public` view (`security_barrier`) that strips tokens and exposes only a `connected` boolean to the client. StackOne and ClearGo instead share one generic table, `cos_mcp_integrations`, keyed by `(user_id, integration_key)`, plus a generic settings-UI + edge-function pair (`McpIntegrationPanel.tsx` + `test-mcp-integration`) that any future api-key-based integration can reuse by adding a preset — no bespoke panel/edge-function required.
- **Dual invocation auth**: every sync edge function accepts either a normal user JWT (manual "Sync now" button) or `service-role key + x-supabase-user-id header` (cron/batch invocation on behalf of a specific user).
- **Retry/backoff**: `supabase/functions/_shared/retryWithBackoff.ts` wraps outbound calls for Zoom, Slack, Gmail, and Google Calendar (3 attempts, exponential backoff + jitter, honors `Retry-After` on 429, skips other 4xx). StackOne and ClearGo aren't covered yet — same gap, smaller blast radius (opt-in enrichment connectors, not the always-on agent pipeline).

## Contents

1. [Zoom](#zoom)
2. [Slack](#slack)
3. [Google Calendar](#google-calendar)
4. [Gmail](#gmail)
5. [StackOne](#stackone)
6. [ClearGo](#cleargo)
7. [Best Practices: Surfacing Credential Problems to Users](#best-practices-surfacing-credential-problems-to-users)

---

## Zoom

**System:** Zoom Cloud (OAuth app, no Zoom SDK — raw `fetch()` calls only)

### Purpose

Pulls a user's own Zoom meeting recordings, VTT transcripts, and AI Companion notes/summaries so that:
- 1:1 / group meeting prep can reference what was actually discussed.
- `extract-zoom-quotes` mines transcripts via Gemini to surface "featured" quotes about a team member into `cos_member_quotes`.
- `generate-meeting-suggestions` reads transcripts to propose "Suggested from your 1:1s" action items.
- `titleSources.ts`'s `suggestZoomMatches` matches a group meeting's title against recent recording topics to suggest relevant context sources.

Data flows **in only** — nothing is pushed back to Zoom except a best-effort token revoke on disconnect.

### API Endpoint(s)

| Purpose | Endpoint |
|---|---|
| OAuth token exchange | `POST https://zoom.us/oauth/token` (`grant_type=authorization_code`) |
| Token refresh | `POST https://zoom.us/oauth/token` (`grant_type=refresh_token`) |
| Token revoke | `POST https://zoom.us/oauth/revoke?token=...` |
| Current user info | `GET https://api.zoom.us/v2/users/me` |
| Recordings list | `GET https://api.zoom.us/v2/users/me/recordings?from=&to=&page_size=100&next_page_token=` |
| Participants | `GET https://api.zoom.us/v2/past_meetings/{uuid}/participants?page_size=50` |
| Transcript file | `GET {download_url}` (URL returned inside a recording's `recording_files[]`) |
| Per-meeting recordings (non-hosted, calendar-discovered) | `GET https://api.zoom.us/v2/meetings/{zoomId}/recordings` |
| Past-meeting instances (recurring → UUID resolution) | `GET https://api.zoom.us/v2/past_meetings/{zoomId}/instances` |
| AI Companion transcript | `GET https://api.zoom.us/v2/meetings/{doubleEncodedUuid}/meeting_transcripts` |
| AI Companion summary | `GET https://api.zoom.us/v2/meetings/{doubleEncodedUuid}/meeting_summary` |
| Zoom Docs (AI Companion notes) | `GET https://api.zoom.us/v2/docs?type=notes&page_size=100` |

### Authentication

Standard **OAuth 2.0 Authorization Code** grant (no PKCE; client secret used server-side via HTTP Basic auth).

- **Client-side kickoff** (`src/components/cos/CosZoomSyncPanel.tsx`) redirects to `zoom.us/oauth/authorize` with a wide scope list (`meeting:read:*`, `cloud_recording:read:*`, `docs:read:*`, `docs:write:export`, etc.) and `state=zoom_connected`.
- **Env vars**: client `VITE_ZOOM_CLIENT_ID`; server `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`.
- **Storage**: table `user_zoom_credentials` (PK `user_id`) — `access_token`, `refresh_token` (NOT NULL), `scope`, `expires_at`, `zoom_user_id`, `zoom_email`, `last_sync_at`, `last_sync_status`. Client-safe view `user_zoom_credentials_public` exposes a `connected` boolean, no tokens.
- **Refresh logic** (`zoom-recordings-sync/index.ts`): triggers when `expires_at` is within 30s of now. Zoom **rotates the refresh token on every refresh** — the new one is persisted alongside the new access token, or the next refresh fails:
  ```ts
  // Zoom issues a new refresh_token on every refresh — must persist it.
  ```
- A failed refresh with a 401 sets `last_sync_status = 'error: reauth_required'`, which the UI keys off of to render a "Reconnect Zoom" button instead of "Connect Zoom."

### Rate Limits

None implemented. No 429/`Retry-After` handling, no exponential backoff, no retry loop. The only throttle is a hardcoded pagination cap (`MAX_PAGES = 4`) and a clamped day-range window (1–180 days, default 90) — load-limiting side effects, not rate-limit awareness.

### Data Shape

`ZoomRecording` → `cos_zoom_recordings`:

| Zoom field | DB column |
|---|---|
| `meeting.id` | `zoom_meeting_id` |
| `meeting.uuid` | `zoom_meeting_uuid` (unique with `user_id`) |
| `meeting.topic` | `topic` |
| `meeting.start_time` | `start_time` |
| `meeting.duration` | `duration_minutes` |
| participant emails/names | `participant_emails text[]` / `participant_names text[]` |
| — | `has_transcript boolean` (derived) |
| `meeting.recording_files` (raw) | `recording_files jsonb` |
| matched via `matchEventToMember` | `team_member_id` |

Transcript VTT text → `cos_zoom_transcripts.content` (`content_type='vtt'`), with a computed `word_count`. AI Companion summary joins `summary_details[].summary_overview` + `.next_steps[]` into `cos_zoom_recordings.ai_summary`. Quote-extraction output `{speaker, quote, context}` → `cos_member_quotes` (`source: 'zoom'`, `featured: true`).

### Transformation Logic

- **VTT stripping** before sending to Gemini: strips `WEBVTT` headers, cue numbers, `-->` timestamp lines, `NOTE` lines.
- **Truncation**: transcripts over 8000 words are cut with a `[...truncated]` suffix before the LLM call.
- **Participant matching** reuses the shared `findMatchingMember()` (see [Google Calendar](#google-calendar) below) but widens the relationship-type include-list to everything (`direct_report, collaborator, boss, peer, skip_level, stakeholder, external`) since Zoom is "matched by participant, not attendee count."
- **Title-based fallback matching** (`matchMemberByTitle`) kicks in because Zoom often doesn't return participant emails — the code explicitly notes the participants API "needs a scope/plan many accounts lack."
- **Recurring-meeting instance resolution**: because the meeting-summary/transcript endpoints need a specific instance UUID (not the recurring meeting number), the code fetches `past_meetings/instances` and matches the closest instance to the calendar event's start time, only accepting matches within 24 hours.
- **Zoom Docs title parsing**: regex-extracts a `YYYY-MM-DD HH:MM(GMT±H:MM)` suffix from doc titles, defaulting timezone to `-07:00` if absent, then matches the remaining title text against member names.
- **Email backfill**: if a member is matched by name (not email) and has no email on file, the matched participant's email is written back onto `cos_team_members.email`.

### Error Handling

- **401 on recordings list** → `last_sync_status = 'error: unauthorized'`, returns 401, no retry.
- **401 on refresh** → distinguished as `'error: reauth_required'` specifically (drives the UI's reconnect CTA).
- **Non-401 non-OK** → stores `error: {status}`, returns 500 with `{error: 'zoom_api_error', detail, status}`.
- **Participants / transcript / instance / summary sub-fetches**: each independently wrapped in try/catch; failures are `console.warn`'d (or, for participants, silently swallowed with no log at all) and the sync continues without that piece — a failed transcript fetch never blocks a summary fetch or vice versa.
- **`disconnect-zoom`**: the Zoom-side revoke is explicitly best-effort (`.catch(() => { /* best-effort */ })`) — never blocks deleting the local credentials row.
- **Gemini quote-extraction failures**: logged, and the transcript is *not* marked processed, so it's retried on the next run.
- No special handling anywhere for 429 or generic 5xx beyond the same generic "store error string" pattern.

### Known Gotchas

- **Transcript processing delay**: comment in `agent-tick/index.ts` explains the 24-hour (not 2.5-hour) lookback window exists because "Zoom cloud transcripts frequently aren't ready within a couple hours." A meeting stays eligible for retry every 30 minutes for up to 24h.
- **Non-hosted meetings**: `/users/me/recordings` only returns meetings *you* hosted. A large calendar-discovery fallback path exists specifically because many 1:1s are hosted by the other person, relying on a `zoom_meeting_id` regex-extracted from the calendar event's location/description.
- **Double URL-encoding required** for meeting UUIDs on `meeting_transcripts`/`meeting_summary` (`encodeURIComponent(encodeURIComponent(uuid))`) — a documented Zoom quirk since UUIDs can contain `/` and `+`.
- **Participant data is usually missing** — explicitly called out in comments as the norm, not the exception, which is why title-based fallback matching exists at all.
- **Zoom Docs are a third, entirely separate code path** — "AI Companion stores meeting transcripts as Zoom Docs (type=notes). The cloud recordings API misses these entirely."
- **Hardcoded Pacific-time default** when a Zoom Doc title's timezone suffix is missing.
- No dedicated cron job exists for `zoom-recordings-sync` — it's invoked indirectly via `agent-tick` (every 30 min) and `daily-prep-batch` (hourly), plus manually from the UI.

### Code Reference

- `supabase/functions/exchange-zoom-token/index.ts`
- `supabase/functions/disconnect-zoom/index.ts`
- `supabase/functions/zoom-recordings-sync/index.ts`
- `supabase/functions/extract-zoom-quotes/index.ts`
- `supabase/migrations/20260612000000_zoom_credentials.sql`, `20260612000100_zoom_recordings.sql`, `20260612000200_zoom_transcripts.sql`, `20260628000000_calendar_zoom_meeting_id.sql`
- `src/components/cos/CosZoomSyncPanel.tsx`
- `src/lib/calendar/matchEventToMember.ts` / `supabase/functions/_shared/matchEventToMember.ts`
- `src/lib/calendar/titleSources.ts`

---

## Slack

**System:** Slack (Web API, raw `fetch()` — no `@slack/web-api` client)

### Purpose

Five distinct uses inside the CoS module:
1. **Inbound context**: DMs and channel messages synced into `cos_slack_messages` to inform 1:1 prep, group-meeting prep, and daily briefs.
2. **Outbound briefs**: the daily DCI brief and 1:1 prep notifications are posted as Slack DMs.
3. **Agentic nudges**: `agent-tick` posts interactive messages (buttons) nudging users about overdue action items.
4. **Inbound task capture**: a `/add-to-my-lists` slash command creates suggested-task rows directly from Slack.
5. **Agent-drafted outbound messaging**: `agent-command`/`agent-slack-action` let a manager ask the AI to draft/send a DM on their behalf, with human approval before send.

### API Endpoint(s)

| Endpoint | Purpose |
|---|---|
| `POST /api/oauth.v2.access` | Exchange OAuth code for bot+user tokens |
| `GET /api/auth.test` | Identify the bot's own user id (fallback only) |
| `GET /api/users.info?user=` | Fetch the authorizing user's email |
| `POST /api/auth.revoke` | Best-effort revoke on disconnect |
| `GET /api/users.list` | Build a user cache (capped at 200, no pagination) |
| `GET /api/conversations.list` (`types=im`, then `public_channel,private_channel`) | List DMs and named channels |
| `GET /api/conversations.history` | Pull message history |
| `GET /api/users.lookupByEmail` | Resolve a team member's Slack ID from email |
| `POST /api/conversations.open` | Open/get a DM channel |
| `POST /api/chat.postMessage` | Post a DM (briefs, nudges, drafted messages) |

All calls go through a shared helper:
```ts
async function slackApi(method: string, params: Record<string, string> = {}) {
  const url = new URL(`https://slack.com/api/${method}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${token}` } })
  return res.json()
}
```

### Authentication

- **Scopes**: `chat:write, commands, users:read, users:read.email, channels:read, channels:history, groups:read, groups:history, im:read, im:history, im:write`. Comment notes `commands` must be included or re-installs drop the slash-command registration.
- **Env vars**: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_SIGNING_SECRET` (server); `VITE_SLACK_CLIENT_ID` (client).
- **Storage**: `user_slack_credentials` (PK `user_id`, one workspace per user) — `access_token`, `scope`, `slack_team_id`, `slack_team_name`, `slack_user_id`, `slack_email`, `last_sync_at/status`, plus `sync_channels text[]` added later. Client view `user_slack_credentials_public` strips the token.
- **No token refresh** — intentional, per migration comment: `-- Slack bot tokens don't expire, so no refresh flow needed`.
- **Bot-vs-user ID pitfall handled explicitly in code**: `auth.test`'s `user_id` is the *bot's* id (identical across every install), so the account's `slack_user_id` must come from `tokenData.authed_user.id` instead, or the slash command lookup breaks for everyone.
- **Slash-command / interactivity auth**: `slack-add-suggestion` verifies Slack's HMAC-SHA256 request signature (`X-Slack-Signature`/`X-Slack-Request-Timestamp`, 5-min replay window, constant-time compare). **`agent-slack-action` reads `SLACK_SIGNING_SECRET` into a variable but never calls a verify function on it** — a real gap, since that endpoint has `verify_jwt=false` and handles interactive `block_actions` payloads unauthenticated.

### Rate Limits

None. No 429 handling, no `Retry-After`, no backoff, no delay between the sequential per-channel `conversations.history` calls in the sync loop. A rate-limited call is treated identically to an empty result (`if (!res.ok || ...) continue`).

### Data Shape

`SlackMessage` → `cos_slack_messages`:

| Slack field | DB column |
|---|---|
| `msg.ts` (string, `"1707414123.000200"`) | `message_ts` (kept as raw string for the unique key) |
| `ch.id` / `ch.name` | `channel_id` / `channel_name` |
| `msg.user` (resolved via user cache) | `sender_slack_id` / `sender_name` |
| `msg.text.slice(0, 2000)` | `content` |
| `msg.thread_ts` | `thread_ts` |
| `new Date(parseFloat(msg.ts)*1000).toISOString()` | `message_date` |
| resolved via `matchMember()` | `team_member_id` |

Unique on `(user_id, channel_id, message_ts)` — upsert key.

### Transformation Logic

- **Timestamp conversion**: `new Date(parseFloat(msg.ts) * 1000).toISOString()`, applied uniformly across every sync path.
- **Member matching**: email first (normalized-lowercase), then exact normalized-name match. **DMs with no matched member are dropped entirely** (`if (!memberId) continue`) — no logging of the skip.
- **Noise filtering**: DMs under 5 chars and channel messages under 10 chars are dropped; self-DMs skipped.
- **Channel-name normalization**: lowercased, leading `#` stripped, before matching against Slack's channel list.
- **Markdown → mrkdwn**: outbound briefs run through a dedicated `markdownToSlack()` (bold/italic/strikethrough conversion, since Slack doesn't support `#` headings).
- **Truncation for `chat.postMessage`**: briefs over 3800 chars are truncated by section, falling back to a hard slice + "...truncated" notice.
- **Live-fetch-then-cache pattern**: 1:1 prep does a *live* Slack fetch (fresher than the background sync) and fire-and-forget upserts the result into `cos_slack_messages`, falling back to the cached table only if the live fetch fails.

### Error Handling

- `oauth.v2.access` failure (`ok:false`) → HTTP 502 echoing Slack's `error` string — the only place Slack's actual error code surfaces to the caller.
- `slack-messages-sync`: every `slackApi()` result checked as `if (!res.ok || !Array.isArray(...)) continue/return` — errors like `invalid_auth`, `channel_not_found`, `missing_scope` are silently swallowed, not logged, and the function still reports success with `{synced: 0}`.
- `agent-command`/`agent-tick`'s DM-send path does check `ok` and surfaces the raw Slack `error` string to the user (e.g. "Couldn't open a DM... Slack error: not_in_channel").
- Live-fetch paths (`generate-1on1-prep`, `generate-dci-brief`) wrap Slack calls in explicitly non-fatal try/catch, pushing failures into an `errors[]` array rather than failing the whole prep/brief.
- `disconnect-slack`'s revoke call is fire-and-forget (`.catch(() => {})`).
- **No error-code branching anywhere** — `invalid_auth`, `channel_not_found`, `missing_scope`, `not_in_channel` are all handled by the same generic "skip" logic.

### Known Gotchas

- No refresh flow means a workspace-side revoke (app uninstalled, admin action) breaks sync silently — `last_sync_status` isn't updated to reflect it since the sync just returns empty results, not an auth error.
- **Pagination is capped, not iterated**: `users.list` at `limit=200` with no cursor follow-up; `conversations.list` at `limit=500` with no cursor handling. Workspaces past those caps have unresolved users/channels with no error surfaced.
- **History fetch limits are small**: 20 for DMs, 50 for channels, no cursor-based follow-up — older messages in the window are silently dropped.
- **Security gap**: `agent-slack-action` never verifies `SLACK_SIGNING_SECRET` against the incoming interactive payload, unlike its sibling `slack-add-suggestion` which does this correctly.
- **`ts` string precision**: the *raw string* `msg.ts`, not the parsed float, is used in the DB unique key — intentional, avoids float-precision collisions.
- **`slack-messages-sync` re-fetches `users.list` and `conversations.list` in full on every run** — no caching between invocations, compounding the "no pagination, no rate-limit handling" risk for large workspaces.
- **A prior cron misconfiguration meant `daily-prep-batch` (and therefore this Slack sync path) silently never ran in production** — an early pg_cron job built its URL/auth from unset Postgres GUCs; fixed by hardcoding the URL in a later migration.

### Code Reference

- `supabase/functions/exchange-slack-token/index.ts`
- `supabase/functions/disconnect-slack/index.ts`
- `supabase/functions/slack-messages-sync/index.ts`
- `supabase/functions/slack-add-suggestion/index.ts`
- `supabase/functions/agent-slack-action/index.ts`
- `supabase/functions/agent-command/index.ts`, `agent-tick/index.ts`
- `supabase/functions/generate-1on1-prep/index.ts`, `generate-dci-brief/index.ts`
- `supabase/migrations/20260612100000_slack_credentials.sql`, `20260612100100_slack_messages.sql`, `20260707000000_slack_sync_channels.sql`
- `src/components/cos/CosSlackSyncPanel.tsx`
- `src/hooks/useSlackChannelOptions.ts`

---

## Google Calendar

**System:** Google Calendar API v3, authenticated via Supabase Auth's built-in Google OAuth provider

### Purpose

Pulls upcoming events (14-day default window, up to 60) and converts them into **1:1 meeting placeholders** (`cos_one_on_one_events`) matched to `cos_team_members`, plus discovers recurring **group meetings** (`cos_group_meetings`). Powers the CoS "Meetings" tab: auto-detected upcoming 1:1s, computed meeting cadence per person, and unmatched-attendee surfacing for manual reconciliation.

### API Endpoint(s)

| Endpoint | Purpose |
|---|---|
| `POST https://oauth2.googleapis.com/token` (`grant_type=refresh_token`) | Refresh access token |
| `GET https://www.googleapis.com/calendar/v3/calendars/primary/events` (`timeMin`, `timeMax`, `singleEvents=true`, `orderBy=startTime`, `maxResults=250`, paginated) | List events |
| `GET https://www.googleapis.com/calendar/v3/calendars/primary/events/{recurringEventId}` | Fetch the recurring master event to read its RRULE for cadence |

### Authentication

- OAuth handled by **Supabase Auth's Google provider** (`supabase.auth.signInWithOAuth`), not a hand-rolled exchange. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are configured in `supabase/config.toml` and reused directly by the edge function for the manual refresh-token exchange.
- **Scope requested**: `openid email profile https://www.googleapis.com/auth/calendar.events.readonly` with `access_type: 'offline', prompt: 'consent'` — this is the *only* scope string in the codebase (see the [Gmail](#gmail) gotcha below).
- **Storage**: `user_calendar_credentials` (PK `user_id`) — `access_token`, `refresh_token` (NOT NULL), `scope`, `expires_at`, plus `auto_sync_enabled`, `auto_sync_morning_hour_utc`, `auto_sync_midday_hour_utc`. Client view `user_calendar_credentials_public` exposes only `connected`.
- **Initial token save**: `save-google-calendar-tokens` is called right after the OAuth redirect, using the Supabase session's `provider_token`/`provider_refresh_token`. It preserves the existing `refresh_token` if the new one is empty, since Google only issues a refresh token on first consent:
  ```ts
  if (!refreshTokenToWrite) {
    const { data: existing } = await supabase.from('user_calendar_credentials')
      .select('refresh_token').eq('user_id', userId).maybeSingle()
    refreshTokenToWrite = existing?.refresh_token ?? null
  }
  ```
- **Refresh logic**: 30-second-skew check before every sync, identical pattern to Zoom — refresh via `oauth2.googleapis.com/token`, persist new `access_token`/`expires_at`.
- **Dual invocation auth**: normal user JWT, or service-role key + `x-supabase-user-id` header for cron.

### Rate Limits

None. Pagination capped at `MAX_PAGES = 4` (max 1000 events/run). RRULE lookups for recurring masters capped at 30 series/run, with individual failures swallowed and falling back to interval inference. No handling of Google's 429/quota responses beyond the generic error path.

### Data Shape

`GoogleEvent` → `cos_one_on_one_events`:

| Google field | DB column |
|---|---|
| `event.id` | `google_event_id` |
| `event.recurringEventId` | `recurring_event_id` |
| `event.summary` | `title` |
| `event.start.dateTime` / `event.end.dateTime` | `start_time` / `end_time` |
| `event.attendees[]` (emails) | `attendee_emails text[]`, plus resolved single `attendee_name`/`attendee_email` |
| `event.status` | `status` |
| `event.location` / `event.description` | `location` / `description` |
| regex-extracted from location/description | `zoom_meeting_id` |
| resolved via `findMatchingMember()` | `team_member_id` |
| — | `inferred_category` (derived) |

Zoom meeting ID is pulled from free-text `location`/`description` via regex — **`conferenceData`/`hangoutLink` fields are never requested or read**:
```ts
function extractZoomMeetingId(text: string): string | null {
  const urlMatch = text.match(/zoom\.us\/j\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  const textMatch = text.match(/Meeting\s+ID[:\s]+(\d[\d\s]+\d)/)
  if (textMatch) return textMatch[1].replace(/\s+/g, '')
  return null
}
```

### Transformation Logic

**Member matching** (`matchEventToMember.ts`, shared between client and edge function as hand-duplicated files) — tiered pipeline, stops at first match:
1. Relationship-type filter (default `['direct_report', 'collaborator']`).
2. Exact email match (normalized-lowercase).
3. Exact full-name match.
4. First-name match — **only if unambiguous** across eligible members (a shared-first-name pair disables this tier entirely via a `null` sentinel).
5. Email local-part pattern match (`firstinitiallastname`, `firstnamelastname`, `first.last`, `f.last`) — again only when unambiguous.

A 1:1 is strictly "exactly one non-self attendee"; 2+ others routes into the separate group-meeting accumulator instead, which ignores the relationship-type filter (anyone tracked shows in the roster).

**Email auto-bootstrap**: a match via name/first-name/email-local (not exact email) with no email on file writes the discovered email back onto `cos_team_members.email` for future direct matching.

**Cadence computation**: prefers Google's authoritative RRULE (parsed for `FREQ`/`INTERVAL`) over inferring from observed gap-between-start-times when no RRULE is available.

**Category inference**: relationship type → display category, or cross-domain-attendee fallback to `'external'`.

### Error Handling

- **401** → `last_sync_status = 'error: unauthorized'`, returns 401.
- **Refresh failure** → `'error: refresh failed'`, returns 401.
- **Other non-2xx** → `error: {status}` with raw response body, returns 500.
- **Deliberate write-failure tracking** — a documented fix for a prior incident where a missing DB column silently rejected every upsert while `last_sync_status` still read `'ok'`:
  ```ts
  // Track DB write failures so we can surface them in last_sync_status rather
  // than silently reporting "ok" (a swallowed upsert error previously masked
  // missing-column schema drift, so no events ever synced while status read ok).
  ```
- Cron dispatcher (`calendar-sync-cron`) wraps each user in its own try/catch so one failure doesn't abort the batch.

### Known Gotchas

- **A previously-broken cron job**: the original `calendar-sync-hourly` pg_cron job built its request from unset Postgres GUCs, which resolved to `NULL` and violated a not-null constraint — sync never ran automatically until a later migration hardcoded the project URL.
- **No per-attendee RSVP filtering** — only the event-level `status` (confirmed/tentative/cancelled) is read; there's no filtering by individual attendee `responseStatus`.
- **Cancelled events still flow through matching** intentionally, "so callers can flip the row's status," rather than being dropped.
- **Soft-cancel window race**: events that fall outside a re-run's sync window (e.g. `days` was reduced) get soft-cancelled even if they weren't actually cancelled in Google — the diff logic can't distinguish "deleted" from "no longer in this window."
- **Timezone**: the sync window itself is built from server UTC math with no user-timezone awareness; only auto-sync scheduling hours have a UTC→local display helper.
- **Client/server duplicate files**: `src/lib/calendar/matchEventToMember.ts` and `supabase/functions/_shared/matchEventToMember.ts` are hand-copied, not shared via import — a fix to one without the other silently creates behavior drift.

### Code Reference

- `supabase/functions/google-calendar-sync/index.ts`
- `supabase/functions/calendar-sync-cron/index.ts`
- `supabase/functions/save-google-calendar-tokens/index.ts`
- `supabase/functions/disconnect-google-calendar/index.ts`
- `supabase/functions/_shared/matchEventToMember.ts` / `src/lib/calendar/matchEventToMember.ts`
- `src/lib/calendar/titleSources.ts`
- `supabase/migrations/20260605000000_calendar_integration.sql`, `20260622000000_calendar_auto_sync.sql`, `20260622000001_calendar_sync_cron.sql`, `20260623000001_add_recurring_event_id_to_cos_events.sql`, `20260623000002_fix_calendar_sync_cron.sql`
- `src/components/cos/CosCalendarSyncPanel.tsx`
- `src/pages/ChiefOfStaff.tsx`

---

## Gmail

**System:** Gmail API (read-only metadata), fetched inline — not a background sync

### Purpose

At 1:1-prep-generation time, live-queries Gmail for recent threads with the specific team member being prepped, to enrich the AI-generated brief with real email context (subject, sender, snippet). Opportunistically caches what it fetches into `cos_gmail_messages` for reuse. **There is no dedicated Gmail sync edge function** — it only runs synchronously inside `generate-1on1-prep`.

### API Endpoint(s)

```ts
const gmailFetch = (path: string) => fetch(`https://gmail.googleapis.com/gmail/v1/${path}`, {
  headers: { Authorization: `Bearer ${gmailToken}` },
}).then(r => r.json())

// messages.list
gmailFetch(`users/me/messages?q=${encodeURIComponent(`(from:${email} OR to:${email}) after:${after}`)}&maxResults=20`)

// messages.get (metadata only)
gmailFetch(`users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
```
Read-only — no draft/send/label endpoints used.

### Authentication

Reuses the same Google credentials row as Calendar (`user_calendar_credentials`) — there is no separate Gmail OAuth flow. **Critical gotcha**: the code checks whether the stored `scope` string happens to contain `gmail`/`mail.google.com`, but the app's own OAuth kickoff never requests a Gmail scope (see [Google Calendar](#google-calendar) auth section — only `calendar.events.readonly` is requested):
```ts
const hasGmailScope = googleCreds?.scope
  ? (googleCreds.scope as string).includes('gmail') || (googleCreds.scope as string).includes('mail.google.com')
  : false
```
This makes the Gmail feature effectively unreachable through the app's current connect flow unless a user's Google grant independently includes Gmail scope from elsewhere.

### Rate Limits

None. Message-detail fetches capped at 10 per prep run (`.slice(0, 10)`). No 429/backoff handling. The 20-preps-per-day application-level limit (shared with the whole `generate-1on1-prep` function) indirectly bounds Gmail call volume, but isn't Gmail-rate-limit-aware.

### Data Shape

`messages.get` (metadata) → `cos_gmail_messages`:

| Gmail field | DB column |
|---|---|
| `msg.id` | `gmail_message_id` |
| `threadId` | `thread_id` |
| `Subject` header | `subject` |
| `snippet` (truncated to 500 chars) | `snippet` |
| parsed from `From` header (`<email>` / name-before-`<`) | `sender_email` / `sender_name` |
| computed | `is_from_member` |
| `Date` header | `message_date` |

Full message bodies are never fetched — only Gmail's own truncated `snippet` plus three metadata headers.

### Transformation Logic

- **Sender parsing** via regex against the raw `From` header:
  ```ts
  const emailMatch = from.match(/<([^>]+)>/)
  const senderEmail = emailMatch ? emailMatch[1] : from.trim()
  const nameMatch = from.match(/^([^<]+)</)
  const senderName = nameMatch ? nameMatch[1].trim().replace(/^"|"$/g, '') : senderEmail
  ```
- **Query construction**: `(from:{email} OR to:{email}) after:{date}` — scoped strictly to the one team member's email address for the relevant lookback window.
- **Cache-then-live pattern**: fetches live from Gmail first (fresher), fire-and-forget upserts into `cos_gmail_messages`, and falls back to the cached table only on live-fetch failure.

### Error Handling

Fully non-fatal / best-effort at every level:
```ts
} catch (gmailLiveFetchErr) {
  console.warn('Live Gmail fetch failed (non-fatal):', (gmailLiveFetchErr as Error).message)
}
```
Individual message-detail failures inside the fetch loop are silently skipped; the cache upsert is fire-and-forget (`.then(() => {}).catch(() => {})`). No error is ever surfaced to the user — a failure just silently falls back to a possibly empty/stale cache.

### Known Gotchas

- **The headline gotcha**: Gmail scope is never actually requested by the OAuth flow, so this feature is dead code in the current connect flow — worth fixing first if reviving/extending Gmail enrichment.
- Shares its credentials row with Calendar, so there's no independent "Gmail connected" state to check or surface — it silently depends on a scope grant the app doesn't ask for.
- No dedicated sync/cron trigger; only runs inline during prep generation, so Gmail data is never pre-warmed — every prep-gen call pays the live-fetch latency (or silently gets nothing).

### Code Reference

- `supabase/functions/generate-1on1-prep/index.ts` (Gmail fetch logic is inline in this file — no separate module)
- `supabase/migrations/20260709000000_gmail_integration_and_tool_tiers.sql` (creates `cos_gmail_messages` + `cos_prep_schedule.tool_tiers`)
- `src/lib/prepTools.ts` (Gmail tool-tier/label metadata)

---

## StackOne

**System:** StackOne unified API (`https://api.stackone.com`) — a single contract fanning out to 200+ HRIS/CRM/ticketing connectors (BambooHR, Workday, Salesforce, HubSpot, Jira, etc.)

### Purpose

Enriches 1:1 prep briefs with organizational-context signal from whatever HRIS/CRM/ticketing systems a user has linked: role/manager/time-off from HRIS, open tickets from ticketing tools, deal activity from CRM — scoped to the specific person the 1:1 is with, by email.

### API Endpoint(s)

| Endpoint | Purpose |
|---|---|
| `GET /accounts` | List linked accounts; also used to validate an API key at save-time |
| `POST /connect_sessions` (body: `origin_owner_id`, `origin_owner_name`, `categories`) | Create an embedded StackOne Connect Hub session for linking a new connector |
| `GET /connector_profiles` | List connector profiles configured for the org |
| `GET /unified/hris/employees?filter[email]={email}` | Employee lookup |
| `GET /unified/hris/employees/{id}/time_off?filter[status]=approved&page_size=5` | Time-off lookup |
| `GET /unified/ticketing/tickets?filter[assignee_email]={email}&filter[status]=open&page_size=10` | Open tickets |
| `GET /unified/crm/contacts?filter[email]={email}&page_size=1` | Contact lookup |
| `GET /unified/crm/contacts/{id}/deals?page_size=5` | Deals for a contact |

### Authentication

- **HTTP Basic auth**, API key as username, empty password: `Authorization: Basic ${btoa(apiKey + ':')}`.
- Unified-API calls additionally require an `x-account-id` header identifying which linked connector account to query.
- **Storage**: `cos_mcp_integrations` (`integration_key='stackone'`), `auth_value` column — **plaintext**, not application-encrypted, protected only by RLS (`auth.uid() = user_id`) and service-role-only server access. A type comment claims it's "encrypted... never sent to client after save," which is misleading — it's access-controlled, not encrypted.
- **Account linking flow** (`StackOnePanel.tsx` → `stackone-proxy` edge function, a StackOne-specific flow, distinct from the generic `McpIntegrationPanel`/`test-mcp-integration` pair used by ClearGo):
  1. User pastes an API key → `stackone-proxy` validates it via `GET /accounts` → upserts into `cos_mcp_integrations` with `is_connected: true`.
  2. Linking an individual SaaS connector uses StackOne's own embedded **Connect Hub** widget (`@stackone/hub`, dynamically imported), which handles that provider's OAuth/credential flow entirely on StackOne's side — the app just re-fetches the account list on success.
  3. Disconnect nulls `auth_value` and flips `is_connected: false`; nothing is revoked on StackOne's side.

### Rate Limits

None — no retry/backoff anywhere. Every fetch uses an 8-second `AbortSignal.timeout` (10s in `stackone-proxy`, a minor inconsistency). A timeout or any thrown error is swallowed identically to a real "no data" result (see Error Handling).

### Data Shape

**HRIS employee** → prep text:
```
HRIS data (BambooHR):
  Role: Senior Engineer, Platform
  Manager: Jane Smith
  Start date: 2022-03-01
  Status: active
  Location: Austin, TX
  Upcoming/recent time off:
    - PTO: 2026-07-10 to 2026-07-14
```
**Ticketing** → `Open tickets/tasks (Jira): - Fix login redirect bug (open, high)`
**CRM** → `CRM activity (Salesforce): - Acme Corp Renewal (negotiation, $45,000)`

None of this is persisted to a table — it's fetched live per prep-generation call and formatted directly into prompt text (`sections: string[]`), plus a coarse `sourcesUsed: ['stackone']` flag.

### Transformation Logic

- **`categorizeProvider()`** normalizes the provider string and checks it against three hardcoded `Set`s (`HRIS_PROVIDERS`, `TICKETING_PROVIDERS`, `CRM_PROVIDERS`, ~40 providers total). Unknown providers get tried against **both** HRIS and ticketing fetchers in parallel (never CRM).
- **`safeFetch()`** wraps every call: returns `null` on any thrown error (network, timeout) or non-2xx, and unwraps `json.data ?? json` to normalize StackOne's inconsistent envelope shape.
- **`Promise.allSettled`** across all account×category fetch tasks so one account's failure doesn't cancel the others.
- **A separate, near-duplicate categorization heuristic exists in the frontend** (`StackOnePanel.tsx`'s `guessCategory()`) for UI badges — its provider set differs slightly from the backend's, a maintenance hazard.

### Error Handling

**`safeFetch()` swallows every failure mode identically** — network errors, timeouts, non-2xx, and JSON parse errors all return `null`, indistinguishable from "no data found for this person." There is no `console.warn` even inside `safeFetch` itself; the only logging is one level up, in the caller, and only fires if something throws *outside* `safeFetch` (e.g. inside `getStackOneConfig`, which has the same silent-null pattern anyway). **Practical implication**: an expired API key, a StackOne outage, a provider rate limit, and a genuine "employee not found" are all invisible from the outside — debugging requires manually calling the API with the stored key.

### Known Gotchas

Verbatim field-name fallback chains, evidence of real cross-provider inconsistency:
```ts
const title = emp.job_title ?? emp.title ?? ''
if (emp.hire_date || emp.start_date) { ... emp.hire_date ?? emp.start_date }
const mgr = typeof emp.manager === 'string' ? emp.manager : (emp.manager?.name ?? emp.manager?.display_name ?? '')
const loc = emp.work_location ?? emp.location
const locStr = typeof loc === 'string' ? loc : (loc?.name ?? loc?.city ?? '')
const title = t.title ?? t.summary ?? t.name ?? 'Untitled'          // ticketing
const name = d.name ?? d.title ?? 'Untitled deal'                     // CRM
const stage = d.stage ?? d.status ?? ''                               // CRM
```
- **Static provider list won't track StackOne's catalog** — StackOne supports 200+ connectors; only ~40 are hardcoded here. A new or renamed provider falls through to `'unknown'` handling, which never tries CRM — a renamed CRM provider would silently stop returning CRM data with zero error signal.
- **No app-level encryption on the stored API key** despite a comment implying otherwise.

### Code Reference

- `supabase/functions/_shared/stackone.ts`
- `supabase/functions/stackone-proxy/index.ts`
- `supabase/functions/generate-1on1-prep/index.ts` (primary consumer, gated per-tool by a tier system)
- `supabase/functions/recommend-prep-tools/index.ts` (secondary consumer — connection-liveness check only)
- `src/components/cos/StackOnePanel.tsx`
- `src/types/mcp-integration.ts`
- `supabase/migrations/20260613000000_mcp_integrations.sql`

---

## ClearGo

**System:** ClearGo — a first-party "AI chief-of-staff" API, user-configured base URL + API key (not a fixed SaaS endpoint)

### Purpose

Supplies 1:1 prep packs, open blockers, and epics for a manager's direct reports, used both in individual 1:1 prep and in the team-wide Daily Check-In (DCI) brief (blockers/epics rolled up across all reports). Treated as a **tier-1 ("primary signal")** data source, same priority tier as Zoom/Slack/Gmail — unlike StackOne, which defaults to tier 2.

Backend consumption (`_shared/cleargo.ts`, called from `generate-1on1-prep` and `generate-dci-brief`) is fully implemented and live. The settings UI to connect it also already exists, end-to-end — it's the **generic** MCP-integration surface (`McpIntegrationPanel.tsx` + `test-mcp-integration` edge function) driven by ClearGo's entry in `INTEGRATION_PRESETS`, reached via a "ClearGo" item in the Settings sidebar under **Integrations**. (An earlier pass at this documentation incorrectly stated no settings UI existed for ClearGo — that was a research gap that missed the generic panel and its nav wiring, not a real gap in the app. It has since been corrected here.)

### API Endpoint(s)

Declared in `INTEGRATION_PRESETS[0].endpoints` (`src/types/mcp-integration.ts`) and, except for the last one, all actually called from `supabase/functions/_shared/cleargo.ts`:

| Endpoint | Called from |
|---|---|
| `GET /api/v1/team-members` | DCI context + 1:1 context (resolves a person's ClearGo ID by email/name match) |
| `GET /api/v1/1on1-prep/:person_id` | 1:1 context only |
| `GET /api/v1/team-members/:id/epics` | Both (capped to first 10 members for DCI) |
| `GET /api/v1/team-members/:id/blockers` | Both (capped to first 20 members for DCI) |
| `GET /api/v1/epics/:id` | **Declared in the preset, never called anywhere** — aspirational/unused |
| `GET {test_endpoint}` (defaults to `/api/v1/team-members`) | `test-mcp-integration` edge function, used by the settings panel's "Connect & test" / "Test again" actions |

### Authentication

- **api-key type**, header `X-ClearGo-Key`. The declared `envVarHint: 'CLEARGO_AI_API_KEY'` is UI-only guidance — the real key is read per-user from the database, not from `Deno.env`.
- **Storage**: shared `cos_mcp_integrations` table (`integration_key='cleargo'`, `base_url` + `auth_value` columns) — same plaintext-in-RLS-protected-column caveat as StackOne. No application-level encryption despite a type comment implying otherwise.
- **Settings UI flow** (generic, reused from `INTEGRATION_PRESETS`, not ClearGo-specific code):
  1. Settings sidebar → **Integrations → ClearGo** (`settings-navbar.tsx`, id `integration-cleargo`) routes to the generic `activeSection.startsWith("integration-")` branch in `Settings.tsx`, which resolves the preset via `getPreset('cleargo')` and renders `<McpIntegrationPanel preset={preset} />`.
  2. The panel shows a Base URL field and an `X-ClearGo-Key` field; "Connect & test" calls the `test-mcp-integration` edge function, which pings `{base_url}/api/v1/team-members` with the supplied key and, on success, upserts `cos_mcp_integrations` with `is_connected: true`.
  3. "Disconnect" calls the same edge function with `{action: 'disconnect'}`, nulling `auth_value` and flipping `is_connected: false`. Nothing is revoked on ClearGo's side (there's no revoke endpoint to call).
- **Bug found and fixed in this session**: `test-mcp-integration` never re-receives the API key on "Test again" (the client intentionally never gets a saved key back, per `McpIntegrationPanel.tsx`'s comment `// Don't populate authValue — we never send it back to the client after save`), but the edge function was unconditionally writing `auth_value: auth_value || null` on every test — so re-testing an already-connected integration with an empty key field sent an unauthenticated ping (which fails) and then **nulled out the previously-working key**, silently disconnecting it. Fixed by having the function fall back to the currently-stored `auth_value` whenever the request doesn't include a new one, both for the outbound test request and for what gets persisted. This affects any preset using the generic panel (currently just ClearGo), not something specific to ClearGo's API shape.

### Rate Limits

None — structurally identical to StackOne: no retry/backoff, calls wrapped in the same `safeFetch()`-style null-swallowing pattern. `test-mcp-integration` uses a 10-second `AbortSignal.timeout`.

### Data Shape

Same shape-normalization pattern as StackOne's fallback chains, e.g. (from `cleargo.ts`):
```ts
b.title ?? b.name ?? b.description ?? 'Untitled blocker'
```
suggesting the author anticipated field inconsistency even for a single first-party API — likely defensive coding rather than an observed real mismatch (ClearGo is presumably one system, not 40+ like StackOne's fan-out).

### Transformation Logic

- **Person resolution**: `/api/v1/team-members` list is searched by matching the prepped person's email or name against ClearGo's own team-member records, before chaining into `/1on1-prep/{found.id}`.
- **DCI batching**: rolls up blockers (first 20 members) and epics (first 10 members) across the whole team for the daily brief, versus person-scoped lookups for 1:1 prep.

### Error Handling

Same non-fatal pattern used everywhere else in this codebase:
```ts
// generate-1on1-prep/index.ts
} catch (err) {
  console.warn('ClearGo enrichment failed (non-fatal):', err)
}
```
`generate-dci-brief` instead pushes ClearGo failures into a reported `errors[]` array rather than only logging. Underlying HTTP-level failures inside `cleargo.ts` are swallowed the same way as StackOne's `safeFetch` — no visibility into *why* a call failed.

### Known Gotchas

- The declared `/api/v1/epics/:id` endpoint is dead in practice — don't rely on it existing end-to-end without adding a caller.
- There's no way to edit the Base URL or rotate the API key for an already-connected integration through the panel — the "Connected" view only offers "Test again" / "Disconnect," so rotating a key requires disconnecting and reconnecting from scratch.
- The generic panel's icon/label/endpoint metadata all come from one static preset object (`INTEGRATION_PRESETS[0]` in `mcp-integration.ts`) — adding a second api-key-based integration means adding a new preset entry plus a `settings-navbar.tsx` nav item, not writing a new panel.
- The now-fixed "Test again wipes the key" bug (see Authentication) would have made ClearGo look intermittently broken/disconnected without any code change on the user's part — worth knowing if debugging similar-looking reports for future presets built on this same generic panel.

### Code Reference

- `supabase/functions/_shared/cleargo.ts`
- `supabase/functions/generate-1on1-prep/index.ts` (tier-1 consumer)
- `supabase/functions/generate-dci-brief/index.ts` (DCI/team-wide consumer)
- `src/types/mcp-integration.ts` (preset registry — `INTEGRATION_PRESETS`)
- `src/components/cos/McpIntegrationPanel.tsx` (generic settings-UI panel used by the ClearGo nav entry)
- `src/components/ui/settings-navbar.tsx` (nav item `integration-cleargo`)
- `src/pages/Settings.tsx` (generic `integration-*` route, resolves preset + renders the panel)
- `supabase/functions/test-mcp-integration/index.ts` (connect/test/disconnect edge function; credential-preservation fix applied here)
- `supabase/migrations/20260613000000_mcp_integrations.sql` (shared `cos_mcp_integrations` table)

---

## Best Practices: Surfacing Credential Problems to Users

### The Problem

Every OAuth integration (Zoom, Slack, Google) runs silently. When credentials are missing or expired, agent-tick and all sync functions return early with a `skipped: no_credentials` or similar response — they do not write any error to a user-visible surface. A user who has the agent enabled but hasn't connected an integration will simply never see the output that integration produces, with no explanation.

Discovered in production: `user_calendar_credentials` was empty across all 321 users. `gmail-inbox-sync` was firing on every tick, completing in ~300ms, and returning `skipped: no_google_credentials` — silently. No user-facing signal of any kind.

### The Rule

**If an integration is expected to run for a user but credentials are missing or broken, the UI must say so explicitly.** Silence is not acceptable. Users will not navigate to Settings to investigate — they will conclude the feature is broken or doesn't work for them.

### Implementation Pattern

All credential health is consolidated into a single hook: `src/hooks/useIntegrationHealth.ts`. It fetches the three `_public` credential views in parallel:

```ts
const [googleRes, slackRes, zoomRes] = await Promise.all([
  db.from('user_calendar_credentials_public').select('connected, scope').maybeSingle(),
  db.from('user_slack_credentials_public').select('connected').maybeSingle(),
  db.from('user_zoom_credentials_public').select('connected, last_sync_status').maybeSingle(),
]);
```

It returns a typed `IntegrationHealth` object with per-integration booleans — including nuanced states like `gmailScopeGranted` (connected but missing the `gmail.readonly` scope) and `zoomReauthRequired` (`last_sync_status = 'error: reauth_required'`).

**Do not duplicate credential fetches in individual components.** Use this hook everywhere.

### Where to Surface Warnings

Two surfaces:

1. **Agent Settings panel** (`src/components/cos/AgentSettingsPanel.tsx`) — in the "Activation" group, one amber card per broken integration, styled identically to the existing Slack card. Each card shows a label, a badge (`Not connected` or `Reconnect required`), a one-line explanation of what is missing, and a CTA button that navigates to the relevant settings section via `onNavigateToSection`. Sections: `'calendar-sync'` for Google/Gmail, `'slack-sync'` for Slack, `'zoom-sync'` for Zoom.

2. **Inbox Suggestions panel** (`src/components/inbox/InboxSuggestionsPanel.tsx`) — when the agent is enabled but all suggestion sources have missing credentials, the panel shows a single amber hint instead of returning `null`. This replaces the prior behavior where an enabled-but-misconfigured agent produced a completely empty panel with no explanation.

### Credential States to Check Per Integration

| Integration | Connected check | Broken/degraded state |
|---|---|---|
| Google Calendar | `user_calendar_credentials_public.connected` | No row / `connected = false` |
| Gmail | Same row + `scope` contains `gmail.readonly` | Connected but scope missing (common if user connected before gmail scope was added to the OAuth request) |
| Slack | `user_slack_credentials_public.connected` | No row / `connected = false` (no token expiry — Slack tokens don't expire, but workspace revoke goes undetected) |
| Zoom | `user_zoom_credentials_public.connected` | No row / `connected = false`; separately, `last_sync_status = 'error: reauth_required'` means a token rotation failed and the user must reconnect |

StackOne and ClearGo (`cos_mcp_integrations`) are opt-in enrichment connectors — users who haven't connected them have made an explicit choice, not a mistake. Don't surface warnings for them.

### When to Extend This

Any new OAuth-backed integration whose absence would silently degrade a feature the user has turned on must:
1. Add its `_public` view field(s) to `useIntegrationHealth`.
2. Add an amber warning card in `AgentSettingsPanel`'s Activation group.
3. If it feeds the inbox suggestions pipeline, include it in `InboxSuggestionsPanel`'s missing-integration check.

Integrations that only enrich prep (not the always-on agent pipeline) may skip step 3.
