// Title-driven context-source discovery for group meetings.
//
// For a group meeting the title is the anchor — it's almost always a project /
// initiative / product / person name. We derive search tokens from it and use
// them to *suggest* relevant context sources (Slack channels, Zoom recordings),
// which the user then confirms or edits. The brief generator draws from the
// confirmed/enabled sources.

// Generic scheduling words that carry no subject signal.
const STOP_WORDS = new Set([
  'sync', 'syncs', 'weekly', 'biweekly', 'bi-weekly', 'monthly', 'daily',
  'standup', 'stand-up', 'meeting', 'mtg', 'call', 'check', 'checkin',
  'check-in', 'catchup', 'catch-up', 'touchpoint', 'touch', 'base',
  'review', 'recurring', 'the', 'and', 'with', 'for', 'of', 'team',
  'office', 'hours', 'hour', 'quarterly', 'monthly', 'huddle', 'session',
]);

// Turn a meeting title into lowercase subject tokens, dropping generic words,
// punctuation, and very short fragments.
export function titleTokens(title: string | null | undefined): string[] {
  const cleaned = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of cleaned.split(' ')) {
    const t = raw.trim();
    if (t.length < 2) continue;
    if (STOP_WORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    tokens.push(t);
  }
  return tokens;
}

// Normalise a Slack channel name for matching ("#Project-X" → "project x").
function normaliseChannel(name: string): string {
  return name.replace(/^#/, '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface SourceSuggestion {
  source_type: 'slack_channel' | 'zoom';
  ref: string;
  label: string;
}

// Suggest Slack channels whose name overlaps the title's subject tokens.
export function suggestSlackChannels(
  title: string | null | undefined,
  channels: string[],
): SourceSuggestion[] {
  const tokens = titleTokens(title);
  if (tokens.length === 0) return [];
  const out: SourceSuggestion[] = [];
  for (const ch of channels) {
    const chTokens = new Set(normaliseChannel(ch).split(' '));
    if (tokens.some(t => chTokens.has(t))) {
      out.push({ source_type: 'slack_channel', ref: ch, label: ch.startsWith('#') ? ch : `#${ch}` });
    }
  }
  return out;
}

// Suggest Zoom recordings whose topic overlaps the title's subject tokens.
export function suggestZoomMatches(
  title: string | null | undefined,
  zoomTopics: string[],
): SourceSuggestion[] {
  const tokens = titleTokens(title);
  if (tokens.length === 0) return [];
  const out: SourceSuggestion[] = [];
  const seen = new Set<string>();
  for (const topic of zoomTopics) {
    const topicTokens = new Set(titleTokens(topic));
    if (tokens.some(t => topicTokens.has(t)) && !seen.has(topic)) {
      seen.add(topic);
      out.push({ source_type: 'zoom', ref: topic, label: topic });
    }
  }
  return out;
}
