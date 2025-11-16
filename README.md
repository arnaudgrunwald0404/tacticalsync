# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/cbb48445-5b62-456b-b501-d3fa1a57caf7

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/cbb48445-5b62-456b-b501-d3fa1a57caf7) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## RCDO Module — Rallying Cry & Defining Objectives

**TacticalSync** now includes a strategic alignment module that connects high-level organizational goals with weekly tactical execution.

### Overview

The RCDO module adds an alignment layer above recurring meetings, helping teams define:
- **Rallying Cry**: What's most important right now (single focus per cycle)
- **Defining Objectives (DOs)**: 4-6 crisp, outcome-focused objectives
- **Strategic Initiatives**: Concrete projects that drive the DOs
- **Metrics**: Leading and lagging indicators (manual entry only at launch)

### Key Features

**Time-Boxed Cycles**
- Six-month cadence only (Jan-Jun, Jul-Dec)
- One active cycle per organization
- Lifecycle: Draft → Active → Review → Archived

**Ownership & Accountability**
- Every DO and Strategic Initiative requires exactly one owner
- Weekly check-ins with metric updates
- Health scoring (on-track, at-risk, off-track)
- Confidence tracking (owner-set percentage)

**Integration with Meetings**
- Link meeting priorities to Defining Objectives
- Spawn action items from initiatives
- Track execution alignment through `rc_links` table

**Permissions**
- Viewers: Read-only access
- Cycle Owners: Create/edit/lock Rallying Cry and DOs
- DO Owners: Edit their DO, metrics, initiatives, check-ins (until locked)
- Admins/Super Admins: Override and audit access

### Data Model

New tables under `rc_*` namespace:
- `rc_cycles`: Time-boxed periods (6-month cadence)
- `rc_rallying_cries`: Single focus statement per cycle
- `rc_defining_objectives`: 4-6 objectives with owners, metrics, health status
- `rc_do_metrics`: Leading/lagging metrics (manual entry)
- `rc_strategic_initiatives`: Projects driving DOs
- `rc_checkins`: Weekly updates from owners
- `rc_links`: Connects execution artifacts to strategy

### Core Workflows

1. **Create Cycle**: Admin sets up six-month period
2. **Draft Strategy**: Create Rallying Cry, DOs, Initiatives (draft status)
3. **Review & Commit**: Validate guardrails (owners, metrics) before activation
4. **Lock**: Freeze scope; locked items require admin approval to change
5. **Link Execution**: Associate meeting priorities/action items to DOs
6. **Weekly Check-ins**: Owners update metrics; system recalculates health
7. **Mid-cycle Review**: Snapshot progress, adjust scope if needed
8. **End-cycle Retro**: Archive and prepare for next cycle

### AI Capabilities (Phased)

**Phase 0 - Assistive** (Now)
- Rallying Cry Drafter: Proposes 3-5 draft RCs
- Defining Objective Shaper: Suggests 4-6 DOs with hypotheses
- Metric Designer: Suggests leading/lagging metrics
- Commit Readiness Check: Validates guardrails
- Link Suggestions: Maps priorities to DOs
- Hygiene Flags: Detects stale metrics, idle initiatives

**Phase 1 - Synthesis** (Future)
- Status Synthesizer: Executive summaries
- Change Scribe: Audit trail generation

**Phase 2 - Messaging** (Optional)
- Weekly digest via Slack/Email
- Owner-priority alignment nudges

### Database Setup

The RCDO module tables and RLS policies are defined in:
- `supabase/migrations/20251112000000_create_rcdo_tables.sql`
- `supabase/migrations/20251112000001_rcdo_rls_policies.sql`

### TypeScript Types

RCDO types are available in:
- `src/types/rcdo.ts`

For complete specifications, see `tactical_sync_prd_rcdo_module_added.md`.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/cbb48445-5b62-456b-b501-d3fa1a57caf7) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
