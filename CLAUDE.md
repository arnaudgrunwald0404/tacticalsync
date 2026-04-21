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

Key tables: `rc_cycles`, `rc_defining_objectives`, `rc_strategic_initiatives`, `rc_do_metrics`, `rc_checkins`, `rc_links`, `rc_tasks`. All rows are scoped to a team via `team_id`. RLS policies enforce access control.

Database migrations are in `supabase/migrations/` (80+ files, timestamp-named). All schema changes require a new migration file.

### Design System
Design tokens and layout patterns are documented in `src/design-system/`. The `LAYOUT_PATTERNS.md` and `DESIGN_SYSTEM.md` files define component patterns used across detail pages. Shared detail page structure uses `DetailPageHeader` + `DetailPageNavigation` components.

### Session & Auth
`useSessionManager.ts` handles 30-minute idle timeout and token refresh. Auth uses Supabase OAuth with PKCE flow.

## Environment Setup

```bash
cp .env.example .env.local
cp .env.test.example .env.test
npm ci
supabase start
npm run db:validate
```

Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. E2E tests also need `SUPABASE_SERVICE_ROLE_KEY` and `PLAYWRIGHT_BASE_URL`.
