// Pure talk-time arithmetic over parsed VTT cues — no LLM call needed (plan
// §4 A2). Kept separate from parseVtt.ts so the two units of logic (parsing
// vs. arithmetic) each stay independently testable.

import { type VttCue, isNoisySpeakerName } from "./parseVtt.ts"

/** Bucket key used for cues with no `<v Name>` tag, or a noisy/placeholder
 *  label (isNoisySpeakerName) — deliberately a sibling of real speaker names
 *  in the same map rather than a separate field, matching the plan's
 *  `cos_meeting_analysis.talk_time_seconds` shape (§4 A1):
 *  `{ "Jane Smith": 340, "John Doe": 210, "unattributed": 45 }`. */
export const UNATTRIBUTED_SPEAKER_KEY = 'unattributed'

export interface TalkTimeResult {
  /** Seconds spoken per raw speaker-name string, keyed exactly as the
   *  transcript's `<v Name>` tag reads (plus UNATTRIBUTED_SPEAKER_KEY). This
   *  is deliberately NOT resolved to a `cos_team_members.id` here — see the
   *  plan's rationale (§4 A1) for keeping storage name-keyed and resolving
   *  display identity at read time instead. */
  secondsBySpeaker: Record<string, number>
  /** The meeting's total duration as implied by the transcript itself (the
   *  latest cue end-time) — used as the ratio denominator, not the sum of
   *  spoken seconds, so overlapping/cross-talk cues don't inflate ratios
   *  past what "total meeting duration" should mean. */
  meetingDurationSeconds: number
}

/** Sums (endSeconds - startSeconds) per speaker across all cues. */
export function computeTalkTime(cues: VttCue[]): TalkTimeResult {
  const secondsBySpeaker: Record<string, number> = {}
  let meetingDurationSeconds = 0

  for (const cue of cues) {
    const duration = Math.max(0, cue.endSeconds - cue.startSeconds)
    meetingDurationSeconds = Math.max(meetingDurationSeconds, cue.endSeconds)

    const key = isNoisySpeakerName(cue.speaker) ? UNATTRIBUTED_SPEAKER_KEY : (cue.speaker as string).trim()
    secondsBySpeaker[key] = (secondsBySpeaker[key] ?? 0) + duration
  }

  return { secondsBySpeaker, meetingDurationSeconds }
}

/**
 * Per-speaker talk-time ratio (0-1): speaking duration for that speaker
 * divided by the total meeting duration. Ratios need not sum to exactly 1 —
 * silence and cross-talk both mean spoken time doesn't perfectly partition
 * wall-clock time, and that's expected, not a bug.
 */
export function talkTimeRatios(result: TalkTimeResult): Record<string, number> {
  if (result.meetingDurationSeconds <= 0) return {}
  const ratios: Record<string, number> = {}
  for (const [speaker, seconds] of Object.entries(result.secondsBySpeaker)) {
    ratios[speaker] = seconds / result.meetingDurationSeconds
  }
  return ratios
}
