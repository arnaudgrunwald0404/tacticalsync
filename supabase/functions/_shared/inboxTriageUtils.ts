/**
 * Pure helpers for the Gmail inbox triage feature.
 * Extracted from extract-inbox-action-items/index.ts so they can be
 * unit-tested independently of the edge function runtime.
 */

export type SenderTier = 'active' | 'known'
export type IntentType = 'question' | 'request' | 'introduction' | 'decision_needed' | 'fyi'

// Phase 2: surface all actionable intents; only fyi is filtered out by default.
export const SUPPRESSED_BY_DEFAULT: IntentType[] = ['fyi']

export interface SuppressionRules {
  suppressedSenders: Set<string>
  suppressedDomains: Set<string>
  suppressedIntents: Set<string>
  maxThreadAgeHours: number | null
}

export interface DismissalRecord {
  sender_email: string | null
  sender_domain: string | null
  intent_type: string | null
}

export interface InferredSuppressions {
  newSenders: string[]
  newDomains: string[]
  newIntents: string[]
}

/**
 * Classifies the sender tier based on whether the user has previously replied
 * to them. Returns null when no email address can be parsed (skip the item).
 *
 * - 'active': user has sent at least one email to this address.
 * - 'known':  sender has emailed user but user has never replied.
 * - null:     no parseable email address → skip entirely.
 */
export function classifySenderTier(
  senderEmail: string | null,
  sentAddresses: Set<string>,
): SenderTier | null {
  if (!senderEmail) return null
  return sentAddresses.has(senderEmail.toLowerCase()) ? 'active' : 'known'
}

/**
 * Returns true when a Gmail message should be suppressed before classification,
 * based on learned per-user suppression rules.
 *
 * Checks (in order):
 * 1. Sender email is in the suppressed-senders list.
 * 2. Sender domain is in the suppressed-domains list.
 * 3. Message age exceeds the configured max_thread_age_hours.
 */
export function shouldSuppressMessage(
  senderEmail: string | null,
  internalDateMs: number | null,
  rules: SuppressionRules,
): boolean {
  if (senderEmail && rules.suppressedSenders.has(senderEmail.toLowerCase())) return true

  if (senderEmail) {
    const domain = senderEmail.split('@')[1]
    if (domain && rules.suppressedDomains.has(domain.toLowerCase())) return true
  }

  if (rules.maxThreadAgeHours !== null && internalDateMs !== null) {
    const ageHours = (Date.now() - internalDateMs) / 3_600_000
    if (ageHours > rules.maxThreadAgeHours) return true
  }

  return false
}

/**
 * Returns true when an intent type should be suppressed for a Gmail item,
 * combining the global default list and per-user preferences.
 */
export function shouldSuppressIntent(
  intentType: IntentType,
  suppressedIntents: Set<string>,
): boolean {
  return SUPPRESSED_BY_DEFAULT.includes(intentType) || suppressedIntents.has(intentType)
}

/**
 * Returns true when a Slack message should be suppressed before classification,
 * based on learned per-user suppression rules. Mirrors shouldSuppressMessage,
 * but keys off Slack sender id / channel id instead of an email address+domain
 * (a Slack channel is the closest equivalent of a Gmail "domain": suppressing
 * it silences everyone posting there, same as suppressing a whole company).
 */
export function shouldSuppressSlackMessage(
  senderId: string | null,
  channelId: string | null,
  rules: SuppressionRules,
): boolean {
  if (senderId && rules.suppressedSenders.has(senderId)) return true
  if (channelId && rules.suppressedDomains.has(channelId)) return true
  return false
}

/**
 * Returns true when a Slack message should be included in the scan batch.
 *
 * DMs are always in scope. Channel messages are only included when the
 * channel name appears in the user's sync allowlist. The allowlist entries
 * are already normalized (lowercase, no leading #).
 */
export function shouldIncludeSlackMessage(
  isDm: boolean,
  channelName: string | null,
  normalizedAllowlist: string[],
): boolean {
  if (isDm) return true
  if (!channelName) return false
  return normalizedAllowlist.includes(channelName.toLowerCase())
}

/**
 * Normalizes a raw channel list entry: lower-cases and strips a leading '#'.
 */
export function normalizeChannelName(raw: string): string {
  return raw.toLowerCase().replace(/^#/, '')
}

// Local-part patterns used by transactional/notification systems across SaaS
// tools (GitHub, Ramp, etc.) — these are never worth surfacing as an inbox
// suggestion, regardless of whether the content looks actionable ("approve
// this expense", "review this PR"). Matched against the part before '@'.
const AUTOMATED_SENDER_LOCAL_PART = /^(no-?reply|do-?not-?reply|notifications?|alerts?|automated|mailer-daemon|postmaster|no-?response|bounces?|updates?|communications?|do-?not-?respond)$/i

/**
 * Returns true when a sender email address looks like an automated/system
 * notification account rather than a person — e.g. no-reply@github.com,
 * notifications@github.com, communications@ramp.com.
 */
export function isAutomatedSender(senderEmail: string | null): boolean {
  if (!senderEmail) return false
  const localPart = senderEmail.split('@')[0]
  return AUTOMATED_SENDER_LOCAL_PART.test(localPart)
}

// Calendar invite/RSVP notifications use a small, stable set of subject
// prefixes across Google Calendar, Outlook, etc. This must cover the whole
// event lifecycle — invitations, RSVPs, updates, cancels, AND propose-new-time
// notifications ("Proposed new time:" from Google Calendar, "New Time
// Proposed:" from Outlook), which are sent from the proposer's own address
// and so can't be caught by sender-based filtering.
const CALENDAR_SUBJECT_PREFIX = /^(invitation|accepted|declined|tentative|tentatively accepted|updated invitation|canceled event|cancelled event|new event|updated event|proposed new time|new time proposed|meeting forward notification)[:\s]/i

/**
 * Returns true when a Gmail message looks like a calendar invite/RSVP
 * notification rather than a real email needing a reply.
 */
export function isCalendarInvite(subject: string, senderEmail: string | null): boolean {
  if (senderEmail?.toLowerCase() === 'calendar-notification@google.com') return true
  return CALENDAR_SUBJECT_PREFIX.test(subject.trim())
}

/**
 * Parses the sender email address out of a raw "From" header value.
 * Handles plain addresses ("user@example.com") and display-name format
 * ("Display Name <user@example.com>").
 * Returns null when no valid address can be found.
 */
export function parseSenderEmail(fromHeader: string): string | null {
  const match = fromHeader.match(/[\w.+-]+@[\w.-]+\.\w+/)
  return match ? match[0].toLowerCase() : null
}

/**
 * Infers new suppression rules from the full dismissal history for a user.
 *
 * Thresholds:
 * - Suppress a sender after ≥ 5 dismissals from that address.
 * - Suppress a domain after ≥ 10 dismissals from that domain.
 * - Suppress an intent type when it accounts for > 80 % of all dismissals
 *   AND has at least 5 dismissals.
 *
 * Returns only the *new* entries to add (caller merges with existing lists).
 */
export function inferSuppressionRules(dismissals: DismissalRecord[]): InferredSuppressions {
  if (dismissals.length < 3) {
    return { newSenders: [], newDomains: [], newIntents: [] }
  }

  const senderCounts = new Map<string, number>()
  const domainCounts = new Map<string, number>()
  const intentCounts = new Map<string, number>()

  for (const d of dismissals) {
    if (d.sender_email) {
      senderCounts.set(d.sender_email, (senderCounts.get(d.sender_email) ?? 0) + 1)
    }
    if (d.sender_domain) {
      domainCounts.set(d.sender_domain, (domainCounts.get(d.sender_domain) ?? 0) + 1)
    }
    if (d.intent_type) {
      intentCounts.set(d.intent_type, (intentCounts.get(d.intent_type) ?? 0) + 1)
    }
  }

  const total = dismissals.length

  const newSenders = [...senderCounts.entries()].filter(([, n]) => n >= 5).map(([s]) => s)
  const newDomains = [...domainCounts.entries()].filter(([, n]) => n >= 10).map(([d]) => d)
  const newIntents = [...intentCounts.entries()]
    .filter(([, n]) => n >= 5 && n / total > 0.8)
    .map(([i]) => i)

  return { newSenders, newDomains, newIntents }
}

/**
 * Metadata subset of a Gmail thread message (threads.get format=minimal):
 * internalDate is epoch milliseconds serialized as a string.
 */
export interface GmailThreadMessageMeta {
  id: string
  labelIds?: string[]
  internalDate?: string
}

/**
 * Extract the Gmail threadId from the deep link stored on agent_payload.gmail_url
 * (`https://mail.google.com/mail/u/0/#inbox/<threadId>`). Returns null for the
 * bare `https://mail.google.com` fallback used when a message had no threadId.
 */
export function parseGmailThreadIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return /#inbox\/([A-Za-z0-9_-]+)/.exec(url)?.[1] ?? null
}

/**
 * True when the thread contains a message the user sent (SENT label) after the
 * flagged source message — i.e. the user has already replied, so the suggestion
 * built from that source message is handled.
 *
 * If the source message is no longer in the thread (deleted), any SENT message
 * with a valid date counts: the user participated and the trigger is gone.
 * Earlier SENT messages (e.g. the user started the thread) never count.
 */
export function hasUserReplyAfter(
  messages: GmailThreadMessageMeta[],
  sourceMessageId: string,
): boolean {
  const source = messages.find(m => m.id === sourceMessageId)
  const sourceDate = source?.internalDate ? parseInt(source.internalDate, 10) : 0
  return messages.some(m =>
    m.id !== sourceMessageId &&
    (m.labelIds ?? []).includes('SENT') &&
    (m.internalDate ? parseInt(m.internalDate, 10) : Number.NaN) > sourceDate
  )
}

/**
 * Recursive subset of the Gmail `users.messages.get?format=full` payload tree:
 * multipart messages nest their text/html parts under `parts`, and each leaf
 * carries its content base64url-encoded in `body.data`.
 */
export interface GmailPayloadPart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPayloadPart[]
}

/** Decode Gmail's base64url body data to a UTF-8 string ('' on bad input). */
export function decodeGmailBody(data: string | undefined): string {
  if (!data) return ''
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

// Links that are never "the thing this email asks you to open": list plumbing,
// legal footers, and social follow buttons. Matching is on the full URL so
// both path segments ("/unsubscribe") and query params
// ("?action=unsubscribe") are caught.
const JUNK_URL_RE = /unsubscribe|list-manage|email-preferences|manage.?preferences|privacy-?policy|terms-of/i
const SOCIAL_HOST_RE = /^(?:www\.)?(?:facebook|twitter|x|instagram|linkedin|youtube)\.com$/i
// Asset extensions — image trackers and inlined logos, not destinations.
const ASSET_URL_RE = /\.(?:png|gif|jpe?g|svg|webp|ico|css|woff2?)(?:\?|$)/i

/**
 * Collect candidate action URLs from a Gmail message body (format=full
 * payload): hrefs out of text/html parts plus bare URLs in text/plain parts,
 * deduped in document order, junk (unsubscribe/footer/social/asset/tracking-
 * pixel) links dropped. Capped at `max` so a marketing-heavy email can't
 * flood the extraction prompt.
 */
export function extractEmailBodyUrls(payload: GmailPayloadPart | undefined, max = 12): string[] {
  if (!payload) return []
  let plain = ''
  let html = ''
  const walk = (part: GmailPayloadPart) => {
    if (part.mimeType === 'text/plain') plain += decodeGmailBody(part.body?.data) + '\n'
    else if (part.mimeType === 'text/html') html += decodeGmailBody(part.body?.data) + '\n'
    part.parts?.forEach(walk)
  }
  walk(payload)

  const seen = new Set<string>()
  const urls: string[] = []
  const push = (raw: string) => {
    // Entity-decode hrefs (&amp; is ubiquitous in HTML query strings).
    const url = raw.replace(/&amp;/gi, '&').replace(/&#39;/g, "'").trim()
    if (!/^https?:\/\//i.test(url)) return
    if (url.length > 1000) return // runaway tracking blobs
    if (JUNK_URL_RE.test(url) || ASSET_URL_RE.test(url)) return
    try {
      if (SOCIAL_HOST_RE.test(new URL(url).hostname)) return
    } catch {
      return
    }
    if (seen.has(url)) return
    seen.add(url)
    urls.push(url)
  }

  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) push(m[1])
  for (const m of plain.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) push(m[0])
  return urls.slice(0, max)
}
