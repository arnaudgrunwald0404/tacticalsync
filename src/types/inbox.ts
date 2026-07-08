// ── Inbox types ───────────────────────────────────────────────────────────────

export type InboxItemType =
  | 'task'
  | 'note'
  | 'agent_nudge'
  | 'agent_question'
  | 'meeting_insight'
  | 'brief_item';

export type InboxItemStatus = 'open' | 'done' | 'archived' | 'snoozed';

export type InboxBucket = 'now' | 'next' | 'later';

export type InboxTagType = 'project' | 'person' | 'urgency' | 'folder' | 'context' | 'workstream';

export interface ProjectSettings {
  description?: string;
  stakeholders?: string[];
  slack_channels?: string[];
  recurring_meetings?: string[];
  pinned?: boolean;
}

export interface InboxTag {
  id: string;
  user_id: string;
  name: string;
  type: InboxTagType;
  color: string;
  member_id: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  settings?: ProjectSettings;
}

export interface BriefPriority {
  text: string;
  source: string;      // 'priorities' | 'email' | 'calendar' | 'slack' | 'dci_history'
  reasoning: string;
  origin: 'cos' | 'brief' | 'cos+brief';
  action?: string;
}

export interface AgentPayload {
  source?: string;
  rationale?: string;
  action_required?: boolean;
  cta_label?: string;
  cta_action?: string;
  // brief_item fields
  brief_date?: string;
  brief_priorities?: BriefPriority[];  // ordered; top 3 are "selected"
  brief_kind?: 'daily' | 'weekly';     // which brief this item was synced from
}

export interface SourceRef {
  type: 'zoom_recording' | 'dci_brief' | 'dci_weekly_brief' | 'calendar' | 'manual'
    | 'slack_message' | 'gmail_message';
  id?: string;
}

export interface TagSuggestion {
  tag_id: string;
  tag_name: string;
  color: string;
  reason: string;
}

export interface InboxItem {
  id: string;
  user_id: string;
  type: InboxItemType;
  text: string;
  body: string | null;
  status: InboxItemStatus;
  done_at: string | null;
  archived_at: string | null;
  snoozed_until: string | null;
  agent_payload: AgentPayload | null;
  source_ref: SourceRef | null;
  sort_order: number;
  pinned: boolean;
  bucket: InboxBucket | null;
  /** Informal "gut feel" due date set via Prioritize mode's pills. Not a hard
   *  deadline — see {@link currentPriorityTier} in inboxValidation for how the
   *  displayed tier is derived from it. Ignored when `priority_fixed` is true. */
  priority_due_at: string | null;
  /** True when `priority_due_at` was set via the calendar picker (a real due
   *  date) rather than a tier pill — it displays as-is and does not decay. */
  priority_fixed: boolean;
  created_at: string;
  updated_at: string;
  workflow_status: 'Do Now' | 'Not started' | 'Work in progress' | 'Waiting on someone' | 'Blocked' | null;
  /** Person delegation (Idea #8): set on the delegator's row while a
   *  delegation to a teammate is live (pending/accepted). Drives the
   *  "Waiting on X · 3d" badge — see useOutgoingDelegation. Cleared (via DB
   *  trigger) once the delegation resolves (done/cancelled). */
  active_delegation_id: string | null;
  // joined
  tags?: InboxTag[];
  tag_suggestions?: TagSuggestion[];
}

export interface InboxView {
  id: string;
  user_id: string;
  name: string;
  filter_json: InboxFilterState;
  sort_json: Record<string, unknown>;
  is_starred: boolean;
  sort_order: number;
  created_at: string;
}

export interface InboxFilterState {
  tagIds?: string[];
  types?: InboxItemType[];
  status?: InboxItemStatus;
  /** built-in view key, e.g. 'all' | 'asap' | 'waiting' | 'done' | 'archive' | tag-id.
   *  'asap' is labeled "Do Now" in the UI and filters by workflow_status === 'Do Now'
   *  (no longer by an ASAP tag). */
  builtIn?: 'all' | 'asap' | 'waiting' | 'done' | 'archive';
}

export const TAG_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
] as const;

export const URGENCY_TAG_NAMES = ['ASAP', 'Later', 'Someday'] as const;
