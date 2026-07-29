import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { parseVttToCues, isNoisySpeakerName } from "./parseVtt.ts"

// ─── parseVttToCues ───────────────────────────────────────────────────────────

Deno.test("parseVttToCues: parses the standard Zoom VTT shape (plan §1.2)", () => {
  const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:04.500
<v Jane Smith>Hello everyone, thanks for joining.</v>

2
00:00:04.600 --> 00:00:08.200
<v John Doe>Happy to be here.</v>
`
  const cues = parseVttToCues(vtt)
  assertEquals(cues.length, 2)
  assertEquals(cues[0], { speaker: "Jane Smith", text: "Hello everyone, thanks for joining.", startSeconds: 0, endSeconds: 4.5 })
  assertEquals(cues[1], { speaker: "John Doe", text: "Happy to be here.", startSeconds: 4.6, endSeconds: 8.2 })
})

Deno.test("parseVttToCues: handles a WEBVTT header with extra metadata lines", () => {
  const vtt = `WEBVTT
Kind: captions
Language: en

1
00:00:00.000 --> 00:00:02.000
<v Jane Smith>Hi.</v>
`
  const cues = parseVttToCues(vtt)
  assertEquals(cues.length, 1)
  assertEquals(cues[0].speaker, "Jane Smith")
})

Deno.test("parseVttToCues: skips NOTE comment blocks", () => {
  const vtt = `WEBVTT

NOTE
This is a comment that should be ignored.

1
00:00:00.000 --> 00:00:02.000
<v Jane Smith>Hi.</v>
`
  const cues = parseVttToCues(vtt)
  assertEquals(cues.length, 1)
  assertEquals(cues[0].text, "Hi.")
})

Deno.test("parseVttToCues: tolerates cue settings appended after the timing line", () => {
  const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.000 align:start position:0%
<v Jane Smith>Hi.</v>
`
  const cues = parseVttToCues(vtt)
  assertEquals(cues.length, 1)
  assertEquals(cues[0].startSeconds, 0)
  assertEquals(cues[0].endSeconds, 2)
})

Deno.test("parseVttToCues: cues with no <v Name> tag come back with speaker: null", () => {
  const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
Hello, can everyone hear me?
`
  const cues = parseVttToCues(vtt)
  assertEquals(cues.length, 1)
  assertEquals(cues[0].speaker, null)
  assertEquals(cues[0].text, "Hello, can everyone hear me?")
})

Deno.test("parseVttToCues: handles multi-line cue text", () => {
  const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:04.000
<v Jane Smith>This is a long sentence
that wraps across two lines.</v>
`
  const cues = parseVttToCues(vtt)
  assertEquals(cues.length, 1)
  assertEquals(cues[0].text, "This is a long sentence that wraps across two lines.")
})

Deno.test("parseVttToCues: skips a cue with malformed (end before start) timing", () => {
  const vtt = `WEBVTT

1
00:00:10.000 --> 00:00:05.000
<v Jane Smith>Weird.</v>

2
00:00:10.000 --> 00:00:12.000
<v Jane Smith>Fine.</v>
`
  const cues = parseVttToCues(vtt)
  assertEquals(cues.length, 1)
  assertEquals(cues[0].text, "Fine.")
})

Deno.test("parseVttToCues: returns an empty array for empty/blank input", () => {
  assertEquals(parseVttToCues(""), [])
  assertEquals(parseVttToCues("   \n\n  "), [])
})

Deno.test("parseVttToCues: returns an empty array when there's no timing anywhere", () => {
  const vtt = `WEBVTT

Just some stray text with no timing line at all.
`
  assertEquals(parseVttToCues(vtt), [])
})

Deno.test("parseVttToCues: normalizes CRLF line endings", () => {
  const vtt = "WEBVTT\r\n\r\n1\r\n00:00:00.000 --> 00:00:02.000\r\n<v Jane Smith>Hi.</v>\r\n"
  const cues = parseVttToCues(vtt)
  assertEquals(cues.length, 1)
  assertEquals(cues[0].speaker, "Jane Smith")
})

// ─── isNoisySpeakerName ───────────────────────────────────────────────────────

Deno.test("isNoisySpeakerName: flags 'Unknown'", () => {
  assertEquals(isNoisySpeakerName("Unknown"), true)
  assertEquals(isNoisySpeakerName("unknown"), true)
})

Deno.test("isNoisySpeakerName: flags 'Guest' with or without a number", () => {
  assertEquals(isNoisySpeakerName("Guest"), true)
  assertEquals(isNoisySpeakerName("Guest 12"), true)
})

Deno.test("isNoisySpeakerName: flags a raw phone-number dial-in label", () => {
  assertEquals(isNoisySpeakerName("+14155551234"), true)
})

Deno.test("isNoisySpeakerName: flags null/undefined/empty", () => {
  assertEquals(isNoisySpeakerName(null), true)
  assertEquals(isNoisySpeakerName(undefined), true)
  assertEquals(isNoisySpeakerName("   "), true)
})

Deno.test("isNoisySpeakerName: does not flag a real name", () => {
  assertEquals(isNoisySpeakerName("Jane Smith"), false)
})
