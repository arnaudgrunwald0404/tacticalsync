# Team Tactical Slack Bot (Socket Mode)

Minimal Slack app using Bolt (Socket Mode) with:
- Slash commands: `/checkin`, `/ask`
- Events: `app_mention`, direct messages
- Optional scheduler for recurring posts (node-cron)
- Supabase integration to persist check-ins (mirrors Tactical Sync UI)

## Prerequisites
- Slack app created with Socket Mode enabled
- App-level token with scope: `connections:write` (xapp-...)
- Bot token (xoxb-...)
- Signing secret
- Install the app to your workspace
- OAuth scopes: `commands`, `chat:write`, `app_mentions:read`, `users:read.email`
- Supabase URL and Service Role key available to the bot

## Env
Copy `.env.example` to `.env` and fill values:

```
cp .env.example .env
```

Required:
- `SLACK_APP_TOKEN`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`

Optional:
- `SLACK_DEFAULT_CHANNEL_ID` or `SLACK_TEST_CHANNEL_ID`
- `SLACK_SCHEDULE_CRON`, `SLACK_SCHEDULE_TEXT`, `SLACK_SCHEDULE_DM_USER_ID`
- `TZ` timezone for scheduler

## Install & Run

```
npm i
npm run dev
```

- Use `/checkin` to open a modal and submit.
  - The form mirrors Tactical Sync; optionally check “Share to Slack channel” to post the full check-in after saving.
- Use `/ask` to test the agent stub.
- Mention the bot in a channel to see a reply thread.

## Scheduling
- Enable by setting `SLACK_SCHEDULE_CRON` (e.g., `0 9 * * 1-5`)
- Posts to `SLACK_DEFAULT_CHANNEL_ID` (fallback: `SLACK_TEST_CHANNEL_ID`)
- Optional DM to a user via `SLACK_SCHEDULE_DM_USER_ID` (must be a Slack user ID starting with `U`)

## Notes
- This uses Socket Mode; no public HTTP endpoints required.
- Consider external schedulers/queues for production reliability.
