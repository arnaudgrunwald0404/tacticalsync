// Shared WebVTT transcript parser — turns Zoom's raw cue text (stored
// verbatim in cos_zoom_transcripts.content, see 20260612000200_zoom_transcripts.sql)
// into structured cues with speaker + start/end timestamps.
//
// Built as a byproduct of Phase A (sentiment/talk-time — see
// PLAN_idea10_meeting_intelligence_enrichment.md §3, §4 A2) but deliberately
// shared: Phase B (Soundbites) will need the same cue boundaries for its
// cue-citation verification step (§2.1 option 2). Both should import from
// here rather than parsing VTT independently, mirroring the existing
// `_shared/` convention (matchEventToMember.ts, retryWithBackoff.ts,
// inboxTriageUtils.ts).
//
// Zoom's cloud-recording VTT shape (plan §1.2 — no literal fixture exists
// anywhere in this repo, this is the format implied by extract-zoom-quotes's
// stripVtt() and Zoom's documented transcript format):
//
//   WEBVTT
//
//   1
//   00:00:00.000 --> 00:00:04.500
//   <v Jane Smith>Hello everyone, thanks for joining.</v>
//
// Speaker identification is best-effort: a cue only carries a <v Name> tag
// when Zoom's own speaker-ID succeeded for that segment. Cues without one (or
// with a placeholder/anonymous label like "Unknown" or a raw phone number)
// come back with `speaker: null` — callers should bucket those as
// "unattributed", not silently drop them (mirrors extract-zoom-quotes's
// isNoisySpeakerName guard, reused here — see NOISY_SPEAKER_RE below).

export interface VttCue {
  /** Raw speaker label exactly as it appears in the `<v Name>` tag, or null
   *  when the cue has no voice tag at all (Zoom couldn't attribute it). */
  speaker: string | null
  text: string
  startSeconds: number
  endSeconds: number
}

// Raw transcript speaker labels that carry no useful identity — anonymous
// dial-ins, placeholder labels. Mirrors extract-zoom-quotes/index.ts's
// NOISY_SPEAKER_RE exactly — kept in sync manually since Deno functions can't
// import across function boundaries into a differently-deployed function's
// module graph the way `src/` mirrors are noted elsewhere in this repo.
const NOISY_SPEAKER_RE = /^(unknown|guest\s*\d*|\+?\d{7,})$/i

export function isNoisySpeakerName(speaker: string | null | undefined): boolean {
  const trimmed = (speaker ?? '').trim()
  if (!trimmed) return true
  return NOISY_SPEAKER_RE.test(trimmed)
}

const TIMING_RE = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/
const VOICE_TAG_RE = /^<v\s+([^>]+)>([\s\S]*)$/i

function timestampToSeconds(ts: string): number {
  const m = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(ts)
  if (!m) return 0
  const [, hh, mm, ss, ms] = m
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000
}

/**
 * Parses raw WebVTT content into an ordered list of cues. Tolerant of:
 * - a WEBVTT header line, with or without extra metadata lines below it
 * - `NOTE` comment blocks
 * - numeric-only cue-identifier lines (optional per the WebVTT spec)
 * - cue settings appended after the timing line (e.g. `align:start position:0%`)
 * - multi-line cue text
 * - cues with no `<v Name>` voice tag (speaker comes back null)
 *
 * Malformed/unparseable blocks are skipped rather than throwing — a partial
 * transcript is more useful than a hard failure on one bad block.
 */
export function parseVttToCues(vtt: string): VttCue[] {
  if (!vtt || !vtt.trim()) return []

  const normalized = vtt.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // Cue blocks are separated by one or more blank lines.
  const blocks = normalized.split(/\n\s*\n/)
  const cues: VttCue[] = []

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) continue
    if (/^NOTE/i.test(lines[0])) continue
    if (/^WEBVTT/i.test(lines[0])) continue // header block, possibly with metadata lines below it

    const timingLineIdx = lines.findIndex(l => TIMING_RE.test(l))
    if (timingLineIdx === -1) continue // no timing in this block — e.g. a stray identifier-only line

    const timingMatch = TIMING_RE.exec(lines[timingLineIdx])!
    const startSeconds = timestampToSeconds(timingMatch[1])
    const endSeconds = timestampToSeconds(timingMatch[2])
    if (endSeconds < startSeconds) continue // malformed timing — skip rather than produce a negative-duration cue

    const textLines = lines.slice(timingLineIdx + 1)
    if (textLines.length === 0) continue
    const rawText = textLines.join(' ')

    const voiceMatch = VOICE_TAG_RE.exec(rawText)
    let speaker: string | null = null
    let text = rawText
    if (voiceMatch) {
      speaker = voiceMatch[1].trim() || null
      text = voiceMatch[2].replace(/<\/v>\s*$/i, '').trim()
    }

    cues.push({ speaker, text, startSeconds, endSeconds })
  }

  return cues
}
