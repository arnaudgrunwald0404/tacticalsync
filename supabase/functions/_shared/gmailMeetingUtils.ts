/**
 * Pure helpers for parsing Zoom "Meeting assets ready" emails from Gmail.
 * Extracted from gmail-meeting-assets-sync/index.ts so they can be unit-tested
 * independently of the edge function runtime.
 */

export interface GmailPart {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}

/** Decodes a base64url-encoded string to UTF-8 text. */
export function base64UrlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/** Depth-first search for the text/html part of a (possibly multipart) message. */
export function findHtmlBody(part: GmailPart | undefined): string | null {
  if (!part) return null
  if (part.mimeType === 'text/html' && part.body?.data) return base64UrlDecode(part.body.data)
  for (const child of part.parts ?? []) {
    const found = findHtmlBody(child)
    if (found) return found
  }
  return null
}

/** Converts a raw HTML string to readable plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Extracts the meeting topic from a Zoom assets email subject line.
 * Matches subjects like "Meeting assets for {topic} are ready!" or
 * "Meeting assets for {topic} is ready!".
 */
export function extractTopicFromSubject(subject: string): string | null {
  const m = subject.match(/^Meeting assets for (.+?)\s+(?:is|are) ready!?\s*$/i)
  return m ? m[1].trim() : null
}

/**
 * Extracts the Zoom meeting UUID from the HTML body of a Zoom assets email.
 * The UUID is double-URL-encoded inside "View in Zoom" / recording links,
 * e.g. meeting_id%3De6uMmswARDe%252FlkpDc8hRVA%253D%253D.
 */
export function extractMeetingUuid(html: string): string | null {
  const m = html.match(/meeting_?[Ii]d%3D([^"&]+?)(?:%26|&|")/)
  if (!m) return null
  try {
    return decodeURIComponent(decodeURIComponent(m[1]))
  } catch {
    return null
  }
}

/**
 * Slices out the "Meeting summary" section (id="branding-doc-summary") from
 * a Zoom assets email and converts it to plain text.
 */
export function extractSummaryText(html: string): string | null {
  const start = html.indexOf('id="branding-doc-summary"')
  if (start === -1) return null
  const tipsIdx = html.indexOf('class="tips-text"', start)
  const end = tipsIdx === -1 ? html.length : tipsIdx
  const text = htmlToText(html.slice(start, end))
  return text.length > 0 ? text : null
}

/**
 * Extracts meeting duration in minutes from a Zoom assets email body.
 * Looks for "Duration: HH:MM:SS".
 */
export function extractDurationMinutes(html: string): number | null {
  const m = html.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, hh, mm, ss] = m
  return parseInt(hh, 10) * 60 + parseInt(mm, 10) + Math.round(parseInt(ss, 10) / 60)
}
