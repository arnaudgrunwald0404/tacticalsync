# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start dev server (port 8080)
npm run build            # Production build
npm run lint             # ESLint

# Testing
npm run test             # Vitest unit tests (watch mode)
npm run test -- src/test/some.test.ts --run   # Single test file
npm run test -- --grep "pattern" --run        # Filter by name
npm run test:e2e                              # Playwright e2e
npm run test:e2e:headed -- e2e/rcdo/some.spec.ts  # Single e2e test

# Database
npm run db:validate      # Validate migrations
npm run db:health        # Check database health
npm run db:reset         # Reset local DB (destructive)
```

## Architecture

**Team Tactical Sync** is a React/TypeScript SaaS for team meeting management and strategic planning, built around the **RCDO module** (Rallying Cry & Defining Objectives).

### Stack
- **Frontend:** React 18 + Vite, React Router v6 (lazy-loaded routes)
- **Styling:** Tailwind CSS + shadcn/ui (Radix UI primitives)
- **Server state:** TanStack React Query — no Redux/Zustand
- **Backend:** Supabase (PostgreSQL + RLS + Realtime)
- **Forms:** React Hook Form + Zod
- **Rich text:** TipTap; **Collaboration:** Yjs + y-websocket
- **Animations:** Framer Motion

### Data Flow Pattern
Custom hooks in `src/hooks/` encapsulate all data fetching. The primary RCDO hook is `useRCDO.ts`, which contains many specialized sub-hooks (useActiveCycle, useDODetails, useRCLinks, etc.). Components never query Supabase directly — always through hooks. Realtime subscriptions live in `useRealtimeSubscription.ts` and `useRCDORealtime.ts`.

### Routing (`src/App.tsx`)
- `/rcdo/detail/do/:doId` — Defining Objective detail
- `/rcdo/detail/si/:siId` — Strategic Initiative detail
- `/rcdo/canvas` — Strategy canvas
- `/my-meetings`, `/dashboard/rcdo`, `/workspace` — tab views in DashboardWithTabs
- All page components are lazy-loaded for code splitting

### RCDO Domain Model
Core cycle: **Create cycle → Draft strategy → Review → Lock → Link execution → Checkins → Review → Archive**

Key tables: `rc_cycles`, `rc_defining_objectives`, `rc_strategic_initiatives`, `rc_do_metrics`, `rc_checkins`, `rc_links`, `rc_tasks`. RCDO is **company-wide**, not team-scoped: `20251112100000_make_rcdo_company_wide.sql` dropped `rc_cycles.team_id`'s FK/NOT NULL constraint (kept only for backward compatibility) and rewrote RLS to gate on `owner_user_id`/`created_by`/admin flags instead. RLS policies enforce access control.

Database migrations are in `supabase/migrations/` (220+ files, timestamp-named). All schema changes require a new migration file.

### Design System
Design tokens and layout patterns are documented in `src/design-system/`. The `LAYOUT_PATTERNS.md` and `DESIGN_SYSTEM.md` files define component patterns used across detail pages. Shared detail page structure uses `DetailPageHeader` + `DetailPageNavigation` components.

### Date Handling
**Always use `parseLocalDate()` from `@/lib/dateUtils` when displaying date-only strings (YYYY-MM-DD) from the database.** Never use `new Date("2025-07-01")` directly — it parses as UTC midnight, which shifts to the previous day in western timezones. `parseLocalDate` appends `T00:00:00` to force local-time parsing.

### Session & Auth
`useSessionManager.ts` polls every minute and silently refreshes the Supabase session when it's within 5 minutes of token expiry — there is no idle-based timeout/logout. Auth uses Supabase OAuth with PKCE flow.

## Environment Setup

```bash
cp .env.example .env.local
cp .env.test.example .env.test
npm ci
supabase start
npm run db:validate
```

Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. E2E tests also need `SUPABASE_SERVICE_ROLE_KEY` and `PLAYWRIGHT_BASE_URL`.

## Parallel Sessions

This repo is worked on by multiple concurrent Claude Code sessions. A shared working directory has exactly one checked-out branch at a time — two sessions switching branches, rebasing, or committing in the same checkout race each other and can corrupt state or silently deploy stale code (this has already happened once: a mid-deploy rebase from another session caused an edge function to ship without that session's in-flight fix, caught only by re-diffing the deployed bundle against disk).

**Always work in a git worktree (`.claude/worktrees/`) when starting a new session or task here, unless you're a short-lived agent that only reads files.** Use the `EnterWorktree` tool at the start of the session. Each worktree gets its own branch and working tree, so concurrent sessions stop fighting over `HEAD`.

`.env.local` and `.env.test` are gitignored, so a fresh worktree starts without them — copy both over from the main checkout's root (`cp /Users/arnaudgrunwald/AGcodework/team-tactical-sync/.env.local .` and same for `.env.test`) before running tests or the dev server, or Vitest fails every test that touches the Supabase client with "Missing VITE_SUPABASE_URL".
