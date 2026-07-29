import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { computeTalkTime, talkTimeRatios, UNATTRIBUTED_SPEAKER_KEY } from "./talkTime.ts"
import type { VttCue } from "./parseVtt.ts"

function cue(speaker: string | null, startSeconds: number, endSeconds: number, text = "x"): VttCue {
  return { speaker, text, startSeconds, endSeconds }
}

Deno.test("computeTalkTime: sums duration per speaker across cues", () => {
  const cues = [
    cue("Jane Smith", 0, 10),
    cue("John Doe", 10, 15),
    cue("Jane Smith", 15, 20),
  ]
  const result = computeTalkTime(cues)
  assertEquals(result.secondsBySpeaker, { "Jane Smith": 15, "John Doe": 5 })
  assertEquals(result.meetingDurationSeconds, 20)
})

Deno.test("computeTalkTime: buckets null-speaker cues as unattributed", () => {
  const cues = [
    cue("Jane Smith", 0, 10),
    cue(null, 10, 12),
  ]
  const result = computeTalkTime(cues)
  assertEquals(result.secondsBySpeaker["Jane Smith"], 10)
  assertEquals(result.secondsBySpeaker[UNATTRIBUTED_SPEAKER_KEY], 2)
})

Deno.test("computeTalkTime: buckets noisy/placeholder speaker labels as unattributed too", () => {
  const cues = [
    cue("Jane Smith", 0, 10),
    cue("Guest 3", 10, 14),
    cue("+14155551234", 14, 16),
  ]
  const result = computeTalkTime(cues)
  assertEquals(result.secondsBySpeaker["Jane Smith"], 10)
  assertEquals(result.secondsBySpeaker[UNATTRIBUTED_SPEAKER_KEY], 6)
  assertEquals(result.secondsBySpeaker["Guest 3"], undefined)
})

Deno.test("computeTalkTime: meetingDurationSeconds is the latest cue end-time, not the sum of durations", () => {
  // Two speakers talking about the same 0-10s window (overlap) — duration
  // sum would be 20s but the meeting itself is only 10s long.
  const cues = [
    cue("Jane Smith", 0, 10),
    cue("John Doe", 0, 10),
  ]
  const result = computeTalkTime(cues)
  assertEquals(result.meetingDurationSeconds, 10)
})

Deno.test("computeTalkTime: ignores negative-duration cues defensively (clamped to 0)", () => {
  // parseVttToCues already filters these out, but the arithmetic itself
  // should never produce a negative talk-time contribution.
  const cues = [cue("Jane Smith", 10, 5)]
  const result = computeTalkTime(cues)
  assertEquals(result.secondsBySpeaker["Jane Smith"], 0)
})

Deno.test("computeTalkTime: empty cue list yields empty result", () => {
  const result = computeTalkTime([])
  assertEquals(result.secondsBySpeaker, {})
  assertEquals(result.meetingDurationSeconds, 0)
})

// ─── talkTimeRatios ───────────────────────────────────────────────────────────

Deno.test("talkTimeRatios: divides each speaker's seconds by total meeting duration", () => {
  const cues = [
    cue("Jane Smith", 0, 60),
    cue("John Doe", 60, 100),
  ]
  const result = computeTalkTime(cues)
  const ratios = talkTimeRatios(result)
  assertEquals(ratios["Jane Smith"], 0.6)
  assertEquals(ratios["John Doe"], 0.4)
})

Deno.test("talkTimeRatios: returns {} when meeting duration is 0 (no cues)", () => {
  const result = computeTalkTime([])
  assertEquals(talkTimeRatios(result), {})
})

Deno.test("talkTimeRatios: ratios need not sum to 1 when there's overlap or silence", () => {
  const cues = [
    cue("Jane Smith", 0, 10), // overlapping window
    cue("John Doe", 0, 10),
  ]
  const result = computeTalkTime(cues)
  const ratios = talkTimeRatios(result)
  // Both speakers "fill" the same 10s window — total meeting duration is
  // 10s, so each ratio is 1.0, summing to 2.0, not 1.0. This is intentional.
  assertEquals(ratios["Jane Smith"], 1)
  assertEquals(ratios["John Doe"], 1)
})
