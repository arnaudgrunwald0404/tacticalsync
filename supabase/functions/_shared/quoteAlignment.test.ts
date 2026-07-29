// Validation for PLAN_idea10 §2.1's "highest-severity risk in this entire
// plan" — that Gemini's cleaned/paraphrased quote can be reliably mapped back
// to a time range in the raw VTT via cue citation + fuzzy verification.
//
// This is the real test the plan's B1 gate calls for: a representative VTT
// sample with known cue timestamps, a Gemini-style cleaned quote (filler
// words removed, per EXTRACT_PROMPT's own instruction), and an assertion that
// the resolved time range is the *correct* one — not just "some" range.

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { parseVttCues } from "./parseVtt.ts"
import {
  buildCueAnnotatedTranscript,
  resolveQuoteTimestamp,
  wordOverlapRatio,
  MAX_CUE_SPAN,
} from "./quoteAlignment.ts"

// A representative 6-cue snippet of a 1:1, timestamps chosen to be easy to
// hand-verify. Cue 2 and cues 4-5 contain disfluencies exactly like the ones
// EXTRACT_PROMPT tells Gemini to clean up ("um", "uh", "you know").
const SAMPLE_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:04.000
<v Jane Smith>Hey team, thanks everyone for hopping on.</v>

2
00:00:04.100 --> 00:00:10.500
<v Jane Smith>So, um, I wanted to, uh, talk about the roadmap for next quarter, you know, before we dive into specifics.</v>

3
00:00:10.600 --> 00:00:14.000
<v John Doe>Sounds good, go ahead.</v>

4
00:00:14.100 --> 00:00:20.000
<v Jane Smith>I really think we need to double down on onboarding, it's the single biggest lever we have.</v>

5
00:00:20.100 --> 00:00:26.000
<v Jane Smith>If we get that right, everything else compounds from there.</v>

6
00:00:26.100 --> 00:00:30.000
<v John Doe>Completely agree, let's prioritize it.</v>
`

Deno.test("buildCueAnnotatedTranscript produces citable [cue N | timestamp] lines Gemini can reference", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  const annotated = buildCueAnnotatedTranscript(cues)
  assert(annotated.includes("[cue 2 | 00:00:04] Jane Smith:"))
  assert(annotated.includes("[cue 4 | 00:00:14] Jane Smith:"))
})

Deno.test("resolveQuoteTimestamp: a single-cue cleaned/paraphrased quote resolves to the correct time range", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  // What Gemini would plausibly return per EXTRACT_PROMPT's "clean up filler
  // words like 'um', 'uh', 'you know'" instruction, citing cue 2.
  const cleanedQuote = "I wanted to talk about the roadmap for next quarter before we dive into specifics."

  // Prove the naive approach this plan explicitly rejects would fail: the
  // cleaned quote is NOT a verbatim substring of the raw cue text.
  const rawCueText = cues[1].text
  assertEquals(rawCueText.includes(cleanedQuote), false)

  const resolved = resolveQuoteTimestamp(cues, cleanedQuote, 2, 2)
  assert(resolved !== null, "expected a resolved timestamp for a legitimately-cited cue")
  // Cue 2 spans 4.1s–10.5s; expect the resolved range to match within the
  // fixed 0.5s padding.
  assertEquals(resolved!.start_seconds, 3.6)
  assertEquals(resolved!.end_seconds, 11)
})

Deno.test("resolveQuoteTimestamp: a quote combining two consecutive cues spans both correctly", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  const combinedQuote = "We need to double down on onboarding — if we get that right, everything else compounds."
  const resolved = resolveQuoteTimestamp(cues, combinedQuote, 4, 5)
  assert(resolved !== null)
  // Cue 4 starts 14.1s, cue 5 ends 26.0s.
  assertEquals(resolved!.start_seconds, 13.6)
  assertEquals(resolved!.end_seconds, 26.5)
})

Deno.test("resolveQuoteTimestamp: rejects a hallucinated citation with no real text overlap (never a wrong clip)", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  // A plausible-sounding quote that was never actually said, cited against an
  // unrelated cue (3: "Sounds good, go ahead.").
  const hallucinated = "We should double our marketing spend this quarter and hire two more reps."
  const resolved = resolveQuoteTimestamp(cues, hallucinated, 3, 3)
  assertEquals(resolved, null)
})

Deno.test("resolveQuoteTimestamp: rejects a citation pointing at a cue number that doesn't exist", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  const resolved = resolveQuoteTimestamp(cues, "Anything at all.", 99, 99)
  assertEquals(resolved, null)
})

Deno.test("resolveQuoteTimestamp: no citation at all (Gemini declined to guess) yields no clip, not a guess", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  const resolved = resolveQuoteTimestamp(cues, "I really think we need to double down on onboarding.", null, null)
  assertEquals(resolved, null)
})

Deno.test("resolveQuoteTimestamp: an out-of-order end cue before start cue falls back to a single-cue window", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  const resolved = resolveQuoteTimestamp(cues, "Sounds good, go ahead.", 3, 1)
  assert(resolved !== null)
  assertEquals(resolved!.start_seconds, 10.1) // cue 3 start (10.6) - 0.5 padding
  assertEquals(resolved!.end_seconds, 14.5)   // cue 3 end (14.0) + 0.5 padding
})

Deno.test("resolveQuoteTimestamp: clamps a runaway cue span to MAX_CUE_SPAN instead of trusting it blindly", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  // A citation spanning far more cues than exist in this fixture but with a
  // valid, overlapping start — end_cue should be clamped, not looked up as-is.
  const resolved = resolveQuoteTimestamp(cues, "Hey team thanks everyone for hopping on", 1, 1 + MAX_CUE_SPAN + 5)
  // Clamped end cue (1 + MAX_CUE_SPAN = 9) doesn't exist in this 6-cue sample,
  // so this must degrade to null rather than silently using whatever it can find.
  assertEquals(resolved, null)
})

Deno.test("wordOverlapRatio treats filler-word cleanup as a near-perfect match", () => {
  const raw = "So, um, I wanted to, uh, talk about the roadmap for next quarter, you know, before we dive into specifics."
  const cleaned = "I wanted to talk about the roadmap for next quarter before we dive into specifics."
  const ratio = wordOverlapRatio(cleaned, raw)
  assert(ratio >= 0.95, `expected near-perfect overlap after filler removal, got ${ratio}`)
})

Deno.test("wordOverlapRatio scores an unrelated sentence low", () => {
  const raw = "Sounds good, go ahead."
  const unrelated = "We should double our marketing spend this quarter and hire two more reps."
  const ratio = wordOverlapRatio(unrelated, raw)
  assert(ratio < 0.3, `expected low overlap for an unrelated sentence, got ${ratio}`)
})
