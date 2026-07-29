// Shared VTT cue parser — turns a raw Zoom cloud-recording VTT transcript into
// structured, timestamped cues. Used by:
//   - extract-zoom-quotes/index.ts (Phase B / Soundbites): needs cue-level
//     timestamps to align a Gemini-cited quote back to a time range.
//   - (planned) a talk-time/sentiment analysis pass (Phase A, PLAN_idea10 §3):
//     needs the exact same { speaker, text, startSeconds, endSeconds }[] shape
//     for per-speaker seconds-spoken arithmetic.
//
// NOTE: PLAN_idea10_meeting_intelligence_enrichment.md §3 recommends both
// phases share a single module here rather than drift into two parsers. This
// file was written by the Soundbites (Phase B) work; if the parallel Phase A
// work also lands a `_shared/parseVtt.ts`, reconcile at merge time — pick one,
// diff the two for any format edge cases the other found, keep the tests.
//
// Zoom's VTT shape (no literal fixture ships with the repo — inferred from
// the old stripVtt() in extract-zoom-quotes and Zoom's documented transcript
// format):
//
//   WEBVTT
//
//   1
//   00:00:00.000 --> 00:00:04.500
//   <v Jane Smith>Hello everyone, thanks for joining.</v>
//
//   2
//   00:00:04.600 --> 00:00:08.200
//   <v John Doe>Happy to be here.</v>
//
// A cue's index line is *usually* present and sequential, but this parser
// doesn't require it — cues are re-numbered sequentially (1-based) in parse
// order if a numeric index line is missing, since that's the only thing a
// downstream citation ("cue 14") can reliably refer back to.

export interface VttCue {
  /** 1-based sequential position of this cue in the transcript — this is the
   *  number a "cite the cue" prompt should reference, NOT necessarily the
   *  literal index line from the VTT file (which can be absent/non-sequential
   *  in the wild; re-numbering makes citation deterministic either way). */
  index: number;
  startSeconds: number;
  endSeconds: number;
  /** Parsed from a `<v Speaker Name>` tag, if present. Null when the cue has
   *  no voice tag (Zoom's speaker ID didn't attribute the segment). */
  speaker: string | null;
  /** Cue text with any `<v ...>`/`</v>` tags stripped. */
  text: string;
}

// Raw transcript speaker labels that carry no useful identity — anonymous
// dial-ins, placeholder labels. Mirrors NOISY_SPEAKER_RE in
// extract-zoom-quotes/index.ts (kept in sync manually — Deno can't share a
// single source file across two independently-deployed functions without
// this _shared/ convention, which is exactly why this regex lives here too).
const NOISY_SPEAKER_RE = /^(unknown|guest\s*\d*|\+?\d{7,})$/i;

export function isNoisySpeakerName(speaker: string): boolean {
  const trimmed = speaker.trim();
  if (!trimmed) return true;
  return NOISY_SPEAKER_RE.test(trimmed);
}

// Parses "HH:MM:SS.mmm" or "MM:SS.mmm" (comma decimal also tolerated, as in
// SRT-flavored VTT). Returns NaN if it doesn't match either shape.
function timeToSeconds(raw: string): number {
  const t = raw.trim();
  const withHours = /^(\d+):(\d{2}):(\d{2})[.,](\d+)$/.exec(t);
  if (withHours) {
    const [, hh, mm, ss, ms] = withHours;
    return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
  }
  const noHours = /^(\d{2}):(\d{2})[.,](\d+)$/.exec(t);
  if (noHours) {
    const [, mm, ss, ms] = noHours;
    return Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
  }
  return NaN;
}

/** Parses a raw VTT transcript into an array of structured cues, in order. */
export function parseVttCues(vtt: string): VttCue[] {
  const lines = vtt.split(/\r?\n/);
  const cues: VttCue[] = [];
  let i = 0;
  let seq = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || line === 'WEBVTT' || line.startsWith('NOTE') || line.startsWith('X-TIMESTAMP-MAP')) {
      i++;
      continue;
    }

    // Optional numeric cue-index line preceding the timing line.
    let cursor = i;
    if (/^\d+$/.test(line)) {
      cursor++;
    }

    const timingLine = (lines[cursor] ?? '').trim();
    if (!timingLine.includes('-->')) {
      // Not a cue block after all (stray line) — skip forward one line so we
      // don't infinite-loop on malformed input.
      i++;
      continue;
    }
    const [startRaw, endRawFull] = timingLine.split('-->');
    const startSeconds = timeToSeconds(startRaw);
    // The end side can have trailing cue settings (e.g. "... align:start"),
    // so only take the first whitespace-delimited token.
    const endSeconds = timeToSeconds((endRawFull ?? '').trim().split(/\s+/)[0] ?? '');
    cursor++;

    const textLines: string[] = [];
    while (cursor < lines.length && lines[cursor].trim() !== '') {
      textLines.push(lines[cursor]);
      cursor++;
    }

    const rawText = textLines.join(' ').trim();
    const speakerMatch = /<v\s+([^>]+)>/i.exec(rawText);
    const speaker = speakerMatch ? speakerMatch[1].trim() : null;
    const text = rawText.replace(/<\/?v[^>]*>/gi, '').trim();

    seq++;
    cues.push({
      index: seq,
      startSeconds: Number.isFinite(startSeconds) ? startSeconds : 0,
      endSeconds: Number.isFinite(endSeconds) ? endSeconds : 0,
      speaker,
      text,
    });

    i = cursor;
  }

  return cues;
}

/** Plain speaker-tagged text, timestamp-free — equivalent to the old
 *  stripVtt() in extract-zoom-quotes/index.ts, built from parsed cues instead
 *  of a line-filter regex. Kept for callers that don't need timestamps. */
export function cuesToPlainText(cues: VttCue[]): string {
  return cues
    .map(c => (c.speaker ? `<v ${c.speaker}>${c.text}</v>` : c.text))
    .join('\n');
}
