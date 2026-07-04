import { z } from 'zod';
import type {
  InboxItem,
  InboxItemType,
  InboxItemStatus,
  InboxBucket,
  InboxTagType,
  InboxFilterState,
} from '@/types/inbox';

// ─────────────────────────────────────────────────────────────────────────────
// Inbox validation — the single source of truth for what the inbox feature will
// accept. Enums here mirror the CHECK constraints in the Supabase migrations
// (see supabase/migrations/2026071300000{1,2,5}_*.sql). Keep them in sync: a
// value valid here but rejected by the DB is a silent write failure; a value the
// DB accepts but we reject is a lost feature.
//
// Everything in this file is pure and dependency-free (aside from zod) so it can
// be unit-tested and reused from both the React hooks and, mirrored, the edge
// function.
// ─────────────────────────────────────────────────────────────────────────────

// ── Limits ───────────────────────────────────────────────────────────────────

/** Max length of an item's headline text. Long enough for a sentence, short
 *  enough to keep list rows sane. */
export const ITEM_TEXT_MAX = 2_000;
/** Max length of an item's expanded body / notes. */
export const ITEM_BODY_MAX = 50_000;
/** Max length of a tag name. */
export const TAG_NAME_MAX = 80;

// ── Enums (mirror DB CHECK constraints) ──────────────────────────────────────

export const ITEM_TYPES = [
  'task',
  'note',
  'agent_nudge',
  'agent_question',
  'meeting_insight',
  'brief_item',
] as const satisfies readonly InboxItemType[];

export const ITEM_STATUSES = [
  'open',
  'done',
  'archived',
  'snoozed',
] as const satisfies readonly InboxItemStatus[];

export const BUCKETS = ['now', 'next', 'later'] as const satisfies readonly InboxBucket[];

export const TAG_TYPES = [
  'project',
  'person',
  'urgency',
  'folder',
  'context',
  'workstream',
] as const satisfies readonly InboxTagType[];

/** Workflow statuses, in the order they're displayed. `null` means "unset"
 *  and precedes the first entry. "Do Now" is the first (most urgent) status —
 *  it's also what the sidebar's top view filters on. */
export const WORKFLOW_STATUSES = [
  'Do Now',
  'Not started',
  'Work in progress',
  'Waiting on someone',
  'Blocked',
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** The order the workflow chip advances through on click. Starts at "Do Now" —
 *  the first click on an unset item means "this needs to happen now". */
export const WORKFLOW_CYCLE = [
  'Do Now',
  'Work in progress',
  'Waiting on someone',
  'Blocked',
  'Not started',
] as const satisfies readonly WorkflowStatus[];

// ── Type guards ──────────────────────────────────────────────────────────────

export const isItemType = (v: unknown): v is InboxItemType =>
  typeof v === 'string' && (ITEM_TYPES as readonly string[]).includes(v);

export const isItemStatus = (v: unknown): v is InboxItemStatus =>
  typeof v === 'string' && (ITEM_STATUSES as readonly string[]).includes(v);

export const isBucket = (v: unknown): v is InboxBucket =>
  typeof v === 'string' && (BUCKETS as readonly string[]).includes(v);

export const isTagType = (v: unknown): v is InboxTagType =>
  typeof v === 'string' && (TAG_TYPES as readonly string[]).includes(v);

export const isWorkflowStatus = (v: unknown): v is WorkflowStatus =>
  typeof v === 'string' && (WORKFLOW_STATUSES as readonly string[]).includes(v);

/** #RGB or #RRGGBB, case-insensitive. */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && HEX_COLOR_RE.test(v);

/** RFC 4122-ish UUID. Used to guard IDs before they reach the DB / edge fn. */
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v);

// ── Result type ──────────────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const fail = <T = never>(error: string): ValidationResult<T> => ({ ok: false, error });

// ── Field validators ─────────────────────────────────────────────────────────

/**
 * Validate + normalize an item's headline text. Trims, rejects empty, enforces
 * the length cap. Control characters (except tab/newline) are stripped so a
 * pasted-in null byte or escape sequence can't corrupt a row.
 */
export function validateItemText(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string') return fail('Text is required.');
  const cleaned = stripControlChars(raw).trim();
  if (!cleaned) return fail('Text cannot be empty.');
  if (cleaned.length > ITEM_TEXT_MAX) {
    return fail(`Text is too long (max ${ITEM_TEXT_MAX} characters).`);
  }
  return ok(cleaned);
}

/** Validate an optional body/notes field. `null`/`undefined`/'' → null. */
export function validateItemBody(raw: unknown): ValidationResult<string | null> {
  if (raw == null || raw === '') return ok(null);
  if (typeof raw !== 'string') return fail('Body must be text.');
  if (raw.length > ITEM_BODY_MAX) {
    return fail(`Body is too long (max ${ITEM_BODY_MAX} characters).`);
  }
  return ok(raw);
}

/**
 * Validate + normalize a tag name. Trims, collapses internal whitespace,
 * rejects empty, enforces length cap.
 */
export function validateTagName(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string') return fail('Tag name is required.');
  const cleaned = stripControlChars(raw).replace(/\s+/g, ' ').trim();
  if (!cleaned) return fail('Tag name cannot be empty.');
  if (cleaned.length > TAG_NAME_MAX) {
    return fail(`Tag name is too long (max ${TAG_NAME_MAX} characters).`);
  }
  return ok(cleaned);
}

export function validateTagColor(raw: unknown): ValidationResult<string> {
  if (!isHexColor(raw)) return fail('Color must be a hex value like #6366f1.');
  return ok(raw.toLowerCase());
}

function stripControlChars(s: string): string {
  // Strip C0/C1 control chars except tab (\x09), newline (\x0A), carriage
  // return (\x0D) — a pasted null byte or escape sequence must not reach the DB.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
}

// ── zod schemas ──────────────────────────────────────────────────────────────

export const itemTextSchema = z
  .string()
  .transform(stripControlChars)
  .transform((s) => s.trim())
  .pipe(z.string().min(1, 'Text cannot be empty.').max(ITEM_TEXT_MAX));

export const tagNameSchema = z
  .string()
  .transform(stripControlChars)
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Tag name cannot be empty.').max(TAG_NAME_MAX));

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_RE, 'Color must be a hex value like #6366f1.');

/** Shape accepted when inserting a new inbox item. */
export const inboxItemInsertSchema = z.object({
  user_id: z.string().refine(isUuid, 'user_id must be a UUID.'),
  type: z.enum(ITEM_TYPES),
  text: itemTextSchema,
  body: z.string().max(ITEM_BODY_MAX).nullish(),
  status: z.enum(ITEM_STATUSES).optional(),
  bucket: z.enum(BUCKETS).nullish(),
});
export type InboxItemInsert = z.infer<typeof inboxItemInsertSchema>;

/** Shape accepted when inserting a new tag. */
export const inboxTagInsertSchema = z.object({
  user_id: z.string().refine(isUuid, 'user_id must be a UUID.'),
  name: tagNameSchema,
  type: z.enum(TAG_TYPES),
  color: hexColorSchema,
  member_id: z.string().refine(isUuid, 'member_id must be a UUID.').nullish(),
  parent_id: z.string().refine(isUuid, 'parent_id must be a UUID.').nullish(),
});
export type InboxTagInsert = z.infer<typeof inboxTagInsertSchema>;

/** A single AI-suggested brief priority. */
export const briefPrioritySchema = z.object({
  text: z.string().min(1),
  source: z.string(),
  reasoning: z.string(),
  origin: z.enum(['cos', 'brief', 'cos+brief']),
  action: z.string().optional(),
});

/**
 * Request body accepted by the delegate-inbox-task edge function. Mirrored (not
 * imported) in supabase/functions/delegate-inbox-task/index.ts because that runs
 * under Deno. A discriminated union so each action carries exactly its fields.
 */
export const delegationRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    item_id: z.string().refine(isUuid, 'item_id must be a UUID.'),
    user_id: z.string().refine(isUuid, 'user_id must be a UUID.'),
  }),
  z.object({
    action: z.literal('answer'),
    delegation_id: z.string().refine(isUuid, 'delegation_id must be a UUID.'),
    answer: z.string().trim().min(1, 'answer cannot be empty.').max(ITEM_TEXT_MAX),
  }),
]);
export type DelegationRequest = z.infer<typeof delegationRequestSchema>;

// ── Workflow status cycling ───────────────────────────────────────────────────

/** Advance the workflow chip one step around the cycle. */
export function nextWorkflowStatus(current: WorkflowStatus | string | null): WorkflowStatus {
  const idx = WORKFLOW_CYCLE.indexOf(current as WorkflowStatus);
  return WORKFLOW_CYCLE[(idx + 1) % WORKFLOW_CYCLE.length];
}

// ── Client-side filtering (extracted from useInboxItems for testability) ──────

/**
 * Apply the filters that can't be pushed into the initial Supabase query because
 * they depend on the joined tags. Pure: given the same items + filter it always
 * returns the same subset, in the same order.
 *
 *  - builtIn 'asap'    → items with workflow_status "Do Now"
 *  - builtIn 'waiting' → agent questions that still need action
 *  - tagIds            → items carrying *every* selected tag (AND semantics)
 */
export function applyInboxClientFilters(
  items: InboxItem[],
  filter: InboxFilterState,
): InboxItem[] {
  let result = items;

  if (filter.builtIn === 'asap') {
    result = result.filter((i) => i.workflow_status === 'Do Now');
  }

  if (filter.builtIn === 'waiting') {
    result = result.filter(
      (i) => i.type === 'agent_question' && Boolean(i.agent_payload?.action_required),
    );
  }

  if (filter.tagIds?.length) {
    result = result.filter((i) =>
      filter.tagIds!.every((tid) => i.tags?.some((t) => t.id === tid)),
    );
  }

  return result;
}

/** Resolve which stored status a filter is asking to read. */
export function resolveTargetStatus(filter: InboxFilterState): InboxItemStatus {
  if (filter.builtIn === 'archive') return 'archived';
  return filter.status ?? 'open';
}

// ── Folder/project drag-and-drop reindexing (extracted from InboxSidebar) ─────

/** A single tag update produced by {@link planTagGroupReindex}. */
export interface FolderReindexUpdate {
  id: string;
  patch: { type?: 'folder' | 'project'; parent_id?: null; sort_order: number };
}

/**
 * Plan the tag updates needed to drop `draggedId` into a top-level group
 * (folders or projects) at gap `index` (0 = before the first item,
 * group.length = after the last), converting it to `targetType` and
 * renumbering the group to a contiguous 0..n-1 order.
 *
 * Pure and order-independent: `group` may be in any order (it is sorted by
 * `sort_order` internally). Returns the *minimal* set of updates — the dragged
 * tag always gets `type`/`parent_id`/`sort_order`; an existing member is only
 * touched when its position actually changes. `index` is clamped into range, so
 * a bad index degrades to top/bottom rather than throwing or dropping the tag.
 */
export function planTagGroupReindex(
  group: { id: string; sort_order: number }[],
  draggedId: string,
  index: number,
  targetType: 'folder' | 'project' = 'folder',
): FolderReindexUpdate[] {
  const ordered = [...group].sort((a, b) => a.sort_order - b.sort_order);
  const ids = ordered.map((f) => f.id).filter((id) => id !== draggedId);
  const clamped = Math.max(0, Math.min(Math.trunc(index), ids.length));
  ids.splice(clamped, 0, draggedId);

  const updates: FolderReindexUpdate[] = [];
  ids.forEach((id, i) => {
    if (id === draggedId) {
      updates.push({ id, patch: { type: targetType, parent_id: null, sort_order: i } });
    } else {
      const existing = ordered.find((f) => f.id === id);
      if (!existing || existing.sort_order !== i) {
        updates.push({ id, patch: { sort_order: i } });
      }
    }
  });
  return updates;
}

/** @deprecated use {@link planTagGroupReindex} with `targetType: 'folder'`. */
export function planFolderReindex(
  folders: { id: string; sort_order: number }[],
  draggedId: string,
  index: number,
): FolderReindexUpdate[] {
  return planTagGroupReindex(folders, draggedId, index, 'folder');
}
