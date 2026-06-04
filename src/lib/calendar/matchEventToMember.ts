// Pure helpers for deciding whether a Google Calendar event represents a 1:1
// with one of the user's tracked team members. Extracted so the edge function
// and Vitest tests share the same logic.

export type RelationshipType = 'direct_report' | 'collaborator';

export interface CalendarSyncRules {
  max_other_attendees: number;
  include_relationship_types: RelationshipType[];
  include_titles_regex: string | null;
  exclude_titles_regex: string | null;
  match_strategy: 'email_then_name' | 'email_only' | 'name_only';
}

export interface MinimalAttendee {
  email?: string | null;
  displayName?: string | null;
  self?: boolean;
}

export interface MinimalEvent {
  id: string;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  status?: 'confirmed' | 'tentative' | 'cancelled' | string | null;
  attendees?: MinimalAttendee[] | null;
}

export interface MinimalMember {
  id: string;
  name: string;
  email: string | null;
  relationship_type: RelationshipType;
}

export interface MatchResult {
  member: MinimalMember;
  otherAttendees: MinimalAttendee[];
  // The attendee that resolved to the member, so the edge function can store
  // a stable attendee_emails list including the matched email when present.
  matchedAttendee: MinimalAttendee;
  matchedBy: 'email' | 'name';
}

export const DEFAULT_SYNC_RULES: CalendarSyncRules = {
  max_other_attendees: 1,
  include_relationship_types: ['direct_report', 'collaborator'],
  include_titles_regex: null,
  exclude_titles_regex: null,
  match_strategy: 'email_then_name',
};

function normaliseName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normaliseEmail(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function safeCompileRegex(pattern: string | null): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    // Invalid user-supplied regex — treat as "no filter" rather than crashing.
    return null;
  }
}

// Returns the non-self attendees, falling back to an empty list when the
// event has no attendees field (which can happen for events the user created
// without inviting anyone).
export function getOtherAttendees(event: MinimalEvent): MinimalAttendee[] {
  return (event.attendees ?? []).filter(a => !a.self);
}

// Decide whether the event passes the title include/exclude regex filters.
export function passesTitleFilters(event: MinimalEvent, rules: CalendarSyncRules): boolean {
  const title = (event.summary ?? '').trim();
  const include = safeCompileRegex(rules.include_titles_regex);
  if (include && !include.test(title)) return false;
  const exclude = safeCompileRegex(rules.exclude_titles_regex);
  if (exclude && exclude.test(title)) return false;
  return true;
}

// Decide whether the event passes the attendee count cap. We compare against
// non-self attendees, so a true 1:1 has exactly one other attendee.
export function passesAttendeeCap(event: MinimalEvent, rules: CalendarSyncRules): boolean {
  const others = getOtherAttendees(event);
  return others.length > 0 && others.length <= rules.max_other_attendees;
}

// Find a team member matching one of the event's non-self attendees, per the
// configured match strategy. Returns null if nothing matches.
export function findMatchingMember(
  event: MinimalEvent,
  members: MinimalMember[],
  rules: CalendarSyncRules,
): MatchResult | null {
  const others = getOtherAttendees(event);
  if (others.length === 0) return null;

  const allowedRelationships = new Set(rules.include_relationship_types);
  const eligibleMembers = members.filter(m => allowedRelationships.has(m.relationship_type));
  if (eligibleMembers.length === 0) return null;

  const wantsEmail = rules.match_strategy === 'email_then_name' || rules.match_strategy === 'email_only';
  const wantsName = rules.match_strategy === 'email_then_name' || rules.match_strategy === 'name_only';

  // Build lookup maps once.
  const byEmail = new Map<string, MinimalMember>();
  const byName = new Map<string, MinimalMember>();
  for (const m of eligibleMembers) {
    if (m.email) byEmail.set(normaliseEmail(m.email), m);
    if (m.name) byName.set(normaliseName(m.name), m);
  }

  if (wantsEmail) {
    for (const att of others) {
      const email = normaliseEmail(att.email);
      if (!email) continue;
      const m = byEmail.get(email);
      if (m) {
        return { member: m, otherAttendees: others, matchedAttendee: att, matchedBy: 'email' };
      }
    }
  }

  if (wantsName) {
    for (const att of others) {
      const displayName = (att.displayName ?? '').trim();
      if (!displayName) continue;
      const m = byName.get(normaliseName(displayName));
      if (m) {
        return { member: m, otherAttendees: others, matchedAttendee: att, matchedBy: 'name' };
      }
    }
  }

  return null;
}

// Full pipeline: returns a MatchResult when the event should be persisted as a
// placeholder, otherwise null. Cancelled events are also returned (so callers
// can flip the row's status) — the edge function decides what to do with the
// status field afterwards.
export function matchEventToMember(
  event: MinimalEvent,
  members: MinimalMember[],
  rules: CalendarSyncRules = DEFAULT_SYNC_RULES,
): MatchResult | null {
  if (!passesTitleFilters(event, rules)) return null;
  if (!passesAttendeeCap(event, rules)) return null;
  return findMatchingMember(event, members, rules);
}
