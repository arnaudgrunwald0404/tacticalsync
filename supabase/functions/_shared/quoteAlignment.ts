// Soundbites timestamp alignment (PLAN_idea10_meeting_intelligence_enrichment.md
// §2.1 / §4 Phase B1) — the load-bearing blocker for the whole feature.
//
// The problem: Gemini's extracted quote is a *cleaned paraphrase* (filler
// words removed, per EXTRACT_PROMPT), not a verbatim substring of the raw VTT.
// You cannot indexOf() it back into the transcript to find when it was said.
//
// The approach implemented here is the plan's recommended "option 1 + option 2
// as a cross-check": the transcript sent to Gemini is annotated with a cue
// citation tag per line (buildCueAnnotatedTranscript), Gemini is asked to
// return which cue(s) a quote is drawn from, and — because a model citing a
// line number can still hallucinate a plausible-but-wrong one — the cited
// cue's actual text is fuzzy-matched against the returned quote
// (resolveQuoteTimestamp) before the timestamp is trusted. A citation that
// doesn't resolve to a real, textually-overlapping cue range degrades to "no
// clip" (null), never a wrong clip — matching the plan's explicit trust bar.

import type { VttCue } from "./parseVtt.ts";

const FILLER_WORDS = new Set(['um', 'uh', 'umm', 'uhh', 'erm', 'ah', 'hmm']);

/** Lowercases, strips punctuation, and drops disfluency filler words so
 *  "clean up filler words" (what the extraction prompt already asks Gemini to
 *  do) doesn't tank the overlap score between a quote and its source cue. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !FILLER_WORDS.has(w));
}

/** Fraction of the quote's (normalized) words that appear in the candidate
 *  window's (normalized) word set. 1.0 = every quote word is present in the
 *  window; 0 = no overlap at all. */
export function wordOverlapRatio(quote: string, windowText: string): number {
  const quoteWords = normalizeWords(quote);
  if (quoteWords.length === 0) return 0;
  const windowWordSet = new Set(normalizeWords(windowText));
  const matched = quoteWords.filter(w => windowWordSet.has(w)).length;
  return matched / quoteWords.length;
}

// Below this overlap ratio, a cue citation is treated as a hallucination and
// discarded (no clip) rather than trusted. Tuned to tolerate normal
// paraphrase-level cleanup (filler removal, minor rewording) while rejecting
// a citation that points at an unrelated part of the transcript — see
// quoteAlignment.test.ts for the calibration cases this threshold was picked
// against.
export const MIN_OVERLAP_RATIO = 0.6;

// Guards against a runaway/hallucinated cue range producing an absurdly long
// "clip" — caps how many cues a single citation can span.
export const MAX_CUE_SPAN = 8;

// Small symmetric padding added to the resolved range so playback doesn't
// clip the very first/last word of the quote at the cue boundary.
export const CLIP_PADDING_SECONDS = 0.5;

export interface ResolvedTimestamp {
  start_seconds: number;
  end_seconds: number;
}

/**
 * Resolves a Gemini-cited cue range for a quote into a verified time range,
 * or null if the citation can't be trusted.
 *
 * @param cues Parsed cues for the transcript the quote was extracted from.
 * @param quote The (possibly cleaned/paraphrased) quote text Gemini returned.
 * @param startCue 1-based cue number Gemini cited as the quote's start (per
 *   the `[cue N | HH:MM:SS]` annotation format — see buildCueAnnotatedTranscript).
 * @param endCue 1-based cue number Gemini cited as the quote's end. Defaults
 *   to startCue when omitted/invalid.
 */
export function resolveQuoteTimestamp(
  cues: VttCue[],
  quote: string,
  startCue?: number | null,
  endCue?: number | null,
): ResolvedTimestamp | null {
  if (startCue == null || !Number.isFinite(startCue) || startCue < 1) return null;

  let resolvedEndCue = endCue != null && Number.isFinite(endCue) && endCue >= startCue
    ? endCue
    : startCue;
  if (resolvedEndCue - startCue > MAX_CUE_SPAN) resolvedEndCue = startCue + MAX_CUE_SPAN;

  const cueByIndex = new Map(cues.map(c => [c.index, c]));
  const windowCues: VttCue[] = [];
  for (let n = startCue; n <= resolvedEndCue; n++) {
    const cue = cueByIndex.get(n);
    // A citation pointing at a cue number that doesn't exist is exactly the
    // "plausible-looking but wrong" hallucination the plan calls out — never
    // guess past it.
    if (!cue) return null;
    windowCues.push(cue);
  }
  if (windowCues.length === 0) return null;

  const windowText = windowCues.map(c => c.text).join(' ');
  const ratio = wordOverlapRatio(quote, windowText);
  if (ratio < MIN_OVERLAP_RATIO) return null;

  // Round to avoid binary floating-point artifacts (e.g. 4.1 - 0.5 ===
  // 3.5999999999999996) leaking into a numeric DB column / UI seek time.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const start_seconds = round2(Math.max(0, windowCues[0].startSeconds - CLIP_PADDING_SECONDS));
  const end_seconds = round2(windowCues[windowCues.length - 1].endSeconds + CLIP_PADDING_SECONDS);
  if (!(end_seconds > start_seconds)) return null;

  return { start_seconds, end_seconds };
}

function formatClockTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Builds the transcript text actually sent to Gemini: one line per cue,
 * tagged with a citation number and clock timestamp, e.g.:
 *   [cue 14 | 00:03:12] Jane Smith: Some words that were said.
 * This is what makes cue citation possible at all — the model can only cite
 * a cue number if that number is visible in what it reads. Also gives Gemini
 * a deterministic speaker label instead of asking it to parse a raw `<v
 * Name>` tag itself (the old, undocumented behavior stripVtt() left in place).
 */
export function buildCueAnnotatedTranscript(cues: VttCue[]): string {
  return cues
    .map(c => {
      const speakerLabel = c.speaker && c.speaker.trim() ? c.speaker.trim() : 'Unknown';
      return `[cue ${c.index} | ${formatClockTime(c.startSeconds)}] ${speakerLabel}: ${c.text}`;
    })
    .join('\n');
}
