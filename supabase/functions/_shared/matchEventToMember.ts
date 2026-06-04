// Vendored copy of src/lib/calendar/matchEventToMember.ts for Deno runtime.
// Keep this file in sync with the canonical implementation — the Vitest tests
// import the src/ version, the edge functions import this one.

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
    return null;
  }
}

export function getOtherAttendees(event: MinimalEvent): MinimalAttendee[] {
  return (event.attendees ?? []).filter(a => !a.self);
}

export function passesTitleFilters(event: MinimalEvent, rules: CalendarSyncRules): boolean {
  const title = (event.summary ?? '').trim();
  const include = safeCompileRegex(rules.include_titles_regex);
  if (include && !include.test(title)) return false;
  const exclude = safeCompileRegex(rules.exclude_titles_regex);
  if (exclude && exclude.test(title)) return false;
  return true;
}

export function passesAttendeeCap(event: MinimalEvent, rules: CalendarSyncRules): boolean {
  const others = getOtherAttendees(event);
  return others.length > 0 && others.length <= rules.max_other_attendees;
}

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
      if (m) return { member: m, otherAttendees: others, matchedAttendee: att, matchedBy: 'email' };
    }
  }

  if (wantsName) {
    for (const att of others) {
      const displayName = (att.displayName ?? '').trim();
      if (!displayName) continue;
      const m = byName.get(normaliseName(displayName));
      if (m) return { member: m, otherAttendees: others, matchedAttendee: att, matchedBy: 'name' };
    }
  }

  return null;
}

export function matchEventToMember(
  event: MinimalEvent,
  members: MinimalMember[],
  rules: CalendarSyncRules = DEFAULT_SYNC_RULES,
): MatchResult | null {
  if (!passesTitleFilters(event, rules)) return null;
  if (!passesAttendeeCap(event, rules)) return null;
  return findMatchingMember(event, members, rules);
}
