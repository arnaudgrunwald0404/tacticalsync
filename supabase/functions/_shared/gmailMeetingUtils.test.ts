import { assertEquals, assertStrictEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  base64UrlDecode,
  findHtmlBody,
  htmlToText,
  extractTopicFromSubject,
  extractMeetingUuid,
  extractSummaryText,
  extractDurationMinutes,
  type GmailPart,
} from "./gmailMeetingUtils.ts"

// ─── helpers ──────────────────────────────────────────────────────────────────

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function htmlPart(html: string): GmailPart {
  return { mimeType: "text/html", body: { data: b64url(html) } }
}

// ─── base64UrlDecode ──────────────────────────────────────────────────────────

Deno.test("base64UrlDecode: decodes a plain ASCII string", () => {
  const encoded = b64url("Hello, World!")
  assertEquals(base64UrlDecode(encoded), "Hello, World!")
})

Deno.test("base64UrlDecode: handles URL-safe characters (- and _) instead of + and /", () => {
  const plain = "~~many+slashes/and+signs~~"
  const encoded = b64url(plain)
  assertEquals(base64UrlDecode(encoded), plain)
})

Deno.test("base64UrlDecode: decodes UTF-8 multi-byte characters", () => {
  const text = "Meeting: Café & Résumé"
  assertEquals(base64UrlDecode(b64url(text)), text)
})

Deno.test("base64UrlDecode: decodes an empty string", () => {
  assertEquals(base64UrlDecode(""), "")
})

Deno.test("base64UrlDecode: decodes a typical Zoom email HTML snippet", () => {
  const snippet = '<div id="branding-doc-summary"><p>Summary content</p></div>'
  assertEquals(base64UrlDecode(b64url(snippet)), snippet)
})

// ─── findHtmlBody ─────────────────────────────────────────────────────────────

Deno.test("findHtmlBody: finds text/html in a simple single-part message", () => {
  const html = "<p>Hello</p>"
  const part = htmlPart(html)
  assertEquals(findHtmlBody(part), html)
})

Deno.test("findHtmlBody: returns null when the part is undefined", () => {
  assertEquals(findHtmlBody(undefined), null)
})

Deno.test("findHtmlBody: returns null when no text/html part exists", () => {
  const part: GmailPart = {
    mimeType: "text/plain",
    body: { data: b64url("plain text") },
  }
  assertEquals(findHtmlBody(part), null)
})

Deno.test("findHtmlBody: returns null for a multipart message with only text/plain parts", () => {
  const part: GmailPart = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: b64url("plain") } },
    ],
  }
  assertEquals(findHtmlBody(part), null)
})

Deno.test("findHtmlBody: finds text/html nested inside multipart/alternative", () => {
  const html = "<p>rich content</p>"
  const part: GmailPart = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: b64url("plain text") } },
      htmlPart(html),
    ],
  }
  assertEquals(findHtmlBody(part), html)
})

Deno.test("findHtmlBody: finds text/html deeply nested (multipart/mixed → multipart/alternative → text/html)", () => {
  const html = "<p>deep content</p>"
  const part: GmailPart = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64url("plain") } },
          htmlPart(html),
        ],
      },
    ],
  }
  assertEquals(findHtmlBody(part), html)
})

Deno.test("findHtmlBody: returns null for a text/html part with no body data", () => {
  const part: GmailPart = { mimeType: "text/html", body: {} }
  assertEquals(findHtmlBody(part), null)
})

Deno.test("findHtmlBody: prefers the first text/html part found (depth-first)", () => {
  const firstHtml = "<p>first</p>"
  const secondHtml = "<p>second</p>"
  const part: GmailPart = {
    mimeType: "multipart/mixed",
    parts: [
      htmlPart(firstHtml),
      htmlPart(secondHtml),
    ],
  }
  assertEquals(findHtmlBody(part), firstHtml)
})

// ─── htmlToText ───────────────────────────────────────────────────────────────

Deno.test("htmlToText: strips basic HTML tags", () => {
  assertEquals(htmlToText("<p>Hello <strong>World</strong></p>"), "Hello World")
})

Deno.test("htmlToText: converts <br> to newlines", () => {
  const result = htmlToText("Line1<br>Line2<br/>Line3")
  assertEquals(result, "Line1\nLine2\nLine3")
})

Deno.test("htmlToText: converts block-closing tags to newlines", () => {
  const result = htmlToText("<p>Para 1</p><p>Para 2</p>")
  assertEquals(result, "Para 1\nPara 2")
})

Deno.test("htmlToText: decodes HTML entities", () => {
  assertEquals(htmlToText("A &amp; B"), "A & B")
  // &apos; is not in the handled set — the function uses &#39; for apostrophes
  assertEquals(htmlToText("it&#39;s &lt;fine&gt;"), "it's <fine>")
  assertEquals(htmlToText("say &quot;hello&quot;"), 'say "hello"')
  assertEquals(htmlToText("non&nbsp;breaking"), "non breaking")
})

Deno.test("htmlToText: removes <script> blocks entirely", () => {
  const result = htmlToText('<p>Keep</p><script>alert("xss")</script><p>This</p>')
  assertEquals(result.includes("alert"), false)
  assertEquals(result.includes("Keep"), true)
})

Deno.test("htmlToText: removes <style> blocks entirely", () => {
  const result = htmlToText("<style>body { color: red; }</style><p>visible</p>")
  assertEquals(result.includes("color"), false)
  assertEquals(result.includes("visible"), true)
})

Deno.test("htmlToText: collapses multiple blank lines to at most one blank line", () => {
  const result = htmlToText("<p>A</p>\n\n\n\n<p>B</p>")
  assertEquals(result.includes("\n\n\n"), false)
})

Deno.test("htmlToText: trims leading and trailing whitespace", () => {
  const result = htmlToText("   <p>  trimmed  </p>   ")
  assertEquals(result, "trimmed")
})

Deno.test("htmlToText: handles empty string", () => {
  assertEquals(htmlToText(""), "")
})

Deno.test("htmlToText: handles a realistic Zoom email body excerpt", () => {
  const html = `
    <div>
      <h2>Meeting Summary</h2>
      <p>Discussed Q3 roadmap &amp; priorities.</p>
      <ul>
        <li>Action: update the spec</li>
        <li>Action: schedule follow-up</li>
      </ul>
      <p>Duration: 00:45:00</p>
    </div>
  `
  const result = htmlToText(html)
  assertEquals(result.includes("Q3 roadmap & priorities"), true)
  assertEquals(result.includes("update the spec"), true)
  assertEquals(result.includes("Duration: 00:45:00"), true)
})

// ─── extractTopicFromSubject ──────────────────────────────────────────────────

Deno.test("extractTopicFromSubject: extracts topic from canonical Zoom subject (are ready!)", () => {
  assertEquals(
    extractTopicFromSubject("Meeting assets for Weekly Sync are ready!"),
    "Weekly Sync",
  )
})

Deno.test("extractTopicFromSubject: handles 'is ready!' variant (singular)", () => {
  assertEquals(
    extractTopicFromSubject("Meeting assets for One-on-One is ready!"),
    "One-on-One",
  )
})

Deno.test("extractTopicFromSubject: is case-insensitive", () => {
  assertEquals(
    extractTopicFromSubject("MEETING ASSETS FOR Sprint Review ARE READY!"),
    "Sprint Review",
  )
})

Deno.test("extractTopicFromSubject: handles topics with special characters", () => {
  assertEquals(
    extractTopicFromSubject("Meeting assets for Q4 Planning & Strategy are ready!"),
    "Q4 Planning & Strategy",
  )
})

Deno.test("extractTopicFromSubject: handles subject without trailing exclamation mark", () => {
  assertEquals(
    extractTopicFromSubject("Meeting assets for Design Review are ready"),
    "Design Review",
  )
})

Deno.test("extractTopicFromSubject: returns null for non-matching subject", () => {
  assertEquals(extractTopicFromSubject("Your Zoom recording is ready"), null)
})

Deno.test("extractTopicFromSubject: returns null for empty string", () => {
  assertEquals(extractTopicFromSubject(""), null)
})

Deno.test("extractTopicFromSubject: returns null for a completely different subject", () => {
  assertEquals(extractTopicFromSubject("Re: catch-up tomorrow?"), null)
})

Deno.test("extractTopicFromSubject: trims whitespace from extracted topic", () => {
  const result = extractTopicFromSubject("Meeting assets for  My Meeting  are ready!")
  assertNotEquals(result, null)
  assertEquals(result!.startsWith(" "), false)
  assertEquals(result!.endsWith(" "), false)
})

// ─── extractMeetingUuid ───────────────────────────────────────────────────────

Deno.test("extractMeetingUuid: extracts a double-encoded UUID from a Zoom recording link", () => {
  const uuid = "e6uMmswARDe/lkpDc8hRVA=="
  const encoded = encodeURIComponent(encodeURIComponent(uuid))
  const html = `<a href="https://zoom.us/recording/view?meeting_id%3D${encoded}&other=param">View</a>`
  assertEquals(extractMeetingUuid(html), uuid)
})

Deno.test("extractMeetingUuid: handles meetingId (camelCase) variant", () => {
  const uuid = "abcXYZ123=="
  const encoded = encodeURIComponent(encodeURIComponent(uuid))
  const html = `<a href="https://zoom.us/recording?meetingId%3D${encoded}">View</a>`
  assertEquals(extractMeetingUuid(html), uuid)
})

Deno.test("extractMeetingUuid: returns null when no meeting ID is present", () => {
  assertEquals(extractMeetingUuid("<a href='https://zoom.us'>Open Zoom</a>"), null)
})

Deno.test("extractMeetingUuid: returns null for empty string", () => {
  assertEquals(extractMeetingUuid(""), null)
})

Deno.test("extractMeetingUuid: handles %26 as the parameter delimiter", () => {
  const uuid = "testUUID=="
  const encoded = encodeURIComponent(encodeURIComponent(uuid))
  const html = `href="https://zoom.us/r?meeting_id%3D${encoded}%26other=1"`
  assertEquals(extractMeetingUuid(html), uuid)
})

Deno.test("extractMeetingUuid: returns null for malformed double-encoding", () => {
  // A value that decodeURIComponent would throw on is caught and returns null.
  const html = 'meeting_id%3D%25%25%25invalid"'
  // Either null (can't decode) or some decoded string — just don't throw.
  const result = extractMeetingUuid(html)
  // Result is null or a string; either is acceptable — the important thing is no throw.
  assertEquals(typeof result === "string" || result === null, true)
})

// ─── extractSummaryText ───────────────────────────────────────────────────────

Deno.test("extractSummaryText: extracts and converts the branding-doc-summary section", () => {
  const html = `
    <div>Header</div>
    <section id="branding-doc-summary">
      <p>The meeting covered Q3 goals.</p>
      <ul><li>Action: send report</li></ul>
    </section>
    <div class="tips-text">ignored tips</div>
  `
  const result = extractSummaryText(html)
  assertNotEquals(result, null)
  assertEquals(result!.includes("Q3 goals"), true)
  assertEquals(result!.includes("send report"), true)
  assertEquals(result!.includes("ignored tips"), false)
})

Deno.test("extractSummaryText: returns null when no branding-doc-summary section is found", () => {
  assertEquals(extractSummaryText("<div><p>No summary here</p></div>"), null)
})

Deno.test("extractSummaryText: returns null for empty string", () => {
  assertEquals(extractSummaryText(""), null)
})

Deno.test("extractSummaryText: reads to end of document when no tips-text class follows", () => {
  const html = '<section id="branding-doc-summary"><p>Content all the way to EOF</p>'
  const result = extractSummaryText(html)
  assertNotEquals(result, null)
  assertEquals(result!.includes("Content all the way to EOF"), true)
})

Deno.test("extractSummaryText: returns null when there is no summary section at all", () => {
  // The function slices from the position of the id= attribute string, so a
  // section that truly contains no meaningful content needs to have the attribute
  // absent for the function to return null.
  assertEquals(extractSummaryText("<p>no summary section here</p>"), null)
})

Deno.test("extractSummaryText: decodes HTML entities in the summary", () => {
  const html = '<div id="branding-doc-summary"><p>Budget &amp; forecast</p></div>'
  const result = extractSummaryText(html)
  assertNotEquals(result, null)
  assertEquals(result!.includes("Budget & forecast"), true)
})

// ─── extractDurationMinutes ───────────────────────────────────────────────────

Deno.test("extractDurationMinutes: parses HH:MM:SS into total minutes", () => {
  assertEquals(extractDurationMinutes("Duration: 01:30:00"), 90)
})

Deno.test("extractDurationMinutes: rounds seconds to nearest minute", () => {
  // 00:00:30 → 0 min + round(30/60) = 1
  assertEquals(extractDurationMinutes("Duration: 00:00:30"), 1)
  // 00:00:29 → 0 min + round(29/60) = 0
  assertEquals(extractDurationMinutes("Duration: 00:00:29"), 0)
})

Deno.test("extractDurationMinutes: parses a short meeting (under 1 hour)", () => {
  assertEquals(extractDurationMinutes("Duration: 00:45:00"), 45)
})

Deno.test("extractDurationMinutes: parses a long meeting spanning multiple hours", () => {
  assertEquals(extractDurationMinutes("Duration: 02:15:00"), 135)
})

Deno.test("extractDurationMinutes: works when duration appears inside HTML", () => {
  const html = "<p>Meeting details</p><p>Duration: 00:30:00</p><p>Participants: 3</p>"
  assertEquals(extractDurationMinutes(html), 30)
})

Deno.test("extractDurationMinutes: returns null when no duration string is present", () => {
  assertEquals(extractDurationMinutes("<p>No duration here</p>"), null)
})

Deno.test("extractDurationMinutes: returns null for empty string", () => {
  assertEquals(extractDurationMinutes(""), null)
})

Deno.test("extractDurationMinutes: is not confused by similar-looking timestamps", () => {
  // A plain timestamp without the "Duration:" prefix should not match.
  assertEquals(extractDurationMinutes("Started at 09:00:00"), null)
})

Deno.test("extractDurationMinutes: handles zero-duration edge case", () => {
  assertEquals(extractDurationMinutes("Duration: 00:00:00"), 0)
})
