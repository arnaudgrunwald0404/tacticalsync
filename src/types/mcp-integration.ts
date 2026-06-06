// ── MCP Integration Registry ─────────────────────────────────────────────────
//
// Generic system for registering external API integrations as MCP servers.
// Each integration is defined by a static preset (IntegrationPreset) and
// persisted per-user connection state (McpIntegrationRow).

import type { LucideIcon } from 'lucide-react';

// ── Static preset: defines an available integration ──────────────────────────

export interface IntegrationEndpoint {
  /** Display name, e.g. "1:1 Prep" */
  label: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Path template, e.g. "/api/v1/1on1-prep/:person_id" */
  path: string;
  /** Brief description of what this endpoint returns */
  description: string;
}

export interface IntegrationPreset {
  /** Unique key, e.g. "cleargo" */
  key: string;
  /** Display name, e.g. "ClearGo" */
  name: string;
  /** Short description shown in the integration card */
  description: string;
  /** Lucide icon component name (resolved at render time) */
  iconName: string;
  /** Category for grouping: "1-1s", "project-management", etc. */
  category: string;
  /** Auth mechanism */
  auth: {
    type: 'api-key' | 'bearer' | 'oauth';
    /** Name of the header, e.g. "X-ClearGo-Key" */
    headerName?: string;
    /** Env var hint shown to the user, e.g. "CLEARGO_AI_API_KEY" */
    envVarHint?: string;
  };
  /** Default base URL (user can override) */
  defaultBaseUrl?: string;
  /** Endpoint the panel pings to verify connectivity */
  testEndpoint?: string;
  /** Key endpoints this integration exposes — shown in the UI for context */
  endpoints?: IntegrationEndpoint[];
  /** Link to external documentation */
  docsUrl?: string;
}

// ── Database row: per-user connection state ──────────────────────────────────

export interface McpIntegrationRow {
  id: string;
  user_id: string;
  integration_key: string;
  base_url: string;
  /** Encrypted/stored server-side; never sent to client after save */
  auth_value: string | null;
  is_connected: boolean;
  last_test_at: string | null;
  last_test_status: 'ok' | 'error' | null;
  last_test_error: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Presets registry ─────────────────────────────────────────────────────────

export const INTEGRATION_PRESETS: IntegrationPreset[] = [
  {
    key: 'cleargo',
    name: 'ClearGo',
    description: 'AI chief-of-staff API — 1:1 prep packs, blockers, and launch readiness across your direct reports.',
    iconName: 'Briefcase',
    category: '1-1s',
    auth: {
      type: 'api-key',
      headerName: 'X-ClearGo-Key',
      envVarHint: 'CLEARGO_AI_API_KEY',
    },
    defaultBaseUrl: '',
    testEndpoint: '/api/v1/team-members',
    endpoints: [
      { label: 'Team members',  method: 'GET', path: '/api/v1/team-members',              description: 'List direct reports with health snapshot' },
      { label: '1:1 Prep',      method: 'GET', path: '/api/v1/1on1-prep/:person_id',      description: 'Structured prep doc with talking points' },
      { label: 'Epics',         method: 'GET', path: '/api/v1/team-members/:id/epics',     description: 'Epics owned by a team member' },
      { label: 'Blockers',      method: 'GET', path: '/api/v1/team-members/:id/blockers',  description: 'Open blockers with escalation flags' },
      { label: 'Epic detail',   method: 'GET', path: '/api/v1/epics/:id',                  description: 'Full epic with milestones and criteria' },
    ],
    docsUrl: undefined,
  },
];

export function getPreset(key: string): IntegrationPreset | undefined {
  return INTEGRATION_PRESETS.find(p => p.key === key);
}
