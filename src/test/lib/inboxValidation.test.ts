import { describe, it, expect } from 'vitest';
import {
  ITEM_TEXT_MAX,
  ITEM_BODY_MAX,
  TAG_NAME_MAX,
  ITEM_TYPES,
  ITEM_STATUSES,
  BUCKETS,
  TAG_TYPES,
  WORKFLOW_STATUSES,
  WORKFLOW_CYCLE,
  isItemType,
  isItemStatus,
  isBucket,
  isTagType,
  isWorkflowStatus,
  isHexColor,
  isUuid,
  validateItemText,
  validateItemBody,
  validateTagName,
  validateTagColor,
  nextWorkflowStatus,
  applyInboxClientFilters,
  resolveTargetStatus,
  inboxItemInsertSchema,
  inboxTagInsertSchema,
  briefPrioritySchema,
  delegationRequestSchema,
  type WorkflowStatus,
} from '@/lib/inboxValidation';
import type { InboxItem, InboxFilterState, InboxTag } from '@/types/inbox';

// ─────────────────────────────────────────────────────────────────────────────
// Iron-clad validation for the inbox feature. Covers happy paths, edge cases,
// and failure modes for every validator, guard, schema, and the pure filter /
// workflow logic extracted from the hooks.
// ─────────────────────────────────────────────────────────────────────────────

const UUID = '11111111-1111-1111-1111-111111111111';
const UUID2 = '22222222-2222-2222-2222-222222222222';

// ── Type guards ────────────────────────────────────────────────────────────

describe('type guards', () => {
  it('isItemType accepts every declared type and rejects others', () => {
    ITEM_TYPES.forEach((t) => expect(isItemType(t)).toBe(true));
    expect(isItemType('bogus')).toBe(false);
    expect(isItemType('')).toBe(false);
    expect(isItemType(null)).toBe(false);
    expect(isItemType(42)).toBe(false);
    expect(isItemType('Task')).toBe(false); // case-sensitive
  });

  it('isItemStatus matches the DB status enum', () => {
    ITEM_STATUSES.forEach((s) => expect(isItemStatus(s)).toBe(true));
    expect(isItemStatus('deleted')).toBe(false);
    expect(isItemStatus(undefined)).toBe(false);
  });

  it('isBucket matches now/next/later only', () => {
    BUCKETS.forEach((b) => expect(isBucket(b)).toBe(true));
    expect(isBucket('someday')).toBe(false);
    expect(isBucket(null)).toBe(false);
  });

  it('isTagType includes workstream (schema fix) and rejects unknowns', () => {
    TAG_TYPES.forEach((t) => expect(isTagType(t)).toBe(true));
    expect(isTagType('workstream')).toBe(true);
    expect(isTagType('label')).toBe(false);
  });

  it('isWorkflowStatus matches the four workflow states', () => {
    WORKFLOW_STATUSES.forEach((s) => expect(isWorkflowStatus(s)).toBe(true));
    expect(isWorkflowStatus('Done')).toBe(false);
    expect(isWorkflowStatus(null)).toBe(false);
  });
});

describe('isHexColor', () => {
  it('accepts #RGB and #RRGGBB in either case', () => {
    expect(isHexColor('#6366f1')).toBe(true);
    expect(isHexColor('#FFF')).toBe(true);
    expect(isHexColor('#AbC123')).toBe(true);
  });
  it('rejects malformed colors', () => {
    expect(isHexColor('6366f1')).toBe(false); // no hash
    expect(isHexColor('#12g')).toBe(false); // non-hex char
    expect(isHexColor('#1234')).toBe(false); // wrong length
    expect(isHexColor('#12345678')).toBe(false); // 8 digits
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('')).toBe(false);
    expect(isHexColor(123)).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts a well-formed UUID', () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid('abcdef01-2345-6789-abcd-ef0123456789')).toBe(true);
  });
  it('rejects non-UUIDs', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('11111111-1111-1111-1111-11111111111')).toBe(false); // too short
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

// ── validateItemText ─────────────────────────────────────────────────────────

describe('validateItemText', () => {
  it('accepts and trims normal text', () => {
    const r = validateItemText('  Ship the release  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('Ship the release');
  });

  it('preserves interior whitespace and tabs/newlines', () => {
    const r = validateItemText('line one\n\tline two');
    expect(r.ok && r.value).toBe('line one\n\tline two');
  });

  it('rejects empty / whitespace-only text', () => {
    expect(validateItemText('').ok).toBe(false);
    expect(validateItemText('    ').ok).toBe(false);
    expect(validateItemText('\n\t ').ok).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(validateItemText(null).ok).toBe(false);
    expect(validateItemText(undefined).ok).toBe(false);
    expect(validateItemText(42).ok).toBe(false);
    expect(validateItemText({}).ok).toBe(false);
  });

  it('strips control characters (e.g. a pasted null byte)', () => {
    const r = validateItemText('a\x00b\x07c');
    expect(r.ok && r.value).toBe('abc');
  });

  it('rejects text that becomes empty after stripping control chars', () => {
    expect(validateItemText('\x00\x01\x02').ok).toBe(false);
  });

  it('accepts text at exactly the max length', () => {
    const r = validateItemText('x'.repeat(ITEM_TEXT_MAX));
    expect(r.ok).toBe(true);
  });

  it('rejects text one character over the max length', () => {
    const r = validateItemText('x'.repeat(ITEM_TEXT_MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too long/i);
  });

  it('does not count trimmed whitespace toward the limit', () => {
    const r = validateItemText('  ' + 'x'.repeat(ITEM_TEXT_MAX) + '  ');
    expect(r.ok).toBe(true);
  });
});

// ── validateItemBody ─────────────────────────────────────────────────────────

describe('validateItemBody', () => {
  it('maps null / undefined / empty string to null', () => {
    expect(validateItemBody(null)).toEqual({ ok: true, value: null });
    expect(validateItemBody(undefined)).toEqual({ ok: true, value: null });
    expect(validateItemBody('')).toEqual({ ok: true, value: null });
  });

  it('accepts normal body text unchanged', () => {
    const r = validateItemBody('Some notes here');
    expect(r.ok && r.value).toBe('Some notes here');
  });

  it('rejects non-string, non-null input', () => {
    expect(validateItemBody(42).ok).toBe(false);
    expect(validateItemBody({}).ok).toBe(false);
  });

  it('rejects body over the max length', () => {
    expect(validateItemBody('x'.repeat(ITEM_BODY_MAX + 1)).ok).toBe(false);
    expect(validateItemBody('x'.repeat(ITEM_BODY_MAX)).ok).toBe(true);
  });
});

// ── validateTagName ──────────────────────────────────────────────────────────

describe('validateTagName', () => {
  it('trims and collapses internal whitespace', () => {
    const r = validateTagName('  Growth    Team  ');
    expect(r.ok && r.value).toBe('Growth Team');
  });

  it('rejects empty / whitespace-only names', () => {
    expect(validateTagName('').ok).toBe(false);
    expect(validateTagName('   ').ok).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(validateTagName(null).ok).toBe(false);
    expect(validateTagName(5).ok).toBe(false);
  });

  it('enforces the max length after normalization', () => {
    expect(validateTagName('x'.repeat(TAG_NAME_MAX)).ok).toBe(true);
    expect(validateTagName('x'.repeat(TAG_NAME_MAX + 1)).ok).toBe(false);
  });

  it('strips control characters', () => {
    const r = validateTagName('Sa\x00les');
    expect(r.ok && r.value).toBe('Sales');
  });
});

// ── validateTagColor ─────────────────────────────────────────────────────────

describe('validateTagColor', () => {
  it('accepts a hex color and lowercases it', () => {
    const r = validateTagColor('#AbC123');
    expect(r.ok && r.value).toBe('#abc123');
  });
  it('rejects invalid colors', () => {
    expect(validateTagColor('blue').ok).toBe(false);
    expect(validateTagColor('#12').ok).toBe(false);
    expect(validateTagColor(null).ok).toBe(false);
  });
});

// ── nextWorkflowStatus ───────────────────────────────────────────────────────

describe('nextWorkflowStatus', () => {
  it('treats null (unset) as advancing to the first cycle entry', () => {
    expect(nextWorkflowStatus(null)).toBe('Work in progress');
  });

  it('advances through the full cycle and wraps around', () => {
    let s: WorkflowStatus = nextWorkflowStatus(null); // Work in progress
    expect(s).toBe('Work in progress');
    s = nextWorkflowStatus(s);
    expect(s).toBe('Waiting on someone');
    s = nextWorkflowStatus(s);
    expect(s).toBe('Blocked');
    s = nextWorkflowStatus(s);
    expect(s).toBe('Not started');
    s = nextWorkflowStatus(s);
    expect(s).toBe('Work in progress'); // wrapped
  });

  it('covers every workflow status within one full cycle', () => {
    const seen = new Set<string>();
    let s: WorkflowStatus | null = null;
    for (let i = 0; i < WORKFLOW_CYCLE.length; i++) {
      s = nextWorkflowStatus(s);
      seen.add(s);
    }
    WORKFLOW_STATUSES.forEach((w) => expect(seen.has(w)).toBe(true));
  });

  it('treats an unknown/stale value as unset', () => {
    expect(nextWorkflowStatus('garbage')).toBe('Work in progress');
  });
});

// ── resolveTargetStatus ──────────────────────────────────────────────────────

describe('resolveTargetStatus', () => {
  it('reads archived rows for the archive view', () => {
    expect(resolveTargetStatus({ builtIn: 'archive' })).toBe('archived');
  });
  it('honours an explicit status', () => {
    expect(resolveTargetStatus({ status: 'snoozed' })).toBe('snoozed');
  });
  it('defaults to open', () => {
    expect(resolveTargetStatus({})).toBe('open');
    expect(resolveTargetStatus({ builtIn: 'all' })).toBe('open');
  });
  it('archive takes precedence over an explicit status', () => {
    expect(resolveTargetStatus({ builtIn: 'archive', status: 'open' })).toBe('archived');
  });
});

// ── applyInboxClientFilters ──────────────────────────────────────────────────

const tag = (id: string, name: string): InboxTag => ({
  id,
  user_id: UUID,
  name,
  type: 'project',
  color: '#6366f1',
  member_id: null,
  parent_id: null,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
});

let seq = 0;
const makeItem = (over: Partial<InboxItem> = {}): InboxItem => ({
  id: `item-${seq++}`,
  user_id: UUID,
  type: 'task',
  text: 'task',
  body: null,
  status: 'open',
  done_at: null,
  archived_at: null,
  snoozed_until: null,
  agent_payload: null,
  source_ref: null,
  sort_order: 0,
  pinned: false,
  bucket: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  workflow_status: null,
  tags: [],
  ...over,
});

describe('applyInboxClientFilters', () => {
  it('returns all items when no client-side filter applies', () => {
    const items = [makeItem(), makeItem()];
    expect(applyInboxClientFilters(items, {})).toHaveLength(2);
  });

  describe("builtIn 'asap'", () => {
    it('keeps only items carrying a tag named ASAP (case-insensitive)', () => {
      const asapTag = tag('t-asap', 'ASAP');
      const other = tag('t-other', 'Growth');
      const keep = makeItem({ tags: [asapTag] });
      const keepLower = makeItem({ tags: [tag('t2', 'asap')] });
      const drop = makeItem({ tags: [other] });
      const result = applyInboxClientFilters([keep, keepLower, drop], { builtIn: 'asap' });
      expect(result).toEqual([keep, keepLower]);
    });

    it('drops items with no tags', () => {
      const result = applyInboxClientFilters([makeItem({ tags: [] })], { builtIn: 'asap' });
      expect(result).toHaveLength(0);
    });
  });

  describe("builtIn 'waiting'", () => {
    it('keeps agent questions that require action', () => {
      const keep = makeItem({ type: 'agent_question', agent_payload: { action_required: true } });
      const dropNoAction = makeItem({ type: 'agent_question', agent_payload: { action_required: false } });
      const dropWrongType = makeItem({ type: 'task', agent_payload: { action_required: true } });
      const dropNoPayload = makeItem({ type: 'agent_question', agent_payload: null });
      const result = applyInboxClientFilters(
        [keep, dropNoAction, dropWrongType, dropNoPayload],
        { builtIn: 'waiting' },
      );
      expect(result).toEqual([keep]);
    });
  });

  describe('tagIds (AND semantics)', () => {
    it('keeps only items carrying every selected tag', () => {
      const a = tag('a', 'A');
      const b = tag('b', 'B');
      const both = makeItem({ tags: [a, b] });
      const onlyA = makeItem({ tags: [a] });
      const none = makeItem({ tags: [] });
      const result = applyInboxClientFilters([both, onlyA, none], { tagIds: ['a', 'b'] });
      expect(result).toEqual([both]);
    });

    it('an empty tagIds array does not filter anything', () => {
      const items = [makeItem(), makeItem()];
      expect(applyInboxClientFilters(items, { tagIds: [] })).toHaveLength(2);
    });
  });

  it('does not mutate the input array', () => {
    const items = [makeItem({ tags: [tag('x', 'ASAP')] }), makeItem()];
    const copy = [...items];
    applyInboxClientFilters(items, { builtIn: 'asap' });
    expect(items).toEqual(copy);
  });

  it('composes tag filter with a built-in view', () => {
    const a = tag('a', 'A');
    const asapTag = tag('t-asap', 'ASAP');
    const keep = makeItem({ tags: [a, asapTag] });
    const dropNoAsap = makeItem({ tags: [a] });
    const result = applyInboxClientFilters([keep, dropNoAsap], {
      builtIn: 'asap',
      tagIds: ['a'],
    });
    expect(result).toEqual([keep]);
  });
});

// ── zod schemas ──────────────────────────────────────────────────────────────

describe('inboxItemInsertSchema', () => {
  it('accepts a valid insert and normalizes the text', () => {
    const parsed = inboxItemInsertSchema.parse({
      user_id: UUID,
      type: 'task',
      text: '  Do the thing  ',
    });
    expect(parsed.text).toBe('Do the thing');
  });

  it('rejects an invalid user_id', () => {
    expect(() =>
      inboxItemInsertSchema.parse({ user_id: 'nope', type: 'task', text: 'x' }),
    ).toThrow();
  });

  it('rejects an unknown type', () => {
    expect(() =>
      inboxItemInsertSchema.parse({ user_id: UUID, type: 'spam', text: 'x' }),
    ).toThrow();
  });

  it('rejects empty text', () => {
    expect(() =>
      inboxItemInsertSchema.parse({ user_id: UUID, type: 'task', text: '   ' }),
    ).toThrow();
  });

  it('accepts an optional bucket and null body', () => {
    const parsed = inboxItemInsertSchema.parse({
      user_id: UUID,
      type: 'note',
      text: 'note',
      bucket: 'now',
      body: null,
    });
    expect(parsed.bucket).toBe('now');
  });
});

describe('inboxTagInsertSchema', () => {
  it('accepts a valid tag with a workstream type and parent_id', () => {
    const parsed = inboxTagInsertSchema.parse({
      user_id: UUID,
      name: 'Q3 launch',
      type: 'workstream',
      color: '#10b981',
      parent_id: UUID2,
    });
    expect(parsed.type).toBe('workstream');
    expect(parsed.parent_id).toBe(UUID2);
  });

  it('rejects a bad color', () => {
    expect(() =>
      inboxTagInsertSchema.parse({ user_id: UUID, name: 'x', type: 'project', color: 'green' }),
    ).toThrow();
  });

  it('rejects an unknown tag type', () => {
    expect(() =>
      inboxTagInsertSchema.parse({ user_id: UUID, name: 'x', type: 'label', color: '#fff' }),
    ).toThrow();
  });
});

describe('briefPrioritySchema', () => {
  it('accepts a well-formed priority', () => {
    const parsed = briefPrioritySchema.parse({
      text: 'Close the Acme deal',
      source: 'email',
      reasoning: 'Deal is stalling',
      origin: 'cos+brief',
    });
    expect(parsed.origin).toBe('cos+brief');
  });

  it('rejects an unknown origin', () => {
    expect(() =>
      briefPrioritySchema.parse({ text: 't', source: 's', reasoning: 'r', origin: 'random' }),
    ).toThrow();
  });

  it('rejects empty text', () => {
    expect(() =>
      briefPrioritySchema.parse({ text: '', source: 's', reasoning: 'r', origin: 'cos' }),
    ).toThrow();
  });
});

describe('delegationRequestSchema', () => {
  it('accepts a start request with UUIDs', () => {
    const parsed = delegationRequestSchema.parse({
      action: 'start',
      item_id: UUID,
      user_id: UUID2,
    });
    expect(parsed).toEqual({ action: 'start', item_id: UUID, user_id: UUID2 });
  });

  it('accepts an answer request and trims the answer', () => {
    const parsed = delegationRequestSchema.parse({
      action: 'answer',
      delegation_id: UUID,
      answer: '  Option A  ',
    });
    expect(parsed).toMatchObject({ action: 'answer', answer: 'Option A' });
  });

  it('rejects a start request with a non-UUID item_id', () => {
    expect(() =>
      delegationRequestSchema.parse({ action: 'start', item_id: 'x', user_id: UUID }),
    ).toThrow();
  });

  it('rejects an answer request with an empty answer', () => {
    expect(() =>
      delegationRequestSchema.parse({ action: 'answer', delegation_id: UUID, answer: '   ' }),
    ).toThrow();
  });

  it('rejects an unknown action', () => {
    expect(() =>
      delegationRequestSchema.parse({ action: 'delete', delegation_id: UUID }),
    ).toThrow();
  });

  it('rejects a request missing required fields', () => {
    expect(() => delegationRequestSchema.parse({ action: 'start' })).toThrow();
    expect(() => delegationRequestSchema.parse({})).toThrow();
  });
});
