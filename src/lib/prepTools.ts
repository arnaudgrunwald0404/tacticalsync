// Pure, dependency-free helpers for the prep toolset and meeting-inclusion model.
// No Supabase import, so they're shared across UI + unit-testable (mirrors
// src/lib/prepScheduleTime.ts).

export interface PrepToolDef {
  id: string;
  label: string;
  description: string;
  defaultTier: 1 | 2 | 3;
  /** True = "Default — all meetings" (direct comms), false = per-person workflow tool. */
  isCore: boolean;
}

/** Always-on tools that don't require StackOne. */
export const STATIC_TOOLS: PrepToolDef[] = [
  { id: 'zoom',  label: 'Zoom',  description: 'Recent recordings, transcripts & AI summaries', defaultTier: 1, isCore: true },
  { id: 'slack', label: 'Slack', description: 'Recent DMs and channel messages',               defaultTier: 1, isCore: true },
];

/**
 * Metadata for known StackOne providers.
 * The UI derives the available tool list from live accounts via buildStackOneTools();
 * this catalog supplies labels, descriptions, and tier defaults for recognized providers.
 * Unknown providers fall back to a generic tier-2 non-core entry.
 */
export const STACKONE_PROVIDER_CATALOG: Record<string, Omit<PrepToolDef, 'id'>> = {
  // Direct comms — tier 1, core section
  gmail:      { label: 'Gmail',      description: 'Recent email threads with this person',   defaultTier: 1, isCore: true  },
  gong:       { label: 'Gong',       description: 'Call recordings & AI summaries',           defaultTier: 1, isCore: true  },
  // CRM — tier 2, per-person
  salesforce: { label: 'Salesforce', description: 'CRM pipeline and contact data',            defaultTier: 2, isCore: false },
  hubspot:    { label: 'HubSpot',    description: 'CRM pipeline and contact data',            defaultTier: 2, isCore: false },
  pipedrive:  { label: 'Pipedrive',  description: 'CRM pipeline and contact data',            defaultTier: 2, isCore: false },
  // Ticketing — tier 2, per-person
  jira:       { label: 'Jira',       description: 'Issues and projects via StackOne',         defaultTier: 2, isCore: false },
  linear:     { label: 'Linear',     description: 'Issues and projects via StackOne',         defaultTier: 2, isCore: false },
  // Custom integrations — tier 2, per-person
  cleargo:    { label: 'ClearGO',    description: '1:1 prep packs from ClearGO',              defaultTier: 2, isCore: false },
  // HRIS — tier 3 (org context only, never projected onto the individual)
  workday:    { label: 'Workday',    description: 'Employee org data via StackOne',           defaultTier: 3, isCore: false },
  bamboohr:   { label: 'BambooHR',   description: 'Employee org data via StackOne',           defaultTier: 3, isCore: false },
  adp:        { label: 'ADP',        description: 'Employee org data via StackOne',           defaultTier: 3, isCore: false },
  rippling:   { label: 'Rippling',   description: 'Employee org data via StackOne',           defaultTier: 3, isCore: false },
  gusto:      { label: 'Gusto',      description: 'Employee org data via StackOne',           defaultTier: 3, isCore: false },
};

/** Build the available tool list from live StackOne accounts. */
export function buildStackOneTools(
  accounts: Array<{ provider: string; provider_name?: string; status?: string }>,
): PrepToolDef[] {
  const seen = new Set<string>();
  const tools: PrepToolDef[] = [];
  for (const account of accounts) {
    if (account.status && account.status !== 'active') continue;
    const id = account.provider.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const known = STACKONE_PROVIDER_CATALOG[id];
    tools.push({
      id,
      label:       known?.label       ?? account.provider_name ?? account.provider.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: known?.description ?? 'Data via StackOne',
      defaultTier: known?.defaultTier ?? 2,
      isCore:      known?.isCore      ?? false,
    });
  }
  return tools;
}

/** Look up a display label for any tool id (static or StackOne catalog). */
export function toolLabel(id: string): string {
  return (
    STATIC_TOOLS.find(t => t.id === id)?.label ??
    STACKONE_PROVIDER_CATALOG[id]?.label ??
    id
  );
}

/** @deprecated Use STATIC_TOOLS. */
export const PREP_TOOLS = STATIC_TOOLS;

export const PREP_TOOL_IDS = STATIC_TOOLS.map(t => t.id);

/**
 * Resolve the effective tier for a tool, respecting per-user overrides.
 * `toolTierOverrides` is the `cos_prep_schedule.tool_tiers` JSONB value.
 */
export function resolveToolTier(
  toolId: string,
  toolTierOverrides: Record<string, number> | null | undefined,
): 1 | 2 | 3 {
  const override = toolTierOverrides?.[toolId];
  if (override === 1 || override === 2 || override === 3) return override;
  const staticDef = STATIC_TOOLS.find(t => t.id === toolId);
  if (staticDef) return staticDef.defaultTier;
  const catalogEntry = STACKONE_PROVIDER_CATALOG[toolId];
  return catalogEntry?.defaultTier ?? 2;
}

/**
 * The effective toolset for a member's prep: a per-member override wins over the
 * global default. `null`/`undefined`/empty override means "use the global default".
 */
export function effectivePrepTools(
  perMemberOverride: string[] | null | undefined,
  globalDefault: string[],
): string[] {
  if (Array.isArray(perMemberOverride) && perMemberOverride.length > 0) return perMemberOverride;
  return globalDefault;
}

export type MeetingCategory = 'recurring_1on1' | 'oneoff_1on1' | 'recurring_group' | 'oneoff_group';

/**
 * Classify a meeting from the two signals we already sync: whether it belongs to
 * a recurring series (`recurringEventId`) and how many other attendees it has
 * (`attendeeCount` = length of attendee_emails, i.e. excludes the user).
 * A meeting is a 1:1 when there is at most one other attendee.
 */
export function categorizeMeeting(recurringEventId: string | null | undefined, attendeeCount: number): MeetingCategory {
  const isRecurring = recurringEventId != null && recurringEventId !== '';
  const isOneOnOne = attendeeCount <= 1;
  if (isRecurring) return isOneOnOne ? 'recurring_1on1' : 'recurring_group';
  return isOneOnOne ? 'oneoff_1on1' : 'oneoff_group';
}

/**
 * Whether a meeting qualifies for auto-prep under the inclusion model.
 * - 1:1s (recurring or one-off) always qualify.
 * - Recurring group meetings qualify only if their series is opted in.
 * - One-off group meetings never auto-qualify (use always_include to force them).
 */
export function meetingQualifies(
  category: MeetingCategory,
  recurringEventId: string | null | undefined,
  includedGroupSeries: string[],
): boolean {
  if (category === 'recurring_1on1' || category === 'oneoff_1on1') return true;
  if (category === 'recurring_group') {
    return !!recurringEventId && includedGroupSeries.includes(recurringEventId);
  }
  return false;
}
