// Pure, dependency-free helpers for the prep toolset and meeting-inclusion model.
// No Supabase import, so they're shared across UI + unit-testable (mirrors
// src/lib/prepScheduleTime.ts).

export interface PrepToolDef {
  id: string;
  label: string;
  description: string;
  /** Credential/integration key used to determine whether it's connected. */
  connectionKey: 'zoom' | 'slack' | 'gmail' | 'stackone';
  /**
   * Default signal tier for this tool's context in the 1:1 prep prompt.
   *   1 = primary signal  (direct comms with the person — Slack, Zoom, Gmail)
   *   2 = team/workflow   (CRM deals, HRIS, ticketing — work signal but not direct comms)
   *   3 = background only (org-level context, projection risk if misused)
   * Users can override per-tool via cos_prep_schedule.tool_tiers.
   */
  defaultTier: 1 | 2 | 3;
}

/** Tools whose data is actually gathered by generate-1on1-prep today. */
export const PREP_TOOLS: PrepToolDef[] = [
  { id: 'zoom',     label: 'Zoom',           description: 'Recent recordings, transcripts & AI summaries', connectionKey: 'zoom',      defaultTier: 1 },
  { id: 'slack',    label: 'Slack',          description: 'Recent DMs and channel messages',               connectionKey: 'slack',     defaultTier: 1 },
  { id: 'gmail',    label: 'Gmail',          description: 'Recent email threads with this person',         connectionKey: 'gmail',     defaultTier: 1 },
  { id: 'stackone', label: 'CRM & HR data',  description: 'HRIS, ticketing and CRM context via StackOne',  connectionKey: 'stackone',  defaultTier: 2 },
];

export const PREP_TOOL_IDS = PREP_TOOLS.map(t => t.id);

/** Optional per-person tools beyond the global default set. */
export const EXTRA_TOOLS: PrepToolDef[] = [
  { id: 'cleargo',    label: 'ClearGO',    description: '1:1 prep packs from ClearGO',        connectionKey: 'stackone' },
  { id: 'jira',       label: 'Jira',       description: 'Issues and projects via StackOne',   connectionKey: 'stackone' },
  { id: 'salesforce', label: 'Salesforce', description: 'CRM pipeline via StackOne',          connectionKey: 'stackone' },
];

/**
 * Resolve the effective tier for a tool, respecting per-user overrides.
 * `toolTierOverrides` is the `cos_prep_schedule.tool_tiers` JSONB value.
 */
export function resolveToolTier(
  toolId: string,
  toolTierOverrides: Record<string, number> | null | undefined,
): 1 | 2 | 3 {
  const override = toolTierOverrides?.[toolId]
  if (override === 1 || override === 2 || override === 3) return override
  const def = PREP_TOOLS.find(t => t.id === toolId)
  return def?.defaultTier ?? 2
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
