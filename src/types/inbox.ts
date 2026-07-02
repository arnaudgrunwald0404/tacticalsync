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
}

export interface SourceRef {
  type: 'zoom_recording' | 'dci_brief' | 'calendar' | 'manual';
  id?: string;
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
  created_at: string;
  updated_at: string;
  workflow_status: 'Not started' | 'Work in progress' | 'Waiting on someone' | 'Blocked' | null;
  // joined
  tags?: InboxTag[];
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
  /** built-in view key, e.g. 'all' | 'asap' | 'waiting' | 'archive' | tag-id */
  builtIn?: 'all' | 'asap' | 'waiting' | 'archive';
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
