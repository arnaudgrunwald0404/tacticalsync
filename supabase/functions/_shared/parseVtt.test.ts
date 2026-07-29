import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { parseVttCues, cuesToPlainText, isNoisySpeakerName } from "./parseVtt.ts"

const SAMPLE_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:04.500
<v Jane Smith>Hello everyone, thanks for joining.</v>

2
00:00:04.600 --> 00:00:08.200
<v John Doe>Happy to be here.</v>

3
00:00:08.300 --> 00:00:15.000
<v Jane Smith>So, um, I wanted to, uh, talk about the roadmap for next quarter.</v>
`

Deno.test("parseVttCues extracts cue count, timestamps, speaker, and text", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  assertEquals(cues.length, 3)

  assertEquals(cues[0].index, 1)
  assertEquals(cues[0].startSeconds, 0)
  assertEquals(cues[0].endSeconds, 4.5)
  assertEquals(cues[0].speaker, "Jane Smith")
  assertEquals(cues[0].text, "Hello everyone, thanks for joining.")

  assertEquals(cues[1].startSeconds, 4.6)
  assertEquals(cues[1].endSeconds, 8.2)
  assertEquals(cues[1].speaker, "John Doe")

  assertEquals(cues[2].startSeconds, 8.3)
  assertEquals(cues[2].endSeconds, 15)
  assertEquals(cues[2].speaker, "Jane Smith")
})

Deno.test("parseVttCues handles missing/non-sequential explicit index lines by re-numbering", () => {
  const vtt = `WEBVTT

99
00:00:00.000 --> 00:00:02.000
<v A>First.</v>

00:00:02.000 --> 00:00:04.000
<v B>Second, no index line at all.</v>
`
  const cues = parseVttCues(vtt)
  assertEquals(cues.length, 2)
  // Re-numbered sequentially so citations are deterministic regardless of
  // whatever (possibly absent/non-sequential) index line was in the file.
  assertEquals(cues[0].index, 1)
  assertEquals(cues[1].index, 2)
})

Deno.test("parseVttCues supports timestamps without an hours component", () => {
  const vtt = `WEBVTT

1
00:03.000 --> 00:07.500
<v A>Short-form timestamp.</v>
`
  const cues = parseVttCues(vtt)
  assertEquals(cues.length, 1)
  assertEquals(cues[0].startSeconds, 3)
  assertEquals(cues[0].endSeconds, 7.5)
})

Deno.test("parseVttCues returns null speaker when a cue has no <v> tag", () => {
  const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
Just plain text, no voice tag.
`
  const cues = parseVttCues(vtt)
  assertEquals(cues[0].speaker, null)
  assertEquals(cues[0].text, "Just plain text, no voice tag.")
})

Deno.test("parseVttCues skips NOTE lines and blank runs without crashing", () => {
  const vtt = `WEBVTT

NOTE This is a comment, not a cue.

1
00:00:00.000 --> 00:00:02.000
<v A>Text.</v>
`
  const cues = parseVttCues(vtt)
  assertEquals(cues.length, 1)
})

Deno.test("cuesToPlainText round-trips speaker tags for callers that don't need timestamps", () => {
  const cues = parseVttCues(SAMPLE_VTT)
  const plain = cuesToPlainText(cues)
  assertEquals(plain.includes("<v Jane Smith>Hello everyone, thanks for joining.</v>"), true)
  assertEquals(plain.includes("<v John Doe>Happy to be here.</v>"), true)
})

Deno.test("isNoisySpeakerName flags anonymous/placeholder labels", () => {
  assertEquals(isNoisySpeakerName("Unknown"), true)
  assertEquals(isNoisySpeakerName("Guest 1"), true)
  assertEquals(isNoisySpeakerName("+14155551234"), true)
  assertEquals(isNoisySpeakerName("Jane Smith"), false)
  assertEquals(isNoisySpeakerName(""), true)
})
