import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { pickAudioFile, contentTypeFor, type RecordingFile } from "./pickAudioFile.ts"

function file(file_type: string, id = file_type.toLowerCase()): RecordingFile {
  return { id, file_type, download_url: `https://zoom.example/${id}` }
}

Deno.test("pickAudioFile prefers M4A (audio-only) over MP4 (video)", () => {
  const files = [file('MP4'), file('M4A'), file('TRANSCRIPT'), file('CHAT')]
  const picked = pickAudioFile(files)
  assertEquals(picked?.file_type, 'M4A')
})

Deno.test("pickAudioFile falls back to MP4 when no M4A exists", () => {
  const files = [file('TRANSCRIPT'), file('MP4'), file('CC')]
  const picked = pickAudioFile(files)
  assertEquals(picked?.file_type, 'MP4')
})

Deno.test("pickAudioFile returns null when neither M4A nor MP4 exist", () => {
  const files = [file('TRANSCRIPT'), file('CHAT'), file('SUMMARY')]
  assertEquals(pickAudioFile(files), null)
})

Deno.test("pickAudioFile returns null for an empty file list", () => {
  assertEquals(pickAudioFile([]), null)
})

Deno.test("contentTypeFor maps file types to sensible MIME types", () => {
  assertEquals(contentTypeFor(file('M4A')), 'audio/mp4')
  assertEquals(contentTypeFor(file('MP4')), 'video/mp4')
  assertEquals(contentTypeFor(file('TRANSCRIPT')), 'application/octet-stream')
})
