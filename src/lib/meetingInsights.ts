import type { InboxItem, SourceRef } from '@/types/inbox';
import { validateItemText } from './inboxValidation';

// ─────────────────────────────────────────────────────────────────────────────
// Meeting insights — pure logic shared conceptually between the React app and
// the extract-zoom-quotes / agent-tick edge functions (mirrored, not imported,
// under supabase/functions/**, same convention as delegationRequestSchema in
// inboxValidation.ts — Deno can't import from src/). See
// PLAN_idea3_meeting_insights.md for the full design.
//
// Everything here is pure and dependency-free (aside from validateItemText)
// so it can be unit-tested directly.
// ─────────────────────────────────────────────────────────────────────────────

/** Max meeting_insight rows created per transcript, independent of how many
 *  quotes are extracted for cos_member_quotes (up to 3) — see plan §6.3.
 *  inbox_items is a triage stream, not a permanent dump, so its volume
 *  tolerance is capped below the extraction surface's. */
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

/** Everything needed to build a meeting_insight row's text/source_ref for one
 *  extracted quote. */
export interface MeetingInsightContext {
  userId: string;
  transcriptId: string;
  recordingId: string;
  /** cos_member_quotes.id if the speaker matched a known team member. */
  quoteId?: string | null;
  meetingTopic?: string | null;
  saidOn: string; // YYYY-MM-DD
}

/**
 * Build the dedup key for a candidate meeting_insight insert: one row per
 * (transcript, speaker, quote) tuple. Used both for the pre-insert existence
 * check and for the DB expression index (see the meeting_insight_dedup
 * migration) — must stay in sync with that index's expression.
 */
export function meetingInsightDedupKey(
  transcriptId: string,
  speaker: string,
  quote: string,
): { transcript_id: string; speaker_name: string; quote: string } {
  return {
    transcript_id: transcriptId,
    speaker_name: speaker.trim(),
    quote: quote.trim(),
  };
}

/**
 * Build the source_ref for a meeting_insight row (plan §3). `type` is always
 * 'zoom_recording' and `id` mirrors `recording_id` so existing single-id
 * consumers keep working.
 */
export function buildMeetingInsightSourceRef(
  ctx: MeetingInsightContext,
  q: ExtractedQuote,
): SourceRef {
  return {
    type: 'zoom_recording',
    id: ctx.recordingId,
    recording_id: ctx.recordingId,
    transcript_id: ctx.transcriptId,
    quote_id: ctx.quoteId ?? undefined,
    speaker_name: q.speaker.trim(),
    meeting_topic: ctx.meetingTopic ?? undefined,
    said_on: ctx.saidOn,
    context: q.context,
  };
}

/**
 * Shape the meeting_insight row's own headline text so a user scanning the
 * list never has to open the row to know where it came from (plan §9.1
 * "per-card origin clarity"): "<Speaker> said: '<quote>' — from <meeting>, <date>".
 * Falls back gracefully when topic/date are unavailable.
 */
export function buildMeetingInsightText(
  q: ExtractedQuote,
  meetingTopic: string | null | undefined,
  saidOn: string | null | undefined,
): string {
  const speaker = q.speaker.trim();
  const quote = q.quote.trim();
  const base = `${speaker} said: "${quote}"`;
  const meetingLabel = meetingTopic?.trim();
  if (!meetingLabel) return base;

  const dateLabel = formatShortDate(saidOn);
  return dateLabel ? `${base} — from ${meetingLabel}, ${dateLabel}` : `${base} — from ${meetingLabel}`;
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

// ── Triage actions (plan §4) ────────────────────────────────────────────────

export type TriageAction = 'confirm' | 'save' | 'dismiss';

/** Fields to insert for the new row created by Confirm/Save; null for Dismiss
 *  (no new row). */
export interface TriageInsertPlan {
  type: 'task' | 'note';
  text: string;
  body: string | null;
  source_ref: SourceRef;
}

/** Fields to patch onto the *original* meeting_insight row for a given
 *  triage action (plan §4's "What happens to status/type"). */
export interface TriagePatchPlan {
  status: 'done' | 'archived';
  done_at: string | null;
  archived_at: string | null;
}

/**
 * Plan the new row (if any) to insert for a triage action. Returns null for
 * 'dismiss', which creates no new row. Pure — callers are responsible for
 * actually performing the insert/update via useInboxItems.
 */
export function planTriageInsert(
  item: Pick<InboxItem, 'text' | 'source_ref'>,
  action: TriageAction,
): TriageInsertPlan | null {
  if (action === 'dismiss') return null;

  const sourceRef = item.source_ref ?? { type: 'manual' as const };

  if (action === 'confirm') {
    const seeded = `Follow up: ${item.text}`;
    const textResult = validateItemText(seeded);
    return {
      type: 'task',
      text: textResult.ok ? textResult.value : seeded.slice(0, 2000),
      body: null,
      source_ref: sourceRef,
    };
  }

  // action === 'save'
  const label = sourceRef.context?.trim() || item.text.slice(0, 80);
  const labelResult = validateItemText(label);
  return {
    type: 'note',
    text: labelResult.ok ? labelResult.value : label.slice(0, 2000) || 'Meeting note',
    body: item.text,
    source_ref: sourceRef,
  };
}

/** Plan the status patch to apply to the original insight row (plan §4). */
export function planTriagePatch(action: TriageAction, now: Date = new Date()): TriagePatchPlan {
  const nowIso = now.toISOString();
  if (action === 'confirm') {
    return { status: 'done', done_at: nowIso, archived_at: null };
  }
  // 'save' and 'dismiss' both archive the original insight.
  return { status: 'archived', done_at: null, archived_at: nowIso };
}
