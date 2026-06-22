import { describe, it, expect } from 'vitest';
import {
  matchEventToMember,
  matchEventToMembers,
  isOneOnOne,
  isGroupMeeting,
  recurrenceKeyForEvent,
  passesTitleFilters,
  findMatchingMember,
  getOtherAttendees,
  DEFAULT_SYNC_RULES,
  type CalendarSyncRules,
  type MinimalEvent,
  type MinimalMember,
  type MinimalAttendee,
} from '@/lib/calendar/matchEventToMember';

// Small builders to keep individual tests focused.
function makeEvent(overrides: Partial<MinimalEvent> = {}): MinimalEvent {
  return {
    id: 'evt-1',
    summary: 'Untitled',
    status: 'confirmed',
    attendees: [],
    ...overrides,
  };
}

function makeMember(overrides: Partial<MinimalMember> = {}): MinimalMember {
  return {
    id: 'm-default',
    name: 'Default Name',
    email: 'default@x.com',
    relationship_type: 'direct_report',
    ...overrides,
  };
}

function makeRules(overrides: Partial<CalendarSyncRules> = {}): CalendarSyncRules {
  return { ...DEFAULT_SYNC_RULES, ...overrides };
}

const SELF: MinimalAttendee = { email: 'me@x.com', self: true };

describe('matchEventToMember', () => {
  it('matches by email when an attendee email equals a member email', () => {
    const member = makeMember({ id: 'm1', name: 'Sam', email: 'sam@x.com' });
    const event = makeEvent({
      attendees: [SELF, { email: 'sam@x.com', displayName: 'Sam' }],
    });

    const result = matchEventToMember(event, [member]);

    expect(result?.member.id).toBe('m1');
    expect(result?.matchedBy).toBe('email');
  });

  it('email match is case-insensitive and whitespace-tolerant', () => {
    const member = makeMember({ id: 'm1', email: 'Sam@X.com ' });
    const event = makeEvent({
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    const result = matchEventToMember(event, [member]);

    expect(result?.member.id).toBe('m1');
    expect(result?.matchedBy).toBe('email');
  });

  it('falls back to name match when the attendee has no email', () => {
    const member = makeMember({ id: 'm1', name: 'Riley Park', email: null });
    const event = makeEvent({
      attendees: [SELF, { email: null, displayName: 'Riley Park' }],
    });

    const result = matchEventToMember(event, [member]);

    expect(result?.member.id).toBe('m1');
    expect(result?.matchedBy).toBe('name');
  });

  it('name match normalises whitespace and case', () => {
    const member = makeMember({ id: 'm1', name: 'Riley  Park', email: null });
    const event = makeEvent({
      attendees: [SELF, { displayName: 'riley park' }],
    });

    const result = matchEventToMember(event, [member]);

    expect(result?.member.id).toBe('m1');
    expect(result?.matchedBy).toBe('name');
  });

  it("match_strategy 'email_only' skips name fallback", () => {
    const member = makeMember({ id: 'm1', name: 'Riley Park', email: null });
    const event = makeEvent({
      attendees: [SELF, { displayName: 'Riley Park' }],
    });

    const result = matchEventToMember(event, [member], makeRules({ match_strategy: 'email_only' }));

    expect(result).toBeNull();
  });

  it("match_strategy 'name_only' skips email and picks the name member", () => {
    // First member shares the attendee's email; second member's name matches
    // the attendee's display name. Under name_only we should pick the second.
    const emailMember = makeMember({ id: 'm-email', name: 'Email Person', email: 'shared@x.com' });
    const nameMember = makeMember({ id: 'm-name', name: 'Name Person', email: 'other@x.com' });
    const event = makeEvent({
      attendees: [SELF, { email: 'shared@x.com', displayName: 'Name Person' }],
    });

    const result = matchEventToMember(event, [emailMember, nameMember], makeRules({ match_strategy: 'name_only' }));

    expect(result?.member.id).toBe('m-name');
    expect(result?.matchedBy).toBe('name');
  });

  it('treats self + 1 other as a 1:1 and matches it', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    expect(isOneOnOne(event)).toBe(true);
    expect(matchEventToMember(event, [member])).not.toBeNull();
  });

  it('never returns a 1:1 match for a group meeting (self + 2 others)', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({
      attendees: [SELF, { email: 'sam@x.com' }, { email: 'extra@x.com' }],
    });

    expect(isGroupMeeting(event)).toBe(true);
    expect(matchEventToMember(event, [member])).toBeNull();
  });

  it('returns null when there are zero non-self attendees', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({ attendees: [SELF] });

    expect(matchEventToMember(event, [member])).toBeNull();
  });

  it('returns null for an empty attendees array', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({ attendees: [] });

    expect(matchEventToMember(event, [member])).toBeNull();
  });

  it('returns null when the attendees field is missing entirely', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({ attendees: undefined });

    expect(matchEventToMember(event, [member])).toBeNull();
  });

  it('include_titles_regex filters out non-matching titles', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({
      summary: 'Project sync',
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    const result = matchEventToMember(event, [member], makeRules({ include_titles_regex: '1:1|catch.?up' }));

    expect(result).toBeNull();
  });

  it('include_titles_regex allows matching titles through', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({
      summary: '1:1 with Sam',
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    const result = matchEventToMember(event, [member], makeRules({ include_titles_regex: '1:1|catch.?up' }));

    expect(result?.member.id).toBe('m1');
  });

  it('exclude_titles_regex is case-insensitive', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({
      summary: 'Interview prep',
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    const result = matchEventToMember(event, [member], makeRules({ exclude_titles_regex: 'interview' }));

    expect(result).toBeNull();
  });

  it('treats an invalid include regex as no filter (does not throw)', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({
      summary: 'Anything goes',
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    const result = matchEventToMember(event, [member], makeRules({ include_titles_regex: '[' }));

    expect(result?.member.id).toBe('m1');
  });

  it('include_relationship_types filters out members with the wrong relationship', () => {
    const member = makeMember({ id: 'm1', email: 'sam@x.com', relationship_type: 'collaborator' });
    const event = makeEvent({
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    const result = matchEventToMember(event, [member], makeRules({ include_relationship_types: ['direct_report'] }));

    expect(result).toBeNull();
  });

  it('still matches cancelled events — status is the caller’s problem, not the helper’s', () => {
    // The helper deliberately ignores event.status; the edge function decides
    // whether a cancellation should flip the placeholder row's status.
    const member = makeMember({ id: 'm1', email: 'sam@x.com' });
    const event = makeEvent({
      status: 'cancelled',
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    const result = matchEventToMember(event, [member]);

    expect(result?.member.id).toBe('m1');
  });

  it('ignores the self attendee even if a member shares that email', () => {
    // Member shares the self email, but the self attendee must be filtered out,
    // leaving only "sam@x.com" as a real attendee — which doesn't match m1.
    const selfMember = makeMember({ id: 'm-self', email: 'me@x.com' });
    const event = makeEvent({
      attendees: [SELF, { email: 'sam@x.com' }],
    });

    const result = matchEventToMember(event, [selfMember]);

    expect(result).toBeNull();
  });

  it('exposes its helper functions as named exports', () => {
    expect(typeof isOneOnOne).toBe('function');
    expect(typeof passesTitleFilters).toBe('function');
    expect(typeof findMatchingMember).toBe('function');
    expect(typeof getOtherAttendees).toBe('function');
    expect(DEFAULT_SYNC_RULES).toMatchObject({
      match_strategy: 'email_then_name',
    });
    expect(DEFAULT_SYNC_RULES).not.toHaveProperty('max_other_attendees');
  });
});

describe('matchEventToMembers (group roster linking)', () => {
  it('resolves every tracked attendee in a group meeting', () => {
    const sam = makeMember({ id: 'm-sam', name: 'Sam', email: 'sam@x.com', relationship_type: 'direct_report' });
    const ravi = makeMember({ id: 'm-ravi', name: 'Ravi', email: 'ravi@x.com', relationship_type: 'peer' });
    const event = makeEvent({
      attendees: [SELF, { email: 'sam@x.com' }, { email: 'ravi@x.com' }, { email: 'guest@out.com' }],
    });

    const matches = matchEventToMembers(event, [sam, ravi]);

    expect(matches.map(m => m.member.id).sort()).toEqual(['m-ravi', 'm-sam']);
  });

  it('ignores include_relationship_types so any tracked member appears in the roster', () => {
    const peer = makeMember({ id: 'm-peer', email: 'peer@x.com', relationship_type: 'peer' });
    const event = makeEvent({
      attendees: [SELF, { email: 'peer@x.com' }, { email: 'someone@x.com' }],
    });

    const matches = matchEventToMembers(event, [peer], makeRules({ include_relationship_types: ['direct_report'] }));

    expect(matches.map(m => m.member.id)).toEqual(['m-peer']);
  });

  it('returns no duplicate entries for the same member', () => {
    const sam = makeMember({ id: 'm-sam', name: 'Sam', email: 'sam@x.com' });
    const event = makeEvent({
      attendees: [SELF, { email: 'sam@x.com', displayName: 'Sam' }, { email: 'sam@x.com' }],
    });

    const matches = matchEventToMembers(event, [sam]);

    expect(matches).toHaveLength(1);
  });
});

describe('recurrenceKeyForEvent', () => {
  it('prefers the recurringEventId when present', () => {
    const event = makeEvent({ summary: 'Project X Sync', recurringEventId: 'abc123' });
    expect(recurrenceKeyForEvent(event)).toBe('series:abc123');
  });

  it('falls back to a normalised title', () => {
    const a = makeEvent({ summary: 'Project X  Sync' });
    const b = makeEvent({ summary: 'project x sync' });
    expect(recurrenceKeyForEvent(a)).toBe('title:project x sync');
    expect(recurrenceKeyForEvent(a)).toBe(recurrenceKeyForEvent(b));
  });
});
