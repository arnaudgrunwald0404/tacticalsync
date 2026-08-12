import type { SourceRef } from '@/types/inbox';

// ─────────────────────────────────────────────────────────────────────────────
// Meeting insights — pure logic shared conceptually between the React app and
// the extract-zoom-quotes / agent-tick edge functions (mirrored, not imported,
// under supabase/functions/**, same convention as delegationRequestSchema in
// inboxValidation.ts — Deno can't import from src/).
//
// Standout quotes surface as `dci_suggested_tasks` rows (source_type:
// 'meeting') — the same recommendation surface email and Slack action items
// use (InboxSuggestionsPanel / useMeetingSuggestions), rather than as their
// own inbox_items row: accept -> a real task, dismiss -> hidden, no separate
// triage affordance needed since that panel already provides one.
//
// Everything here is pure and dependency-free so it can be unit-tested
// directly.
// ─────────────────────────────────────────────────────────────────────────────

/** Max quote suggestions created per transcript, independent of how many
 *  quotes are extracted for cos_member_quotes (up to 3). The suggestions
 *  panel is a triage stream, not a permanent dump, so its volume tolerance is
 *  capped below the extraction surface's. */
export const MEETING_INSIGHT_CAP_PER_TRANSCRIPT = 2;

/** Raw transcript speaker labels that carry no useful identity — anonymous
 *  dial-ins, placeholder labels — and should never produce an inbox row
 *  (plan §6.4). Matches "Unknown", "Guest", "Guest 1", bare phone numbers,
 *  case-insensitively. */
const NOISY_SPEAKER_RE = /^(unknown|guest\s*\d*|\+?\d{7,})$/i;

export function isNoisySpeakerName(speaker: string): boolean {
  const trimmed = speaker.trim();
  if (!trimmed) return true;
  return NOISY_SPEAKER_RE.test(trimmed);
}

/** A single quote as extracted by the Gemini prompt in extract-zoom-quotes. */
export interface ExtractedQuote {
  speaker: string;
  quote: string;
  context?: string;
}

/** The `dci_suggested_tasks` fields a quote suggestion inserts — same table
 *  and shape email/Slack-derived recommendations use (source_type
 *  distinguishes provenance), surfaced via InboxSuggestionsPanel /
 *  useMeetingSuggestions. Accepting creates a real task from `title`;
 *  dismissing just hides it — no separate triage UI needed. */
export interface QuoteSuggestionFields {
  title: string;
  source_type: 'meeting';
  source: string | null;
  rationale: string | null;
  raw_context: string;
  urgency: 'watching';
}

/**
 * Shape a `dci_suggested_tasks` row for one extracted quote. `title` carries
 * just the speaker + quote (no meeting/date suffix) since `source` already
 * supplies the meeting name for the panel's own provenance line — embedding
 * both would duplicate on the card.
 */
export function buildQuoteSuggestionFields(
  q: Pick<ExtractedQuote, 'speaker' | 'quote' | 'context'>,
  meetingTopic: string | null | undefined,
): QuoteSuggestionFields {
  const speaker = q.speaker.trim();
  const quote = q.quote.trim();
  return {
    title: `${speaker} said: "${quote}"`,
    source_type: 'meeting',
    source: meetingTopic?.trim() || null,
    rationale: q.context?.trim() || null,
    raw_context: quote,
    urgency: 'watching',
  };
}

/** Format a YYYY-MM-DD string as "Jul 3" without pulling in date-fns (this
 *  module must stay importable from a Deno edge function too). Returns null
 *  for anything that doesn't parse as a plain date. */
function formatShortDate(saidOn: string | null | undefined): string | null {
  if (!saidOn) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(saidOn);
  if (!match) return null;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = Number(match[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return `${MONTHS[monthIdx]} ${Number(match[3])}`;
}

/**
 * Apply the per-transcript cap (plan §6.3) to a list of candidate quotes,
 * preserving order (Gemini returns quotes in the order it considers most
 * salient, so capping is a simple prefix-take, not a re-rank).
 */
export function capMeetingInsights<T>(
  quotes: T[],
  cap: number = MEETING_INSIGHT_CAP_PER_TRANSCRIPT,
): T[] {
  return quotes.slice(0, Math.max(0, cap));
}

// ── Commitment extraction (directional "who owes whom") ─────────────────────
//
// Second extraction target added alongside quotes in the same Gemini call
// (extract-zoom-quotes/index.ts) — explicit commitments/action items with
// directionality relative to the meeting host (the user). Feeds the
// `owed_by` column added in 20260728000001_inbox_items_owed_by.sql, which
// powers the daily digest's "you're blocking these people" section.

/** Max commitment rows created per transcript, independent of the quote
 *  suggestion cap above — kept modest since commitments are a coarser,
 *  higher-signal-per-row surface than quotes. */
export const COMMITMENT_CAP_PER_TRANSCRIPT = 5;

/** Everything needed to build a commitment inbox row's text/source_ref. */
export interface CommitmentContext {
  userId: string;
  transcriptId: string;
  recordingId: string;
  meetingTopic?: string | null;
  saidOn: string; // YYYY-MM-DD
}

/** A single explicit commitment as extracted by the Gemini prompt in
 *  extract-zoom-quotes. */
export interface ExtractedCommitment {
  /** Name of whoever owes the commitment, as it appears in the transcript.
   *  For a 'me' commitment (the host/user is the one who committed), this
   *  is often a generic label like "Host" or "You" rather than a real name —
   *  the transcript rarely names the user explicitly. */
  owner_name: string;
  /** 'me' = the host/user committed to do something for someone else
   *  (the user is blocking someone else on this).
   *  'them' = a participant committed to do something for the host/user
   *  (the user is waiting on someone else). */
  owed_by: 'me' | 'them';
  /** One-sentence description of what was promised. */
  commitment: string;
}

/**
 * Build the dedup key for a candidate commitment insert: one row per
 * (transcript, owner, commitment) tuple, so a manual re-extract stays
 * idempotent instead of duplicating rows.
 */
export function commitmentDedupKey(
  transcriptId: string,
  ownerName: string,
  commitment: string,
): { transcript_id: string; speaker_name: string; commitment: string } {
  return {
    transcript_id: transcriptId,
    speaker_name: ownerName.trim(),
    commitment: commitment.trim(),
  };
}

/**
 * Build the source_ref for a commitment inbox row. Uses the 'zoom_recording'
 * shape (transcript_id/recording_id/speaker_name/meeting_topic/said_on);
 * `speaker_name` carries the commitment's owner_name here.
 */
export function buildCommitmentSourceRef(
  ctx: CommitmentContext,
  c: Pick<ExtractedCommitment, 'owner_name'>,
): SourceRef {
  return {
    type: 'zoom_recording',
    id: ctx.recordingId,
    recording_id: ctx.recordingId,
    transcript_id: ctx.transcriptId,
    speaker_name: c.owner_name.trim(),
    meeting_topic: ctx.meetingTopic ?? undefined,
    said_on: ctx.saidOn,
  };
}

/**
 * Shape the commitment inbox row's own headline text, so a user scanning the
 * list knows who owes what without opening the row.
 */
export function buildCommitmentText(
  c: Pick<ExtractedCommitment, 'owner_name' | 'owed_by' | 'commitment'>,
  meetingTopic: string | null | undefined,
  saidOn: string | null | undefined,
): string {
  const commitment = c.commitment.trim();
  const base = c.owed_by === 'me'
    ? `You committed: ${commitment}`
    : `${c.owner_name.trim()} committed: ${commitment}`;
  const meetingLabel = meetingTopic?.trim();
  if (!meetingLabel) return base;

  const dateLabel = formatShortDate(saidOn);
  return dateLabel ? `${base} — from ${meetingLabel}, ${dateLabel}` : `${base} — from ${meetingLabel}`;
}
