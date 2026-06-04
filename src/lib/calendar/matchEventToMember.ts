// Pure helpers for deciding whether a Google Calendar event represents a 1:1
// with one of the user's tracked team members. Extracted so the edge function
// and Vitest tests share the same logic.

export type RelationshipType =
  | 'direct_report'
  | 'collaborator'
  | 'boss'
  | 'peer'
  | 'skip_level'
  | 'stakeholder'
  | 'external';

export type EventCategory =
  | 'direct_report'
  | 'skip_level'
  | 'peer'
  | 'boss'
  | 'stakeholder'
  | 'external';

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
  matchedBy: 'email' | 'name' | 'first_name' | 'email_local';
}

// Returned for events that passed the attendee cap but had no member match —
// lets callers surface "who did we see?" so users can add emails or fix names.
export interface UnmatchedEvent {
  eventTitle: string | null;
  attendeeEmail: string | null;
  attendeeName: string | null;
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
    // Exact full-name match first.
    for (const att of others) {
      const displayName = (att.displayName ?? '').trim();
      if (!displayName) continue;
      const m = byName.get(normaliseName(displayName));
      if (m) {
        return { member: m, otherAttendees: others, matchedAttendee: att, matchedBy: 'name' };
      }
    }

    // First-name fallback: handles "Mike" ↔ "Michael Chen", "J. Smith" ↔ "Jane Smith", etc.
    // Build a map of first-name → member (only when unambiguous — skip if two members share
    // the same first name to avoid false positives).
    const byFirstName = new Map<string, MinimalMember | null>();
    for (const m of eligibleMembers) {
      const first = normaliseName(m.name).split(' ')[0];
      if (!first) continue;
      // null sentinel = ambiguous (multiple members share this first name)
      byFirstName.set(first, byFirstName.has(first) ? null : m);
    }

    for (const att of others) {
      const displayName = (att.displayName ?? '').trim();
      if (!displayName) continue;
      const attFirst = normaliseName(displayName).split(' ')[0];
      if (!attFirst) continue;
      const m = byFirstName.get(attFirst);
      if (m) {
        return { member: m, otherAttendees: others, matchedAttendee: att, matchedBy: 'first_name' };
      }
    }

    // Email local-part matching: Google often returns no displayName, only an email.
    // Parse "myang@company.com" → local="myang", then try to match against member names.
    // Patterns supported (all case-insensitive):
    //   firstinitiallastname  — myang   → Matt Yang
    //   firstnamelastname     — mattyang → Matt Yang
    //   firstname.lastname    — matt.yang → Matt Yang  (dots already stripped)
    //   firstinitial.lastname — m.yang  → Matt Yang
    // Only fires when unambiguous across eligible members.
    const byEmailLocal = new Map<string, MinimalMember | null>();
    for (const m of eligibleMembers) {
      const parts = normaliseName(m.name).split(' ');
      if (parts.length < 2) continue;
      const first = parts[0];
      const last = parts[parts.length - 1];
      const patterns = [
        first[0] + last,           // myang
        first + last,              // mattyang
        first[0] + '.' + last,     // m.yang (dot stripped → myang — covered above, but keep for clarity)
        first + '.' + last,        // matt.yang
      ];
      for (const pat of patterns) {
        const key = pat.replace(/\./g, '');
        byEmailLocal.set(key, byEmailLocal.has(key) ? null : m);
      }
    }

    for (const att of others) {
      const email = normaliseEmail(att.email);
      if (!email) continue;
      const local = email.split('@')[0].replace(/[._-]/g, '');
      const m = byEmailLocal.get(local);
      if (m) {
        return { member: m, otherAttendees: others, matchedAttendee: att, matchedBy: 'email_local' };
      }
    }
  }

  return null;
}

// Variant that also returns unmatched event details for diagnostics.
export function findMatchingMemberWithDiagnostics(
  event: MinimalEvent,
  members: MinimalMember[],
  rules: CalendarSyncRules,
): { match: MatchResult | null; unmatched: UnmatchedEvent | null } {
  const match = findMatchingMember(event, members, rules);
  if (match) return { match, unmatched: null };

  // Only report unmatched when the event passed the cap filter (it looked like a 1:1
  // but we couldn't identify who it's with).
  if (!passesAttendeeCap(event, rules)) return { match: null, unmatched: null };

  const others = getOtherAttendees(event);
  const first = others[0] ?? null;
  return {
    match: null,
    unmatched: {
      eventTitle: event.summary ?? null,
      attendeeEmail: first?.email ?? null,
      attendeeName: first?.displayName ?? null,
    },
  };
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

// Map a cos_team_members relationship_type to the display category used in the UI.
const RELATIONSHIP_TO_CATEGORY: Record<string, EventCategory> = {
  direct_report: 'direct_report',
  skip_level:    'skip_level',
  peer:          'peer',
  boss:          'boss',
  collaborator:  'stakeholder',
  stakeholder:   'stakeholder',
  external:      'external',
};

export function inferCategory(
  attendeeEmail: string | null | undefined,
  userEmail: string,
  member: MinimalMember | null,
): EventCategory {
  if (member) {
    return RELATIONSHIP_TO_CATEGORY[member.relationship_type] ?? 'stakeholder';
  }
  // No member match — classify by domain.
  if (attendeeEmail) {
    const userDomain = userEmail.split('@').pop()?.toLowerCase() ?? '';
    const attendeeDomain = attendeeEmail.split('@').pop()?.toLowerCase() ?? '';
    if (userDomain && attendeeDomain && userDomain !== attendeeDomain) {
      return 'external';
    }
  }
  return 'stakeholder';
}
